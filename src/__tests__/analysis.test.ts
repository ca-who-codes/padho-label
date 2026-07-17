/**
 * analysis.test.ts — the v5 analysis engine: dietary alerts, added-sugar
 * estimation, sugar-in-teaspoons, verdict reasons, OCR ingredient extraction.
 */

import { detectAllergenHits, detectDietConflicts, analyzeDietary, canCheckDietary } from '../services/dietaryEngine';
import { estimateAddedSugars, sugarTeaspoons, getVerdictReasons, calculatePersonalizedScore } from '../services/ratingEngine';
import { extractIngredientsFromText, parseNutritionFromText } from '../services/ocrNutrition';
import { Product, HealthConstraints } from '../types';

const makeProduct = (over: Partial<Product> = {}): Product => ({
    barcode: '890', name: 'Test', nutrition: {}, category: 'food', ...over,
});

const constraints = (over: Partial<HealthConstraints> = {}): HealthConstraints => ({
    userId: 't', version: 1, dailyCalories: 2000,
    maxSugarsG: 50, maxAddedSugarsG: 25, maxSatFatG: 20, maxSodiumMg: 2400,
    maxSaltG: 6, minFiberG: 30, minProteinG: 50, maxCaloriesFromSnacks: 400,
    conditionFlags: { diabetes: false, prediabetes: false, hypertension: false, high_cholesterol: false, fatty_liver: false, pcos: false, thyroid: false },
    goalFlags: { weight_loss: false, muscle_gain: false, wellness: true, blood_sugar: false, pcos: false, heart: false, gut: false },
    ...over,
});

// ─── Allergen detection ───────────────────────────────────────────────────────

describe('dietaryEngine — allergens', () => {
    test('flags gluten from wheat flour in ingredients', () => {
        const p = makeProduct({ ingredients: 'Wheat flour (63%), sugar, palm oil' });
        const hits = detectAllergenHits(p, ['gluten']);
        expect(hits).toHaveLength(1);
        expect(hits[0].severity).toBe('danger');
        expect(hits[0].title).toMatch(/gluten/i);
    });

    test('flags dairy for lactose allergy from milk solids', () => {
        const p = makeProduct({ ingredients: 'Sugar, milk solids, cocoa butter' });
        const hits = detectAllergenHits(p, ['lactose']);
        expect(hits).toHaveLength(1);
        expect(hits[0].severity).toBe('danger');
    });

    test('nut allergy: cashew matches, coconut does NOT', () => {
        const withCashew = makeProduct({ ingredients: 'Wheat flour, cashew nuts, sugar' });
        expect(detectAllergenHits(withCashew, ['nuts'])).toHaveLength(1);
        const withCoconut = makeProduct({ ingredients: 'Rice, coconut, jaggery' });
        expect(detectAllergenHits(withCoconut, ['nuts'])).toHaveLength(0);
    });

    test('soy lecithin is only a "may contain" warning', () => {
        const p = makeProduct({ ingredients: 'Sugar, cocoa, emulsifier (lecithin INS 322)' });
        const hits = detectAllergenHits(p, ['soy']);
        expect(hits).toHaveLength(1);
        expect(hits[0].severity).toBe('warning');
        expect(hits[0].title).toMatch(/may contain/i);
    });

    test('uses OFF allergen tags when ingredients are missing', () => {
        const p = makeProduct({ allergens: 'en:gluten,en:milk' });
        expect(detectAllergenHits(p, ['gluten'])).toHaveLength(1);
        expect(detectAllergenHits(p, ['lactose'])).toHaveLength(1);
        expect(detectAllergenHits(p, ['nuts'])).toHaveLength(0);
    });

    test('no allergies → no alerts', () => {
        const p = makeProduct({ ingredients: 'Wheat flour, milk solids, peanuts' });
        expect(detectAllergenHits(p, [])).toHaveLength(0);
    });
});

// ─── Diet conflicts ───────────────────────────────────────────────────────────

