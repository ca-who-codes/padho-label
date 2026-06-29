/**
 * intelligence/normalize.ts
 *
 * Pure normalisation + match-key derivation. No I/O, fully unit-tested. This is the
 * single source of truth for how a product's identity keys are computed — both the
 * app and the catalog build pipeline route through here so keys never drift.
 */

// Marketing noise that adds nothing to identity; stripped before keying/fuzzy match.
const NOISE_WORDS = new Set([
    'the', 'a', 'an', 'with', 'of', 'and', 'pack', 'combo', 'value', 'offer',
    'pure', 'premium', 'classic', 'original', 'new', 'fresh', 'natural',
]);

/** Digits-only barcode; `undefined` if it can't be a real GTIN (too short). */
export const normalizeBarcode = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 8 ? digits : undefined;
};

const clean = (s?: string): string =>
    (s || '')
        .toLowerCase()
        .replace(/[®™©]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** OFF sometimes lists several comma-separated brands — keep the first, drop noise. */
export const normalizeBrand = (brand?: string): string =>
    clean((brand || '').split(',')[0])
        .split(' ')
        .filter(w => w && !NOISE_WORDS.has(w))
        .join(' ');

export const normalizeName = (name?: string): string =>
    clean(name)
        .split(' ')
        .filter(w => w && !NOISE_WORDS.has(w))
        .join(' ');

/**
 * Parse a quantity string into a canonical base-unit token:
 *   "200 g" -> "200g", "1 L" -> "1000ml", "75 g x 2" -> "150g".
 * Returns '' when no quantity can be read (so keying still works, just coarser).
 */
export const parseQuantity = (q?: string): string => {
    if (!q) return '';
    const text = String(q).toLowerCase().replace(/,/g, '');
    const UNIT = '(kg|g|gm|gram|grams|ml|l|litre|liter)';
    const toBase = (val: number, unit: string): string => {
        switch (unit) {
            case 'kg': return `${Math.round(val * 1000)}g`;
            case 'g': case 'gm': case 'gram': case 'grams': return `${Math.round(val)}g`;
            case 'l': case 'litre': case 'liter': return `${Math.round(val * 1000)}ml`;
            case 'ml': return `${Math.round(val)}ml`;
            default: return '';
        }
    };
    const mult = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\s*[x×]\\s*(\\d+)`));
    if (mult) {
        const base = toBase(parseFloat(mult[1]), mult[2]);
        if (!base) return '';
        const unit = base.replace(/[\d]/g, '');
        return `${parseInt(base, 10) * parseInt(mult[3], 10)}${unit}`;
    }
    const single = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\b`));
    return single ? toBase(parseFloat(single[1]), single[2]) : '';
};

/** Pack-independent identity: brand|name. Same value for the 75g and 200g packs. */
export const lineKey = (brand?: string, name?: string): string =>
    `${normalizeBrand(brand)}|${normalizeName(name)}`;

/** Exact SKU identity: brand|name|qty. */
export const matchKey = (brand?: string, name?: string, quantity?: string): string =>
    `${lineKey(brand, name)}|${parseQuantity(quantity)}`;

export const tokens = (name?: string): string[] =>
    normalizeName(name).split(' ').filter(Boolean);

/** Dice coefficient on token sets — symmetric, 0..1. Used for fuzzy matching. */
export const tokenSimilarity = (a?: string, b?: string): number => {
    const sa = new Set(tokens(a));
    const sb = new Set(tokens(b));
    if (sa.size === 0 || sb.size === 0) return 0;
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter++;
    return (2 * inter) / (sa.size + sb.size);
};
