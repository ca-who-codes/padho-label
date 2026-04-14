import axios from 'axios';
import { Product, NutritionData } from '../types';

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
    'allergens_from_ingredients',
].join(',');

function safeNum(val: any): number | undefined {
    const n = parseFloat(val);
    return isNaN(n) ? undefined : n;
}

const performLookup = async (baseUrl: string, barcode: string) => {
    try {
        const response = await axios.get(`${baseUrl}/product/${barcode}.json`, {
            params: { fields: FIELDS },
            timeout: 8000,
        });
        if (response.data.status === 0 || !response.data.product) return null;
        return response.data.product;
    } catch {
        return null;
    }
};

/** v0 endpoint has slightly different URL format but broader data */
const performV0Lookup = async (barcode: string) => {
    try {
        const response = await axios.get(
            `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
            { timeout: 8000 },
        );
        if (response.data.status === 0 || !response.data.product) return null;
        return response.data.product;
    } catch {
        return null;
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
        allergens: productData.allergens_from_ingredients,
    };
}

export const getProductByBarcode = async (barcode: string): Promise<Product | null> => {
    try {
        // 1. Try Primary Food API (world)
        let productData = await performLookup(PRIMARY_FOOD_URL, barcode);

        // 2. Try India-specific OFF mirror
        if (!productData) {
            productData = await performLookup(BACKUP_FOOD_URL, barcode);
        }

        // 3. Try v0 API (sometimes has entries v2 misses)
        if (!productData) {
            productData = await performV0Lookup(barcode);
        }

        // 4. Try Beauty Facts API if food fails
        let isCosmetic = false;
        if (!productData) {
            productData = await performLookup(BEAUTY_URL, barcode);
            if (productData) isCosmetic = true;
        }

        if (!productData) return null;

        return mapProductData(productData, barcode, isCosmetic);
    } catch (error) {
        console.error('Error fetching product:', error);
        throw error;
    }
};
