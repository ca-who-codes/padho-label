import {
    normalizeBarcode, normalizeBrand, normalizeName, parseQuantity,
    lineKey, matchKey, tokenSimilarity,
    buildIndex, selectBestMatch,
    rankProducts, decisiveAxisFor,
    initIntelligence, lookup, remember, categoryProducts,
    enqueueContribution, exportContributions, clearContributions,
} from '../services/intelligence';
import type { IntelRecord } from '../services/intelligence';
import { Product, HealthConstraints } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const rec = (o: Partial<IntelRecord> & { name: string }): IntelRecord => ({
    barcode: o.barcode ?? '',
    name: o.name,
    brand: o.brand,
    quantity: o.quantity,
    nutrition: o.nutrition ?? {},
    category: o.category ?? 'food',
    subCategory: o.subCategory,
    gtin: normalizeBarcode(o.barcode),
    matchKey: matchKey(o.brand, o.name, o.quantity),
    lineKey: lineKey(o.brand, o.name),
    source: o.source ?? 'seed',
    confidence: o.confidence ?? 'high',
    verifiedAt: 0,
});

const constraints = (over: Partial<HealthConstraints> = {}): HealthConstraints => ({
    userId: 't', version: 1, dailyCalories: 2000,
    maxSugarsG: 50, maxAddedSugarsG: 25, maxSatFatG: 20, maxSodiumMg: 2000,
    maxSaltG: 5, minFiberG: 30, minProteinG: 50, maxCaloriesFromSnacks: 200,
    conditionFlags: { diabetes: false, prediabetes: false, hypertension: false, high_cholesterol: false, fatty_liver: false, pcos: false, thyroid: false },
    goalFlags: { weight_loss: false, muscle_gain: false, wellness: true, blood_sugar: false, pcos: false, heart: false, gut: false },
    ...over,
});

// ─── normalize ────────────────────────────────────────────────────────────────

describe('normalize', () => {
    test('barcode keeps digits, rejects too-short', () => {
        expect(normalizeBarcode('890-1234 5678')).toBe('89012345678');
        expect(normalizeBarcode('123')).toBeUndefined();
        expect(normalizeBarcode(undefined)).toBeUndefined();
    });

    test('brand/name strip punctuation, case, noise words', () => {
        expect(normalizeBrand('Britannia®')).toBe('britannia');
        expect(normalizeBrand('Britannia, Parle')).toBe('britannia');
        expect(normalizeName('The Original NutriChoice!')).toBe('nutrichoice');
    });

    test('quantity canonicalises to base units', () => {
        expect(parseQuantity('200 g')).toBe('200g');
        expect(parseQuantity('1 kg')).toBe('1000g');
        expect(parseQuantity('1 L')).toBe('1000ml');
        expect(parseQuantity('250ml')).toBe('250ml');
        expect(parseQuantity('75 g x 2')).toBe('150g');
        expect(parseQuantity('family pack')).toBe('');
    });

    test('match keys: line is pack-independent, match includes qty', () => {
        expect(lineKey('Britannia', 'Marie Gold')).toBe('britannia|marie gold');
        expect(matchKey('Britannia', 'Marie Gold', '250 g')).toBe('britannia|marie gold|250g');
        // same product, different pack -> same lineKey, different matchKey
        expect(lineKey('Britannia', 'Marie Gold')).toBe(lineKey('Britannia', 'Marie Gold'));
        expect(matchKey('Britannia', 'Marie Gold', '100 g'))
            .not.toBe(matchKey('Britannia', 'Marie Gold', '250 g'));
    });

    test('token similarity is symmetric 0..1', () => {
        expect(tokenSimilarity('good day cashew', 'good day cashew')).toBe(1);
        expect(tokenSimilarity('a b c', 'x y z')).toBe(0);
    });
});

// ─── resolution waterfall ──────────────────────────────────────────────────────

