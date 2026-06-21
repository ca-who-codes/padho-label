import {
    calculateNutriScore,
    calculatePersonalizedScore,
    nutriScoreToPercent,
    getCategoryThresholds,
} from '../services/ratingEngine';
import { deriveFlags } from '../services/flagDerivation';
import { parseNutritionFromText } from '../services/ocrNutrition';
import { findAdditives } from '../services/additivesService';
import { deriveSubCategory } from '../services/api';
import { mapAirtableFields, isCatalogConfigured } from '../services/productCatalog';
import { computeHealthConstraints } from '../services/userProfileService';
import { UserProfile, Product } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    id: 'test', version: 1, name: 'Test', age: 30, sex: 'M',
    heightCm: 175, weightKg: 70, city: 'Pune', language: 'en',
    activityLevel: 'moderate', smoker: false, alcohol: false, diet: 'veg',
    goals: ['wellness'], conditions: [], allergies: [],
    preferences: {
        minSugar: false, highProtein: false, lowSodium: false, noPalmOil: false,
        organicOnly: false, crueltyFree: false, vegOnly: false, sugarSmartMode: false, showBestRated: false,
    },
    createdAt: 0, updatedAt: 0, ...overrides,
});

const makeProduct = (nutrition: Product['nutrition'], extra: Partial<Product> = {}): Product => ({
    barcode: '000', name: 'Test', nutrition, category: 'food', ...extra,
});

// ─── Rating Engine ────────────────────────────────────────────────────────────

describe('Rating Engine', () => {
    test('calculates Nutri-Score A for healthy product', () => {
        const result = calculateNutriScore({
            energy_100g: 100, saturated_fat_100g: 0, sugars_100g: 1,
            sodium_100g: 0.01, fiber_100g: 10, proteins_100g: 10,
        });
        expect(result.grade).toBe('A');
    });

    test('calculates Nutri-Score E for unhealthy product', () => {
        const result = calculateNutriScore({
            energy_100g: 2500, saturated_fat_100g: 20, sugars_100g: 40,
            sodium_100g: 1, fiber_100g: 0, proteins_100g: 1,
        });
        expect(result.grade).toBe('E');
    });

    test('reports no data for sparse nutrition', () => {
        expect(calculateNutriScore({ sugars_100g: 5 }).hasData).toBe(false);
    });

    test('nutriScoreToPercent stays clamped within 0..100', () => {
        expect(nutriScoreToPercent(-50)).toBe(100); // very healthy, would overflow without clamp
        expect(nutriScoreToPercent(100)).toBe(0);   // very unhealthy, would go negative without clamp
        const mid = nutriScoreToPercent(5);
        expect(mid).toBeGreaterThanOrEqual(0);
        expect(mid).toBeLessThanOrEqual(100);
    });
});

// ─── Personalised Scoring ──────────────────────────────────────────────────────

describe('Personalised Scoring', () => {
    const healthy = makeProduct({
        energy_100g: 400, saturated_fat_100g: 1, sugars_100g: 2, added_sugars_100g: 0,
        sodium_100g: 0.05, fiber_100g: 8, proteins_100g: 9,
    });
    const sugary = makeProduct({
        energy_100g: 2000, saturated_fat_100g: 12, sugars_100g: 45, added_sugars_100g: 40,
        sodium_100g: 0.4, fiber_100g: 1, proteins_100g: 4,
    }, { nova_group: 4 });

    test('returns a 0..100 score with a grade', () => {
        const c = computeHealthConstraints(makeProfile());
        const r = calculatePersonalizedScore(healthy, c);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        expect('ABCDE').toContain(r.grade);
    });

    test('scores a clean product higher than an ultra-processed sugary one', () => {
        const c = computeHealthConstraints(makeProfile());
        expect(calculatePersonalizedScore(healthy, c).score)
            .toBeGreaterThan(calculatePersonalizedScore(sugary, c).score);
    });

    test('a diabetic profile penalises the sugary product harder', () => {
        const normal = computeHealthConstraints(makeProfile());
        const diabetic = computeHealthConstraints(makeProfile({ conditions: ['diabetes'] }));
        expect(calculatePersonalizedScore(sugary, diabetic).score)
            .toBeLessThanOrEqual(calculatePersonalizedScore(sugary, normal).score);
    });
});

// ─── Health Constraints ─────────────────────────────────────────────────────

describe('Health Constraints', () => {
    test('produces finite limits even for invalid biometrics', () => {
        const c = computeHealthConstraints(makeProfile({ weightKg: 0, heightCm: NaN, age: -3 }));
        expect(Number.isFinite(c.dailyCalories)).toBe(true);
        expect(c.dailyCalories).toBeGreaterThan(0);
        expect(Number.isFinite(c.minProteinG)).toBe(true);
        expect(c.minProteinG).toBeGreaterThan(0);
    });

    test('diabetes tightens the sugar limit', () => {
        const base = computeHealthConstraints(makeProfile());
        const diabetic = computeHealthConstraints(makeProfile({ conditions: ['diabetes'] }));
        expect(diabetic.maxAddedSugarsG).toBeLessThan(base.maxAddedSugarsG);
    });
});

// ─── OCR Nutrition Parser ──────────────────────────────────────────────────────

