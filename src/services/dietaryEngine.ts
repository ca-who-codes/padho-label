/**
 * dietaryEngine.ts — allergen & diet-conflict detection.
 *
 * The profile has always collected allergies and diet type; this engine finally
 * ENFORCES them on every scan. Pure keyword/tag matching over the ingredients
 * text, OFF allergen tags, and OFF ingredients-analysis tags — deterministic,
 * no LLM, fully unit-testable.
 *
 * Severity rules:
 *  - danger  → a direct, unambiguous hit ("wheat flour" for a gluten allergy)
 *  - warning → a likely/ambiguous hit ("E322 lecithin — often soy-derived")
 * Missing data is honest: no ingredients ⇒ we say we couldn't check, not "safe".
 */

import { Product, AllergyType, DietType } from '../types';

export type DietaryAlert = {
    kind: 'allergen' | 'diet';
    severity: 'danger' | 'warning';
    title: string;
    detail: string;
    trigger: string;
};

type Matcher = { re: RegExp; label: string; sure: boolean };

const m = (pattern: string, label: string, sure = true): Matcher => ({
    // \b word boundaries so "coconut" never matches a nut rule, etc.
    re: new RegExp(`\\b(?:${pattern})\\b`, 'i'),
    label,
    sure,
});

// ─── Allergen keyword tables ─────────────────────────────────────────────────

const ALLERGEN_MATCHERS: Record<AllergyType, Matcher[]> = {
    gluten: [
        m('wheat|whole ?wheat|wheat flour|maida|atta|semolina|sooji|suji|rava|barley|rye|malt(?:ed)? (?:extract|flour|barley)?|gluten|dalia|seitan', 'wheat/gluten grain'),
        m('oat|oats|oatmeal', 'oats (often cross-contaminated)', false),
    ],
    lactose: [
        m('milk|milk solids?|skimmed milk|whole milk|toned milk|butter|ghee|cream|cheese|curd|yog(?:h)?urt|dahi|paneer|khoya|mawa|whey|casein|lactose|condensed milk|milk powder|dairy', 'milk/dairy'),
    ],
    nuts: [
        m('almond|cashew|pista(?:chio)?|walnut|hazelnut|pecan|macadamia|brazil nut|pine nut|peanut|ground ?nut|nut paste|mixed nuts|tree nuts?', 'nuts'),
    ],
    soy: [
        m('soy|soya|soybean|soy protein|soya chunks|soy flour|soy sauce|tofu', 'soy'),
        m('lecithin|(?:e|ins)[ -]?322', 'lecithin (E322) — often soy-derived', false),
    ],
    eggs: [
        m('egg|eggs|egg powder|egg white|egg yolk|albumin|albumen|mayonnaise', 'egg'),
    ],
    additives: [], // handled by the additives service (high-concern additives)
    fragrance: [
        m('fragrance|perfume|parfum|dpg|dipropylene glycol', 'fragrance'),
    ],
};

// OFF `allergens` tags → our allergy types (e.g. "en:gluten,en:milk")
const OFF_ALLERGEN_TAGS: Record<string, AllergyType> = {
    gluten: 'gluten',
    milk: 'lactose',
    nuts: 'nuts',
    peanuts: 'nuts',
    soybeans: 'soy',
    soy: 'soy',
    eggs: 'eggs',
};

const ALLERGY_LABEL: Record<AllergyType, string> = {
    gluten: 'gluten',
    lactose: 'dairy/lactose',
    nuts: 'nuts',
    soy: 'soy',
    eggs: 'egg',
    additives: 'additives',
    fragrance: 'fragrance',
};

// ─── Diet conflict tables ────────────────────────────────────────────────────

/** Unambiguously animal-derived (never vegetarian). Indian labels write additives
 *  as "INS 631"; EU-style as "E631" — match both. */
const NON_VEG: Matcher[] = [
    m('gelatin(?:e)?|(?:e|ins)[ -]?441', 'gelatin'),
    m('lard|tallow|animal fat|suet', 'animal fat'),
    m('fish|anchovy|sardine|tuna|prawn|shrimp|crab|oyster(?: sauce)?|squid', 'fish/seafood'),
    m('chicken|mutton|meat|beef|pork|ham|salami|pepperoni', 'meat'),
    m('carmine|cochineal|(?:e|ins)[ -]?120', 'carmine (E120, insect-derived)'),
    m('shellac|(?:e|ins)[ -]?904', 'shellac (E904, insect-derived)'),
    m('rennet(?!.*microbial)', 'rennet — often animal-derived', false),
    m('(?:e|ins)[ -]?63[15]|disodium inosinate|disodium 5', 'E631/E635 — can be fish-derived', false),
];

const EGG: Matcher[] = [m('egg|eggs|egg powder|albumin|albumen|mayonnaise', 'egg')];

const DAIRY: Matcher[] = [
    m('milk|milk solids?|butter|ghee|cream|cheese|curd|yog(?:h)?urt|dahi|paneer|khoya|whey|casein|lactose|condensed milk|milk powder', 'dairy'),
];

const HONEY_WAX: Matcher[] = [
    m('honey', 'honey'),
    m('beeswax|(?:e|ins)[ -]?901', 'beeswax (E901)'),
];