describe('selectBestMatch waterfall', () => {
    const idx = buildIndex([
        rec({ name: 'Marie Gold', brand: 'Britannia', quantity: '250 g', barcode: '8901063011112' }),
        rec({ name: 'Good Day Cashew', brand: 'Britannia', quantity: '200 g' }),
        rec({ name: 'Good Day Butter', brand: 'Britannia', quantity: '200 g' }),
        rec({ name: 'Choco Chip Cookie', brand: 'Acme', quantity: '100 g' }),
        rec({ name: 'Choco Chip Cream', brand: 'Acme', quantity: '100 g' }),
    ]);

    test('tier 1 — barcode/GTIN exact', () => {
        const m = selectBestMatch({ barcode: '8901063011112' }, idx);
        expect(m?.tier).toBe('barcode');
        expect(m?.record.name).toBe('Marie Gold');
    });

    test('tier 2 — exact brand+name+qty', () => {
        const m = selectBestMatch({ brand: 'Britannia', name: 'Good Day Cashew', quantity: '200 g' }, idx);
        expect(m?.tier).toBe('key');
    });

    test('tier 3 — same line, different pack', () => {
        const m = selectBestMatch({ brand: 'Britannia', name: 'Good Day Cashew', quantity: '75 g' }, idx);
        expect(m?.tier).toBe('line');
        expect(m?.record.name).toBe('Good Day Cashew');
    });

    test('tier 4 — fuzzy, unambiguous within brand (low confidence)', () => {
        // A longer/looser name with no exact line resolves to the closest sibling.
        const m = selectBestMatch({ brand: 'Britannia', name: 'Good Day Cashew Cookies' }, idx);
        expect(m?.tier).toBe('fuzzy');
        expect(m?.record.name).toBe('Good Day Cashew');
        expect(m?.confidence).toBe('low');
    });

    test('ambiguous fuzzy is treated as a miss (no wrong score)', () => {
        const m = selectBestMatch({ brand: 'Acme', name: 'Choco Chip' }, idx);
        expect(m).toBeNull();
    });

    test('genuine miss returns null', () => {
        expect(selectBestMatch({ brand: 'Nobody', name: 'Mystery Wafer' }, idx)).toBeNull();
    });
});

// ─── ranking ────────────────────────────────────────────────────────────────

describe('rankProducts', () => {
    const lowSugar: Product = { barcode: '1', name: 'Low Sugar', category: 'food', subCategory: 'biscuits', nutrition: { sugars_100g: 4, proteins_100g: 8, fiber_100g: 6, energy_100g: 1600, saturated_fat_100g: 2, salt_100g: 0.4 } };
    const highSugar: Product = { barcode: '2', name: 'High Sugar', category: 'food', subCategory: 'biscuits', nutrition: { sugars_100g: 35, proteins_100g: 4, fiber_100g: 1, energy_100g: 2200, saturated_fat_100g: 14, salt_100g: 0.6 } };

    test('diabetic profile chooses the lower-sugar product as winner', () => {
        const c = constraints({ conditionFlags: { ...constraints().conditionFlags, diabetes: true } });
        expect(decisiveAxisFor(c)).toBe('sugar');
        const ranked = rankProducts([highSugar, lowSugar], c);
        expect(ranked[0].product.name).toBe('Low Sugar');
        expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
        expect(ranked[0].reason).toMatch(/sugar/);
    });

    test('works with no profile (base nutri-score fallback)', () => {
        const ranked = rankProducts([highSugar, lowSugar], null);
        expect(ranked[0].product.name).toBe('Low Sugar');
    });
});

// ─── store self-heal + contributions ───────────────────────────────────────────

describe('intelligence store self-heal', () => {
    test('seed is queryable by name', async () => {
        await initIntelligence();
        const m = lookup({ brand: 'Britannia', name: 'Marie Gold', quantity: '250 g' });
        expect(m?.record.name).toBe('Marie Gold');
        expect(categoryProducts('biscuits').length).toBeGreaterThanOrEqual(3);
    });

    test('a remembered product becomes an instant barcode hit (fallback never repeats)', async () => {
        await initIntelligence();
        const fresh: Product = { barcode: '8909999999999', name: 'Brand New Namkeen', brand: 'Bikaji', quantity: '150 g', category: 'food', subCategory: 'snacks', nutrition: { sugars_100g: 2, proteins_100g: 12 } };
        expect(lookup({ barcode: '8909999999999' })).toBeNull();
        await remember(fresh, 'off');
        const m = lookup({ barcode: '8909999999999' });
        expect(m?.tier).toBe('barcode');
        expect(m?.record.source).toBe('off');
    });
});

describe('contribution queue', () => {
    test('enqueues product data and de-dupes', async () => {
        await clearContributions();
        const p: Product = { barcode: '8901111111111', name: 'Test Biscuit', brand: 'Test', category: 'food', nutrition: { sugars_100g: 10 } };
        await enqueueContribution(p, 'ocr');
        await enqueueContribution(p, 'ocr');
        const out = await exportContributions();
        expect(out.length).toBe(1);
        expect(out[0].name).toBe('Test Biscuit');
    });
});
