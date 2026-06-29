import axios from 'axios';
import { Product, NutritionData } from '../types';
import { getProductFromCatalog } from './productCatalog';

const PRIMARY_FOOD_URL = 'https://world.openfoodfacts.org/api/v2';
const BACKUP_FOOD_URL = 'https://in.openfoodfacts.org/api/v2';       // India-specific
const WORLD_BACKUP_URL = 'https://world.openfoodfacts.org/api/v0';   // v0 fallback (broader coverage)
const BEAUTY_URL = 'https://world.openbeautyfacts.org/api/v2';

const FIELDS = [
    'product_name',
    'brands',
    'quantity',
    'image_url',
    'image_front_url',
    'nutriments',
    'nutrition_grades',
    'nova_group',
    'ingredients_text',
    'ingredients_text_en',
    'additives_tags',
    'categories_tags',
    'allergens_from_ingredients',
].join(',');

// Open Food Facts asks every client to send a descriptive User-Agent (app + contact);
// generic/empty UAs get rate-limited or 503'd. Keep this non-personal.
const OFF_HEADERS = {
    'User-Agent': 'PadhoLabel/4.0 (+https://github.com/subhamlistingsmanager/padho-label)',
};

/**
 * Map Open Food Facts `categories_tags` (e.g. ["en:biscuits","en:sugary-snacks"])
 * to a scoring sub-category the rating engine has tuned thresholds for. Ordered
 * most-specific first so e.g. biscuits win over the generic "snacks".
 */
const CATEGORY_MATCHERS: [RegExp, string][] = [
    [/biscuit/, 'biscuits'],
    [/cookie/, 'cookies'],
    [/cereal/, 'cereals'],
    [/breakfast/, 'breakfast'],
    [/\boils?\b|vegetable-oil|olive-oil|ghee/, 'oils'],
    [/soda|carbonated|cola|energy-drink|soft-drink/, 'drinks'],
    [/juice|beverage|drinks|tea|coffee|squash/, 'beverages'],
    [/dair|milk|yogurt|yoghurt|cheese|curd|paneer/, 'dairy'],
    [/snack|chips|crisps|namkeen|wafer|nachos/, 'snacks'],
];

export function deriveSubCategory(categoriesTags?: string[]): string | undefined {
    if (!Array.isArray(categoriesTags) || categoriesTags.length === 0) return undefined;
    const joined = categoriesTags.join(' ').toLowerCase();
    for (const [re, key] of CATEGORY_MATCHERS) {
        if (re.test(joined)) return key;
    }
    return undefined;
}

function safeNum(val: any): number | undefined {
    const n = parseFloat(val);
    return isNaN(n) ? undefined : n;
}

type LookupResult = { product: any | null; networkError: boolean };

/**
 * Fetch a single endpoint. Distinguishes a genuine "product not in DB"
 * (networkError: false, product: null) from a connectivity failure
 * (networkError: true) so the caller can retry blips instead of treating
 * them as "not found".
 */
const performLookup = async (url: string, withFields: boolean): Promise<LookupResult> => {
    try {
        const response = await axios.get(url, {
            params: withFields ? { fields: FIELDS } : undefined,
            headers: OFF_HEADERS,
            timeout: 8000,
        });
        if (response.data?.status === 0 || !response.data?.product) {
            return { product: null, networkError: false };
        }
        return { product: response.data.product, networkError: false };
    } catch {
        return { product: null, networkError: true };
    }
};

/** Search Open Food Facts by product name */
export const searchProducts = async (query: string, limit = 20): Promise<Product[]> => {
    try {
        const response = await axios.get('https://world.openfoodfacts.org/cgi/search.pl', {
            params: {
                search_terms: query,
                search_simple: 1,
                action: 'process',
                json: 1,
                page_size: limit,
                fields: FIELDS,
            },
            headers: OFF_HEADERS,
            timeout: 8000,
        });

        const products = response.data?.products;
        if (!Array.isArray(products)) return [];

        return products
            .filter((p: any) => p.product_name)
            .map((productData: any) => mapProductData(productData, productData.code || ''));
    } catch {
        return [];
    }
};