/** Root vegetables & alliums avoided in Jain / satvik diets. */
const ROOTS_ALLIUM: Matcher[] = [
    m('onion|garlic', 'onion/garlic'),
    m('potato|aloo', 'potato (root vegetable)', false),
    m('ginger|carrot|radish|beetroot|turnip', 'root vegetable', false),
];

const DIET_LABEL: Record<DietType, string> = {
    veg: 'vegetarian', non_veg: 'non-vegetarian', eggitarian: 'eggitarian',
    vegan: 'vegan', jain: 'Jain', satvik: 'satvik',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const scanText = (text: string, matchers: Matcher[]): Matcher[] =>
    matchers.filter(x => x.re.test(text));

/** Parse OFF allergen tags ("en:gluten,en:milk" or plain "gluten, milk"). */
const offAllergenTypes = (allergens?: string): Set<AllergyType> => {
    const out = new Set<AllergyType>();
    if (!allergens) return out;
    for (const raw of allergens.split(',')) {
        const tag = raw.trim().toLowerCase().replace(/^[a-z]{2}:/, '');
        const mapped = OFF_ALLERGEN_TAGS[tag];
        if (mapped) out.add(mapped);
    }
    return out;
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Alerts for the user's declared allergies. */
export const detectAllergenHits = (product: Product, allergies: AllergyType[]): DietaryAlert[] => {
    if (!allergies || allergies.length === 0) return [];
    const text = (product.ingredients || '').toLowerCase();
    const offTags = offAllergenTypes(product.allergens);
    const alerts: DietaryAlert[] = [];

    for (const allergy of allergies) {
        if (allergy === 'additives') continue; // covered by the additives panel
        let hit: { label: string; sure: boolean } | null = null;

        if (offTags.has(allergy)) {
            hit = { label: `declared allergen (${ALLERGY_LABEL[allergy]})`, sure: true };
        } else if (text) {
            const found = scanText(text, ALLERGEN_MATCHERS[allergy]);
            if (found.length) {
                const sure = found.some(f => f.sure);
                hit = { label: (found.find(f => f.sure) || found[0]).label, sure };
            }
        }

        if (hit) {
            alerts.push({
                kind: 'allergen',
                severity: hit.sure ? 'danger' : 'warning',
                title: hit.sure
                    ? `Contains ${ALLERGY_LABEL[allergy]}`
                    : `May contain ${ALLERGY_LABEL[allergy]}`,
                detail: `${hit.label} — flagged because your profile lists a ${ALLERGY_LABEL[allergy]} allergy.`,
                trigger: hit.label,
            });
        }
    }
    return alerts;
};

/** Alerts where the product conflicts with the user's diet type. */
export const detectDietConflicts = (product: Product, diet: DietType): DietaryAlert[] => {
    if (!diet || diet === 'non_veg') return [];
    const text = (product.ingredients || '').toLowerCase();
    if (!text) return [];

    const rules: { matchers: Matcher[]; why: string }[] = [];
    // All vegetarian-family diets exclude meat/fish/insect-derived.
    rules.push({ matchers: NON_VEG, why: 'not vegetarian' });
    if (diet === 'veg' || diet === 'jain' || diet === 'satvik' || diet === 'vegan') {
        rules.push({ matchers: EGG, why: 'contains egg' });
    }
    if (diet === 'vegan') {
        rules.push({ matchers: DAIRY, why: 'contains dairy' });
        rules.push({ matchers: HONEY_WAX, why: 'animal-derived' });
    }
    if (diet === 'jain' || diet === 'satvik') {
        rules.push({ matchers: ROOTS_ALLIUM, why: diet === 'jain' ? 'avoided in Jain diets' : 'avoided in satvik diets' });
    }

    const alerts: DietaryAlert[] = [];
    const seen = new Set<string>();
    for (const rule of rules) {
        for (const found of scanText(text, rule.matchers)) {
            if (seen.has(found.label)) continue;
            seen.add(found.label);
            alerts.push({
                kind: 'diet',
                severity: found.sure ? 'danger' : 'warning',
                title: found.sure
                    ? `Not ${DIET_LABEL[diet]}`
                    : `May not be ${DIET_LABEL[diet]}`,
                detail: `Contains ${found.label} (${rule.why}).`,
                trigger: found.label,
            });
        }
    }

    // Danger first, then warnings; cap so the verdict stays readable.
    return alerts
        .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1))
        .slice(0, 3);
};

/**
 * Everything the verdict banner needs in one call.
 * Returns [] when there is nothing to flag OR nothing to check —
 * use `canCheckDietary` to distinguish the two.
 */
export const analyzeDietary = (
    product: Product,
    profile: { allergies: AllergyType[]; diet: DietType } | null,
): DietaryAlert[] => {
    if (!profile) return [];
    return [
        ...detectAllergenHits(product, profile.allergies),
        ...detectDietConflicts(product, profile.diet),
    ];
};

/** True when we have any signal (ingredients or allergen tags) to check against. */
export const canCheckDietary = (product: Product): boolean =>
    !!(product.ingredients && product.ingredients.trim()) || !!product.allergens;
