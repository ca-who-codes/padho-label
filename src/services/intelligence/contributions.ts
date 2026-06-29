/**
 * intelligence/contributions.ts
 *
 * A device-local queue of products discovered the slow way (Open Food Facts / OCR).
 * It is how the SHARED catalog grows without a backend: a user can export the queue,
 * and a maintainer promotes it into the seed via `npm run promote` + `npm run
 * build:catalog`. Contains product data only — never user PII.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../../types';
import { IntelSource, RawProduct } from './types';

const QUEUE_KEY = '@padho/intel/contributions';
const MAX_QUEUE = 1000;

const toRaw = (p: Product, source: IntelSource): RawProduct => ({
    barcode: p.barcode || undefined,
    name: p.name,
    brand: p.brand,
    quantity: p.quantity,
    image_url: p.image_url,
    ingredients: p.ingredients,
    category: p.category,
    subCategory: p.subCategory,
    nova_group: p.nova_group,
    nutriscore_grade: p.nutriscore_grade,
    nutrition: p.nutrition,
    source,
});

const dedupeKey = (x: RawProduct): string =>
    `${x.barcode || ''}|${(x.brand || '').toLowerCase()}|${x.name.toLowerCase()}`;

/** Queue a newly-discovered product for promotion into the shared catalog. */
export const enqueueContribution = async (p: Product, source: IntelSource): Promise<void> => {
    if (!p || !p.name) return;
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        const list: RawProduct[] = raw ? JSON.parse(raw) : [];
        const incoming = toRaw(p, source);
        if (list.some(x => dedupeKey(x) === dedupeKey(incoming))) return;
        list.unshift(incoming);
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(0, MAX_QUEUE)));
    } catch {
        // best-effort
    }
};

export const exportContributions = async (): Promise<RawProduct[]> => {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? (JSON.parse(raw) as RawProduct[]) : [];
    } catch {
        return [];
    }
};

export const clearContributions = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
        // best-effort
    }
};

export const contributionCount = async (): Promise<number> =>
    (await exportContributions()).length;
