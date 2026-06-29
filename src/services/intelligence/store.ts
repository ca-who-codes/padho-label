/**
 * intelligence/store.ts
 *
 * The local product intelligence: bundled seed catalog + a self-healing "learned"
 * cache in AsyncStorage. Whenever a scan resolves a product the slow way (Open Food
 * Facts or OCR), `remember()` writes it here so the *next* lookup is an instant
 * tier-1/tier-2 hit — the fallback never happens twice on the same device.
 *
 * Offline-first: no backend. The seed ships in the bundle; learned records live on
 * the device. Growing the SHARED catalog happens via the contribution queue
 * (see contributions.ts) which a maintainer promotes back into the seed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../../types';
import { IntelRecord, RawProduct, IntelSource, MatchConfidence, MatchQuery, MatchResult } from './types';
import { matchKey, lineKey, normalizeBarcode } from './normalize';
import { buildIndex, IntelIndex, selectBestMatch } from './match';
import { SEED } from './seed';

const LEARNED_KEY = '@padho/intel/learned';
const MAX_LEARNED = 2000;

let index: IntelIndex | null = null;
let learned: IntelRecord[] = [];

/** Wrap a raw/product into an indexed record, computing keys via the single source of truth. */
const toRecord = (p: RawProduct | Product, source: IntelSource, confidence: MatchConfidence = 'high'): IntelRecord => {
    const prod = p as Product;
    return {
        ...prod,
        barcode: prod.barcode || '',
        name: prod.name || 'Unknown Product',
        nutrition: prod.nutrition || {},
        category: prod.category || 'food',
        gtin: normalizeBarcode(prod.barcode),
        matchKey: matchKey(prod.brand, prod.name, prod.quantity),
        lineKey: lineKey(prod.brand, prod.name),
        source,
        confidence,
        verifiedAt: Date.now(),
    };
};

const rebuild = () => {
    const seedRecords = SEED.map(s => toRecord(s, s.source || 'seed'));
    // Learned records first so a freshly-resolved product wins over a stale seed.
    index = buildIndex([...learned, ...seedRecords]);
};

/** Load the learned cache and build the index. Idempotent. */
export const initIntelligence = async (): Promise<void> => {
    if (index) return;
    try {
        const raw = await AsyncStorage.getItem(LEARNED_KEY);
        learned = raw ? (JSON.parse(raw) as IntelRecord[]) : [];
    } catch {
        learned = [];
    }
    rebuild();
};

/** Run the resolution waterfall against the local intelligence. */
export const lookup = (q: MatchQuery): MatchResult | null => {
    if (!index) return null;
    return selectBestMatch(q, index);
};

/**
 * Write a resolved product into the learned cache (self-heal). De-dups by barcode
 * or exact SKU key so re-scanning refreshes rather than duplicates.
 */
export const remember = async (p: Product, source: IntelSource): Promise<void> => {
    if (!index) await initIntelligence();
    const rec = toRecord(p, source);
    learned = learned.filter(r => !(
        (rec.gtin && r.gtin === rec.gtin) || (!!r.matchKey && r.matchKey === rec.matchKey)
    ));
    learned.unshift(rec);
    if (learned.length > MAX_LEARNED) learned = learned.slice(0, MAX_LEARNED);
    try {
        await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
    } catch {
        // best-effort cache; a write failure just means we resolve the slow way next time
    }
    rebuild();
};

/** All records in a sub-category (or broad category) — powers ranked compare/browse. */
export const categoryProducts = (categoryOrSub: string): IntelRecord[] => {
    if (!index) return [];
    const key = categoryOrSub.toLowerCase();
    return index.all.filter(r => (r.subCategory || r.category || '').toLowerCase() === key);
};

export const intelligenceStats = (): { total: number; learned: number; seed: number } => ({
    total: index ? index.all.length : 0,
    learned: learned.length,
    seed: SEED.length,
});