describe('dietaryEngine — diet conflicts', () => {
    test('gelatin breaks vegetarian', () => {
        const p = makeProduct({ ingredients: 'Sugar, gelatine, colours' });
        const hits = detectDietConflicts(p, 'veg');
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].severity).toBe('danger');
        expect(hits[0].title).toMatch(/not vegetarian/i);
    });

    test('E120 carmine breaks vegetarian', () => {
        const p = makeProduct({ ingredients: 'Sugar, colour (E 120), flavour' });
        expect(detectDietConflicts(p, 'veg').length).toBeGreaterThan(0);
    });

    test('egg is fine for eggitarian, not for veg', () => {
        const p = makeProduct({ ingredients: 'Wheat flour, egg powder, sugar' });
        expect(detectDietConflicts(p, 'eggitarian')).toHaveLength(0);
        expect(detectDietConflicts(p, 'veg').length).toBeGreaterThan(0);
    });

    test('vegan flags dairy and honey', () => {
        const p = makeProduct({ ingredients: 'Oats, honey, milk solids' });
        const hits = detectDietConflicts(p, 'vegan');
        const triggers = hits.map(h => h.trigger).join(' ');
        expect(triggers).toMatch(/dairy/);
        expect(triggers).toMatch(/honey/);
    });

    test('jain flags onion/garlic as danger-level allium', () => {
        const p = makeProduct({ ingredients: 'Rice, onion powder, garlic powder, salt' });
        const hits = detectDietConflicts(p, 'jain');
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].title).toMatch(/jain/i);
    });

    test('non-veg diet gets no conflicts', () => {
        const p = makeProduct({ ingredients: 'Chicken, spices, gelatin' });
        expect(detectDietConflicts(p, 'non_veg')).toHaveLength(0);
    });

    test('canCheckDietary is honest about missing data', () => {
        expect(canCheckDietary(makeProduct())).toBe(false);
        expect(canCheckDietary(makeProduct({ ingredients: 'Wheat flour, sugar' }))).toBe(true);
        expect(canCheckDietary(makeProduct({ allergens: 'en:milk' }))).toBe(true);
    });

    test('analyzeDietary combines allergen + diet alerts', () => {
        const p = makeProduct({ ingredients: 'Wheat flour, gelatin, sugar' });
        const alerts = analyzeDietary(p, { allergies: ['gluten'], diet: 'veg' });
        expect(alerts.some(a => a.kind === 'allergen')).toBe(true);
        expect(alerts.some(a => a.kind === 'diet')).toBe(true);
    });
});

// ─── Added-sugar estimation ───────────────────────────────────────────────────

describe('estimateAddedSugars', () => {
    test('explicit added_sugars wins', () => {
        const p = makeProduct({ nutrition: { sugars_100g: 20, added_sugars_100g: 12 } });
        expect(estimateAddedSugars(p)).toEqual({ grams: 12, assumed: false });
    });

    test('plain milk (no sweetener in ingredients) → 0 added', () => {
        const p = makeProduct({
            nutrition: { sugars_100g: 4.7 },
            ingredients: 'Toned milk',
            subCategory: 'dairy',
        });
        const est = estimateAddedSugars(p);
        expect(est.grams).toBe(0);
        expect(est.assumed).toBe(true);
    });

    test('biscuit with sugar in ingredients → total counts as added', () => {
        const p = makeProduct({
            nutrition: { sugars_100g: 27 },
            ingredients: 'Wheat flour, sugar, palm oil',
        });
        expect(estimateAddedSugars(p).grams).toBe(27);
    });

    test('jaggery counts as an added sweetener', () => {
        const p = makeProduct({ nutrition: { sugars_100g: 30 }, ingredients: 'Peanuts, jaggery' });
        expect(estimateAddedSugars(p).grams).toBe(30);
    });

    test('dairy without ingredients keeps a lactose allowance', () => {
        const p = makeProduct({ nutrition: { sugars_100g: 4.6 }, subCategory: 'dairy' });
        expect(estimateAddedSugars(p).grams).toBe(0);
        const sweetened = makeProduct({ nutrition: { sugars_100g: 12 }, subCategory: 'dairy' });
        expect(estimateAddedSugars(sweetened).grams).toBe(7);
    });

    test('plain milk now outscores a cola for the same profile', () => {
        const cons = constraints();
        const milk = makeProduct({
            name: 'Milk', subCategory: 'dairy', ingredients: 'Toned milk',
            nutrition: { energy_100g: 243, sugars_100g: 4.7, fat_100g: 3, saturated_fat_100g: 1.9, proteins_100g: 3, salt_100g: 0.1 },
        });
        const cola = makeProduct({
            name: 'Cola', subCategory: 'drinks', ingredients: 'Carbonated water, sugar, caramel colour',
            nutrition: { energy_100g: 180, sugars_100g: 10.6, fat_100g: 0, saturated_fat_100g: 0, proteins_100g: 0, salt_100g: 0 },
            nova_group: 4,
        });
        const milkScore = calculatePersonalizedScore(milk, cons).score;
        const colaScore = calculatePersonalizedScore(cola, cons).score;
        expect(milkScore).toBeGreaterThan(colaScore);
    });
});

