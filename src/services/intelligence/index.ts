/**
 * intelligence/index.ts — barrel for Padho's product intelligence layer.
 */

export * from './types';
export {
    normalizeBarcode, normalizeBrand, normalizeName,
    parseQuantity, lineKey, matchKey, tokens, tokenSimilarity,
} from './normalize';
export { buildIndex, selectBestMatch } from './match';
export type { IntelIndex } from './match';
export { rankProducts, decisiveAxisFor } from './rank';
export type { RankedProduct, DecisiveAxis, Grade } from './rank';
export {
    initIntelligence, lookup, remember, categoryProducts, intelligenceStats,
} from './store';
export {
    enqueueContribution, exportContributions, clearContributions, contributionCount,
} from './contributions';
export { resolveByBarcode, rememberProduct } from './resolve';