function mapProductData(productData: any, barcode: string, isCosmetic = false): Product {
    const n = productData.nutriments || {};

    // Energy: always store as kJ internally.
    // OFF stores energy-kj_100g and energy-kcal_100g separately.
    let energyKj = safeNum(n['energy-kj_100g']);
    const energyKcal = safeNum(n['energy-kcal_100g']) ?? safeNum(n['energy_100g']);
    if (energyKj == null && energyKcal != null) {
        energyKj = Math.round(energyKcal * 4.184);
    }

    const nutrition: NutritionData = {
        energy_100g: energyKj,
        sugars_100g: safeNum(n.sugars_100g),
        fat_100g: safeNum(n.fat_100g),
        saturated_fat_100g: safeNum(n['saturated-fat_100g']),
        trans_fat_100g: safeNum(n['trans-fat_100g']),
        salt_100g: safeNum(n.salt_100g),
        sodium_100g: safeNum(n.sodium_100g),
        fiber_100g: safeNum(n.fiber_100g),
        proteins_100g: safeNum(n.proteins_100g),
        carbohydrates_100g: safeNum(n.carbohydrates_100g),
        cholesterol_mg_100g: safeNum(n['cholesterol_100g']) != null
            ? safeNum(n['cholesterol_100g'])! * 1000   // OFF stores in g, we want mg
            : safeNum(n['cholesterol_mg_100g']),        // some entries already in mg
        added_sugars_100g: safeNum(n['added-sugars_100g']),
    };

    const ingredientsRaw =
        productData.ingredients_text_en ||
        productData.ingredients_text ||
        undefined;

    return {
        barcode,
        name: productData.product_name || 'Unknown Product',
        brand: productData.brands || undefined,
        quantity: productData.quantity || undefined,
        image_url: productData.image_url || productData.image_front_url || undefined,
        nutrition,
        nutriscore_grade: productData.nutrition_grades || undefined,
        nova_group: productData.nova_group || undefined,
        ingredients: ingredientsRaw
            ? String(ingredientsRaw).trim() || undefined
            : undefined,
        scannedAt: Date.now(),
        category: isCosmetic ? 'beauty' : 'food',
        subCategory: isCosmetic ? undefined : deriveSubCategory(productData.categories_tags),
        allergens: productData.allergens_from_ingredients,
    };
}

/**
 * Look a product up across Open Food Facts (world, India mirror, v0) and
 * Open Beauty Facts, in order. Returns the first match.
 *
 * @returns the Product, or null if it is genuinely not in any database.
 * @throws  Error('network') if every attempt failed due to connectivity, so
 *          the caller can retry rather than treat it as "not found".
 */
export const getProductByBarcode = async (barcode: string): Promise<Product | null> => {
    // 0. Curated Airtable catalog first (authoritative for D2C / new SKUs).
    //    Best-effort: returns null if unconfigured, missing, or erroring.
    const catalogHit = await getProductFromCatalog(barcode);
    if (catalogHit) return catalogHit;

    const endpoints: { url: string; withFields: boolean; beauty: boolean }[] = [
        { url: `${PRIMARY_FOOD_URL}/product/${barcode}.json`, withFields: true, beauty: false },
        { url: `${BACKUP_FOOD_URL}/product/${barcode}.json`, withFields: true, beauty: false },
        { url: `${WORLD_BACKUP_URL}/product/${barcode}.json`, withFields: false, beauty: false },
        { url: `${BEAUTY_URL}/product/${barcode}.json`, withFields: true, beauty: true },
    ];

    let sawNetworkError = false;
    for (const ep of endpoints) {
        const { product, networkError } = await performLookup(ep.url, ep.withFields);
        if (networkError) { sawNetworkError = true; continue; }
        if (product) return mapProductData(product, barcode, ep.beauty);
    }

    // Every attempt failed on connectivity (none returned a definitive miss).
    if (sawNetworkError) throw new Error('network error');
    return null;
};
