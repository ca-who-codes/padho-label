/**
 * intelligence/types.ts
 *
 * Shared types for Padho's product intelligence — the scored catalog that powers
 * smart shopping. The intelligence stores the *ingredients of a score* (objective,
 * per-100g nutrition + ingredients/additives), never the personalised verdict; the
 * rating engine personalises at runtime so the same record serves a diabetic and a
 * bodybuilder differently with zero extra storage.
 */

import { Product } from '../../types';

/** Where a record came from. Lower-trust sources are flagged so QA can prioritise. */
export type IntelSource = 'seed' | 'airtable' | 'off' | 'ocr' | 'contribution';

/** Which rung of the resolution waterfall produced a match. */
export type MatchTier = 'barcode' | 'key' | 'line' | 'fuzzy';

export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * The editable, source-agnostic product shape. This is what the seed catalog and
 * the contribution queue hold. The build pipeline emits an array of these; the
 * store turns each into an `IntelRecord` by computing match keys at load time, so
 * keys are always derived by one code path (no drift between tooling and app).
 */
export type RawProduct = {
    barcode?: string;
    name: string;
    brand?: string;
    quantity?: string;
    image_url?: string;
    ingredients?: string;
    category?: 'food' | 'beauty';
    subCategory?: string;
    nova_group?: number;
    nutriscore_grade?: string;
    nutrition: Product['nutrition'];
    source?: IntelSource;
};

/** A product placed into the in-memory index, with computed match keys. */
export type IntelRecord = Product & {
    gtin?: string;        // normalised barcode used for exact lookup
    matchKey: string;     // brand | name | qty       — exact SKU identity
    lineKey: string;      // brand | name             — pack-independent (per-100g identical)
    source: IntelSource;
    confidence: MatchConfidence;
    verifiedAt: number;
};

export type MatchQuery = {
    barcode?: string;
    name?: string;
    brand?: string;
    quantity?: string;
};

export type MatchResult = {
    record: IntelRecord;
    tier: MatchTier;
    confidence: MatchConfidence;
};
