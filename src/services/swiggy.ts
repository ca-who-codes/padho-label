/**
 * swiggy.ts
 *
 * Swiggy is a per-user TRANSACTION rail, not a data source — its Instamart MCP
 * needs each end user's delegated OAuth token (no app token), exposes no pincode
 * read, and returns no nutrition. So Padho's catalog stays Swiggy-independent and
 * we touch Swiggy only at the buy moment.
 *
 * Until delegated in-app checkout (update_cart → checkout) clears Swiggy's gated
 * production access, the seamless, no-auth path is a deep link into Instamart with
 * the chosen product pre-searched. The user completes the purchase in Swiggy with
 * their own account and payment — exactly the boundary we keep (build the basket,
 * never the checkout).
 */

import { Linking } from 'react-native';

/** Instamart search deep link for a product query. */
export const instamartSearchUrl = (query: string): string =>
    `https://www.swiggy.com/instamart/search?custom_back=true&query=${encodeURIComponent(query.trim())}`;

/** Open the product on Swiggy Instamart (app via universal link, else browser). */
export const openOnSwiggy = async (query: string): Promise<boolean> => {
    if (!query || !query.trim()) return false;
    try {
        await Linking.openURL(instamartSearchUrl(query));
        return true;
    } catch {
        return false;
    }
};
