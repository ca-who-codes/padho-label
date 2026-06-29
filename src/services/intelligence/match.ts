/**
 * intelligence/match.ts
 *
 * The resolution waterfall — pure, testable, no I/O. Given a query and an index of
 * records, it tries the rungs in order of decreasing certainty:
 *
 *   1. barcode / GTIN   — exact, deterministic
 *   2. brand+name+qty   — exact SKU identity
 *   3. brand+name       — same product, different pack (per-100g identical)
 *   4. fuzzy            — token similarity within the same brand, ONLY if unambiguous
 *
 * Trust rule: an ambiguous fuzzy match is treated as a miss. In a health product a
 * confident *wrong* score is worse than honestly returning nothing.
 */

import { IntelRecord, MatchQuery, MatchResult } from './types';
import { normalizeBarcode, normalizeBrand, matchKey, lineKey, tokenSimilarity } from './normalize';

const FUZZY_ACCEPT = 0.72;   // minimum similarity to even consider a fuzzy match
const FUZZY_MARGIN = 0.12;   // winner must beat the runner-up by this much

export type IntelIndex = {
    byBarcode: Map<string, IntelRecord>;
    byKey: Map<string, IntelRecord>;
    byLine: Map<string, IntelRecord[]>;
    all: IntelRecord[];
};

export const buildIndex = (records: IntelRecord[]): IntelIndex => {
    const byBarcode = new Map<string, IntelRecord>();
    const byKey = new Map<string, IntelRecord>();
    const byLine = new Map<string, IntelRecord[]>();
    for (const r of records) {
        const bc = normalizeBarcode(r.gtin || r.barcode);
        if (bc && !byBarcode.has(bc)) byBarcode.set(bc, r);
        if (r.matchKey && !byKey.has(r.matchKey)) byKey.set(r.matchKey, r);
        if (r.lineKey) {
            const arr = byLine.get(r.lineKey);
            if (arr) arr.push(r); else byLine.set(r.lineKey, [r]);
        }
    }
    return { byBarcode, byKey, byLine, all: records };
};

export const selectBestMatch = (q: MatchQuery, idx: IntelIndex): MatchResult | null => {
    // 1 — barcode / GTIN
    const bc = normalizeBarcode(q.barcode);
    if (bc) {
        const hit = idx.byBarcode.get(bc);
        if (hit) return { record: hit, tier: 'barcode', confidence: 'high' };
    }

    if (q.name) {
        // 2 — exact brand + name + qty
        const keyHit = idx.byKey.get(matchKey(q.brand, q.name, q.quantity));
        if (keyHit) return { record: keyHit, tier: 'key', confidence: 'high' };

        // 3 — same product line, different pack
        const lineHit = idx.byLine.get(lineKey(q.brand, q.name));
        if (lineHit && lineHit.length) return { record: lineHit[0], tier: 'line', confidence: 'high' };

        // 4 — fuzzy within the same brand, must be unambiguous
        const brand = normalizeBrand(q.brand);
        const scored = idx.all
            .filter(r => !brand || normalizeBrand(r.brand) === brand)
            .map(r => ({ r, s: tokenSimilarity(q.name, r.name) }))
            .sort((a, b) => b.s - a.s);
        const [best, runner] = scored;
        if (best && best.s >= FUZZY_ACCEPT && (!runner || best.s - runner.s >= FUZZY_MARGIN)) {
            return { record: best.r, tier: 'fuzzy', confidence: 'low' };
        }
    }

    return null;
};