describe('OCR Nutrition Parser', () => {
    test('extracts values from a typical per-100g label', () => {
        const text = `Nutrition Information per 100g
            Energy 2100 kJ
            Fat 25 g
            of which saturates 12 g
            Carbohydrate 60 g
            of which sugars 35 g
            Fibre 3 g
            Protein 7 g
            Salt 1.2 g`;
        const n = parseNutritionFromText(text);
        expect(n.energy_100g).toBe(2100);
        expect(n.fat_100g).toBe(25);
        expect(n.saturated_fat_100g).toBe(12);
        expect(n.sugars_100g).toBe(35);
        expect(n.proteins_100g).toBe(7);
        expect(n.salt_100g).toBe(1.2);
    });

    test('converts kcal to kJ when only kcal is present', () => {
        const n = parseNutritionFromText('Energy 100 kcal');
        expect(n.energy_100g).toBe(Math.round(100 * 4.184));
    });

    test('returns empty object for empty text', () => {
        expect(Object.keys(parseNutritionFromText('')).length).toBe(0);
    });
});

// ─── Additives ──────────────────────────────────────────────────────────────

describe('Additive Detection', () => {
    test('detects an additive by its E-number', () => {
        const found = findAdditives('Sugar, Flour, Preservative (E211)');
        expect(found.some(a => a.id === 'E211')).toBe(true);
    });

    test('detects an additive by full name', () => {
        const found = findAdditives('Contains tartrazine and water');
        expect(found.some(a => a.name === 'Tartrazine')).toBe(true);
    });

    test('does NOT flag "Sodium Benzoate" just because "sodium" appears', () => {
        const found = findAdditives('Salt (Sodium Chloride), Sugar, Wheat Flour');
        expect(found.some(a => a.name === 'Sodium Benzoate')).toBe(false);
    });

    test('returns nothing for a clean ingredient list', () => {
        expect(findAdditives('Whole wheat, water, salt').length).toBe(0);
    });
});

// ─── Category Mapping & Thresholds ────────────────────────────────────────────

describe('Category Mapping', () => {
    test('maps OFF category tags to a scoring sub-category', () => {
        expect(deriveSubCategory(['en:biscuits', 'en:sugary-snacks'])).toBe('biscuits');
        expect(deriveSubCategory(['en:carbonated-drinks', 'en:sodas'])).toBe('drinks');
        expect(deriveSubCategory(['en:vegetable-oils'])).toBe('oils');
    });

    test('returns undefined when no tag matches', () => {
        expect(deriveSubCategory(['en:plant-based-foods'])).toBeUndefined();
        expect(deriveSubCategory(undefined)).toBeUndefined();
    });

    test('biscuits use a stricter sugar penalty than the default', () => {
        expect(getCategoryThresholds('biscuits').addedSugarPenalty)
            .toBeGreaterThan(getCategoryThresholds('food').addedSugarPenalty);
    });

    test('sub-category flows through to the personalised score', () => {
        const c = computeHealthConstraints(makeProfile());
        const nutrition = {
            energy_100g: 1800, saturated_fat_100g: 5, sugars_100g: 50, added_sugars_100g: 45,
            sodium_100g: 0.1, fiber_100g: 0, proteins_100g: 1,
        };
        const asDrink = calculatePersonalizedScore(makeProduct(nutrition, { subCategory: 'drinks' }), c);
        const asGeneric = calculatePersonalizedScore(makeProduct(nutrition), c);
        // Drinks carry a harsher added-sugar/ultra-processed penalty, so a sugary
        // drink should never score higher than the same product scored generically.
        expect(asDrink.score).toBeLessThanOrEqual(asGeneric.score);
    });
});

// ─── Curated Catalog (Airtable) ───────────────────────────────────────────────

describe('Curated Catalog', () => {
    test('is disabled when no credentials are configured', () => {
        // No EXPO_PUBLIC_AIRTABLE_* set in the test env.
        expect(isCatalogConfigured()).toBe(false);
    });

    test('maps an Airtable record into a Product', () => {
        const p = mapAirtableFields({
            Name: 'Muesli+ (Fruits, Nuts & Seeds)',
            Brand: 'Yogabar',
            Category: 'food',
            'Sub Category': 'cereals',
            'Energy (kJ)': 1705,
            Sugars: 4.8,
            Protein: 11,
            Fiber: 9,
            Salt: 0.2,
            'NOVA Group': 3,
            'Nutriscore Grade': 'b',
            Ingredients: 'Whole oats, almonds, raisins',
        }, '8904335600312');

        expect(p.barcode).toBe('8904335600312');
        expect(p.name).toContain('Muesli+');
        expect(p.brand).toBe('Yogabar');
        expect(p.category).toBe('food');
        expect(p.subCategory).toBe('cereals');
        expect(p.nova_group).toBe(3);
        expect(p.nutrition.energy_100g).toBe(1705);
        expect(p.nutrition.sugars_100g).toBe(4.8);
        expect(p.nutrition.proteins_100g).toBe(11);
        // Unset numeric fields are omitted, not stored as undefined/NaN.
        expect('trans_fat_100g' in p.nutrition).toBe(false);
    });

    test('a catalog Product scores via the engine like any other', () => {
        const p = mapAirtableFields(
            { Name: 'X', Category: 'food', 'Sub Category': 'cereals', 'Energy (kJ)': 1705, Sugars: 4.8, Fiber: 9, Protein: 11, Fat: 12, 'Saturated Fat': 2.5, Salt: 0.2 },
            '111',
        );
        const c = computeHealthConstraints(makeProfile());
        const r = calculatePersonalizedScore(p, c);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
    });
});

// ─── Flag Derivation ──────────────────────────────────────────────────────────

describe('Flag Derivation', () => {
    test('identifies high sugar red flag', () => {
        expect(deriveFlags({ sugars_100g: 20 }).some(f => f.title === 'High Sugar')).toBe(true);
    });

    test('identifies high fiber green flag', () => {
        expect(deriveFlags({ fiber_100g: 8 }).some(f => f.title === 'High Fiber')).toBe(true);
    });
});