// ─── Teaspoons + verdict reasons ─────────────────────────────────────────────

describe('sugar teaspoons & verdict reasons', () => {
    test('teaspoon math (4g per tsp)', () => {
        expect(sugarTeaspoons(10.6)).toBeCloseTo(2.7, 1);
        expect(sugarTeaspoons(56)).toBe(14);
        expect(sugarTeaspoons(0)).toBe(0);
    });

    test('verdict reasons lead with trans fat when present', () => {
        const p = makeProduct({
            nutrition: { energy_100g: 2000, sugars_100g: 20, fat_100g: 20, saturated_fat_100g: 10, trans_fat_100g: 1, proteins_100g: 5, salt_100g: 1 },
            ingredients: 'Wheat flour, sugar, hydrogenated vegetable oil',
        });
        const reasons = getVerdictReasons(p, null);
        expect(reasons[0].text).toMatch(/trans fat/i);
        expect(reasons[0].tone).toBe('bad');
    });

    test('reasons empty without usable nutrition', () => {
        expect(getVerdictReasons(makeProduct(), null)).toHaveLength(0);
    });
});

// ─── OCR ingredients extraction ──────────────────────────────────────────────

describe('extractIngredientsFromText', () => {
    test('pulls the block between INGREDIENTS and NUTRITION', () => {
        const text = `Best before 9 months
INGREDIENTS: Wheat flour (63%), Sugar, Edible vegetable oil (Palm), Invert syrup, Raising agents (INS 500(ii)), Salt
NUTRITION INFORMATION per 100g Energy 450 kcal`;
        const out = extractIngredientsFromText(text);
        expect(out).toMatch(/^Wheat flour/);
        expect(out).toMatch(/Salt$/);
        expect(out).not.toMatch(/NUTRITION/i);
    });

    test('stops at allergen advice / storage markers', () => {
        const text = 'Ingredients - Milk solids, sugar, cocoa. ALLERGEN ADVICE: contains milk. STORE IN a cool place';
        const out = extractIngredientsFromText(text);
        expect(out).toMatch(/cocoa/);
        expect(out).not.toMatch(/ALLERGEN/i);
    });

    test('returns null when no marker or block too short', () => {
        expect(extractIngredientsFromText('Energy 450 kcal Protein 7g')).toBeNull();
        expect(extractIngredientsFromText('Ingredients: Salt')).toBeNull();
    });
});

// ─── OCR nutrition parsing upgrades ──────────────────────────────────────────

describe('parseNutritionFromText v5 additions', () => {
    test('reads "Energy (kcal) 450" column format', () => {
        const out = parseNutritionFromText('Nutrition per 100g Energy (kcal) 450 Protein 7 g');
        expect(out.energy_100g).toBe(Math.round(450 * 4.184));
    });

    test('reads declared trans fat and added sugar', () => {
        const out = parseNutritionFromText('Total fat 20 g Saturated fat 9 g Trans fat 0.2 g Total sugars 24 g Added sugars 18 g');
        expect(out.trans_fat_100g).toBe(0.2);
        expect(out.added_sugars_100g).toBe(18);
        expect(out.sugars_100g).toBe(24);
        expect(out.fat_100g).toBe(20);
        expect(out.saturated_fat_100g).toBe(9);
    });

    test('sodium in mg converts to grams + salt', () => {
        const out = parseNutritionFromText('Sodium 1150 mg per 100 g');
        expect(out.sodium_100g).toBeCloseTo(1.15, 2);
        expect(out.salt_100g).toBeCloseTo(2.875, 2);
    });

    test('serving size detected', () => {
        const out = parseNutritionFromText('Serving size: 30 g Energy 120 kcal');
        expect(out.serving_size_g).toBe(30);
    });
});
