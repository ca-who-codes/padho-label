/**
 * ocrNutrition.ts
 *
 * Reads a photographed nutrition label and extracts structured values.
 *
 * OCR provider: OCR.space free API (https://ocr.space/ocrapi) — 25,000
 * requests/month free, no card required. Set EXPO_PUBLIC_OCRSPACE_API_KEY to
 * your own free key for production; the shared "helloworld" demo key is used as
 * a fallback for local testing only (heavily rate-limited).
 *
 * The OCR step (image → raw text) is isolated in `recognizeText` so it can be
 * swapped for an on-device engine (e.g. Google ML Kit) later without touching
 * the parser. Everything downstream works on plain text.
 */

import axios from 'axios';
import * as ImageManipulator from 'expo-image-manipulator';
import { NutritionData } from '../types';

const OCR_API_KEY = process.env.EXPO_PUBLIC_OCRSPACE_API_KEY || 'helloworld';
const OCR_URL = 'https://api.ocr.space/parse/image';

/** True when a real (non-demo) OCR key is configured. */
export const isOCRConfigured = (): boolean =>
    !!process.env.EXPO_PUBLIC_OCRSPACE_API_KEY;

// ─── OCR: image → raw text ──────────────────────────────────────────────────

/**
 * Runs OCR on a local image URI and returns the recognised text, or null on
 * failure. Never throws — the caller decides how to surface failure.
 */
export const runOCROnImage = async (imageUri: string): Promise<string | null> => {
    try {
        // Compress + resize so we stay well under OCR.space's 1 MB free-tier
        // limit, while keeping enough resolution for label text.
        const manipulated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1280 } }],
            { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (!manipulated.base64) return null;

        const form = new FormData();
        form.append('base64Image', `data:image/jpeg;base64,${manipulated.base64}`);
        form.append('apikey', OCR_API_KEY);
        form.append('language', 'eng');
        form.append('OCREngine', '2');     // engine 2 handles small label text well
        form.append('scale', 'true');
        form.append('detectOrientation', 'true');

        const res = await axios.post(OCR_URL, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 25000,
        });

        const data = res.data;
        if (!data || data.IsErroredOnProcessing) return null;
        const text = data.ParsedResults?.[0]?.ParsedText;
        return text ? String(text) : null;
    } catch (err) {
        console.warn('OCR error:', err);
        return null;
    }
};

// ─── Parse recognised text → NutritionData ──────────────────────────────────

/**
 * Parse raw OCR text from a nutrition label into a NutritionData object.
 * Handles the common per-100g label formats seen on Indian/EU packaging.
 */
export const parseNutritionFromText = (text: string): Partial<NutritionData> => {
    if (!text) return {};
    const t = text.toLowerCase().replace(/\s+/g, ' ');
    const result: Partial<NutritionData> = {};

    const num = (pattern: RegExp): number | undefined => {
        const m = t.match(pattern);
        if (!m || m[1] == null) return undefined;
        const n = parseFloat(m[1].replace(',', '.'));
        return isNaN(n) ? undefined : n;
    };

    // Energy — kJ preferred; fall back to kcal (× 4.184)
    const energyKj = num(/energ(?:y|ie)[^\d]*(\d+[.,]?\d*)\s*kj/);
    const energyKcal = num(/(?:energ(?:y|ie)|calories?)[^\d]*(\d+[.,]?\d*)\s*kcal/);
    if (energyKj != null) result.energy_100g = energyKj;
    else if (energyKcal != null) result.energy_100g = Math.round(energyKcal * 4.184);

    result.fat_100g = num(/(?:^|[^a-z])fat[^\d]*(\d+[.,]?\d*)\s*g/);

    result.saturated_fat_100g =
        num(/saturat(?:es?|ed fat)[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/sat\.?\s*fat[^\d]*(\d+[.,]?\d*)\s*g/);

    result.carbohydrates_100g =
        num(/carbohydrat(?:e|es)[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/carbs?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.sugars_100g =
        num(/of which[^,]*sugar[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/sugars?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.fiber_100g =
        num(/dieta(?:ry)?\s*fib(?:re|er)[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/fib(?:re|er)[^\d]*(\d+[.,]?\d*)\s*g/);

    result.proteins_100g = num(/proteins?[^\d]*(\d+[.,]?\d*)\s*g/);

    // Salt / sodium
    const saltVal = num(/salt[^\d]*(\d+[.,]?\d*)\s*g/);
    const sodiumVal = num(/sodium[^\d]*(\d+[.,]?\d*)\s*(?:g|mg)/);
    if (saltVal != null) {
        result.salt_100g = saltVal;
    } else if (sodiumVal != null) {
        // Heuristic: values > 1 are almost certainly mg, otherwise g.
        result.sodium_100g = sodiumVal > 1 ? sodiumVal / 1000 : sodiumVal;
        result.salt_100g = parseFloat((result.sodium_100g * 2.5).toFixed(3));
    }

    const cholMg = num(/cholesterol[^\d]*(\d+[.,]?\d*)\s*mg/);
    if (cholMg != null) result.cholesterol_mg_100g = cholMg;

    // Drop any keys that came back undefined so callers can count real hits.
    (Object.keys(result) as (keyof NutritionData)[]).forEach(k => {
        if (result[k] == null) delete result[k];
    });
    return result;
};

/**
 * Merge OCR-extracted nutrition into existing product nutrition.
 * Existing (API) values win; OCR only fills the gaps.
 */
export const mergeNutrition = (
    existing: NutritionData,
    ocr: Partial<NutritionData>,
): NutritionData => {
    const merged: NutritionData = { ...(existing || {}) };
    if (!ocr) return merged;
    (Object.keys(ocr) as (keyof NutritionData)[]).forEach(key => {
        if ((!existing || existing[key] == null) && ocr[key] != null) {
            (merged as any)[key] = ocr[key];
        }
    });
    return merged;
};
