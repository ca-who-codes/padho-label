/**
 * productCatalog.ts
 *
 * Optional curated product catalog backed by Airtable. This is the FIRST source
 * the app checks on a barcode scan — before Open Food Facts and before OCR — so
 * the SKUs you care about (D2C brands, new/limited editions OFF hasn't indexed)
 * resolve instantly with authoritative data you control.
 *
 * Entirely opt-in: if the env vars below aren't set, `getProductFromCatalog`
 * returns null and the app behaves exactly as a plain OFF + OCR scanner.
 *
 * SECURITY: use a READ-ONLY Airtable Personal Access Token, scoped to this base
 * only (scope: data.records:read). It is bundled into the client, so a broad
 * token must never be used here. Worst case for a leaked read-only/base-scoped
 * token is that someone can read your public product catalog.
 */

import axios from 'axios';
import { Product, NutritionData } from '../types';

const BASE_ID = process.env.EXPO_PUBLIC_AIRTABLE_BASE_ID || '';
const TOKEN = process.env.EXPO_PUBLIC_AIRTABLE_TOKEN || '';
const TABLE = process.env.EXPO_PUBLIC_AIRTABLE_TABLE || 'Products';

/** True only when a base id and token are configured. */
export const isCatalogConfigured = (): boolean => !!(BASE_ID && TOKEN);

const numOf = (v: any): number | undefined => {
    if (typeof v === 'number') return isNaN(v) ? undefined : v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
    }
    return undefined;
};

/** Map an Airtable record's `fields` object to a Product. Pure + testable. */
export const mapAirtableFields = (f: Record<string, any>, barcode: string): Product => {
    const nutrition: NutritionData = {
        energy_100g: numOf(f['Energy (kJ)']),
        sugars_100g: numOf(f['Sugars']),
        added_sugars_100g: numOf(f['Added Sugars']),
        fat_100g: numOf(f['Fat']),
        saturated_fat_100g: numOf(f['Saturated Fat']),
        trans_fat_100g: numOf(f['Trans Fat']),
        carbohydrates_100g: numOf(f['Carbohydrates']),
        fiber_100g: numOf(f['Fiber']),
        proteins_100g: numOf(f['Protein']),
        salt_100g: numOf(f['Salt']),
        sodium_100g: numOf(f['Sodium']),
        serving_size_g: numOf(f['Serving Size']),
    };
    (Object.keys(nutrition) as (keyof NutritionData)[]).forEach(k => {
        if (nutrition[k] == null) delete nutrition[k];
    });

    return {
        barcode,
        name: (f['Name'] as string) || 'Unknown Product',
        brand: (f['Brand'] as string) || undefined,
        image_url: (f['Image URL'] as string) || undefined,
        ingredients: (f['Ingredients'] as string) || undefined,
        category: f['Category'] === 'beauty' ? 'beauty' : 'food',
        subCategory: (f['Sub Category'] as string) || undefined,
        nova_group: numOf(f['NOVA Group']),
        nutriscore_grade: (f['Nutriscore Grade'] as string) || undefined,
        nutrition,
        scannedAt: Date.now(),
    };
};

/**
 * Look up a barcode in the curated Airtable catalog.
 * Best-effort: returns null when not configured, not found, or on any error,
 * so callers can simply fall through to Open Food Facts.
 */
export const getProductFromCatalog = async (barcode: string): Promise<Product | null> => {
    if (!isCatalogConfigured()) return null;
    try {
        const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            // Sanitise the barcode (digits/quotes) before interpolating into the formula.
            params: { filterByFormula: `{Barcode}='${barcode.replace(/['"\\]/g, '')}'`, maxRecords: 1 },
            timeout: 8000,
        });
        const rec = res.data?.records?.[0];
        if (!rec || !rec.fields) return null;
        return mapAirtableFields(rec.fields, barcode);
    } catch {
        return null;
    }
};
