/**
 * intelligence/resolve.ts
 *
 * The public entry point for product resolution. Local-first: it checks the
 * intelligence (seed + learned cache) before touching the network, and on any
 * external resolution it writes the result back so the slow path never runs twice.
 *
 *   resolveByBarcode -> [local intelligence] -> [Airtable + Open Food Facts] -> self-heal
 */

import { Product } from '../../types';
import { getProductByBarcode } from '../api';
import { initIntelligence, lookup, remember } from './store';
import { enqueueContribution } from './contributions';

/**
 * Resolve a scanned barcode. Returns the product, or null if genuinely unknown
 * everywhere. Throws Error('network…') when every remote attempt failed on
 * connectivity (same contract as the underlying api call) so callers can retry.
 */
export const resolveByBarcode = async (barcode: string): Promise<Product | null> => {
    await initIntelligence();

    const local = lookup({ barcode });
    if (local) return local.record;

    // Miss → external fallback (Airtable catalog + Open Food Facts). May throw 'network'.
    const remote = await getProductByBarcode(barcode);
    if (remote) {
        await remember(remote, 'off');            // self-heal: instant hit next time
        await enqueueContribution(remote, 'off'); // grow the shared catalog
    }
    return remote;
};

/**
 * Persist a product that was completed via OCR or manual edit. After this the
 * product is permanent local intelligence and is queued for the shared catalog.
 */
export const rememberProduct = async (
    product: Product,
    source: 'ocr' | 'off' | 'contribution' = 'ocr',
): Promise<void> => {
    if (!product || !product.name) return;
    await remember(product, source);
    await enqueueContribution(product, source);
};
