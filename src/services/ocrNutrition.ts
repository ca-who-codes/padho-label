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

/** OCR outcome — text on success, a human-readable reason on failure. */
export type OCRResult = { text: string | null; error: string | null };

/** Turn an OCR.space / network error into a short, actionable message. */
const explainOcrError = (raw: string): string => {
    const low = raw.toLowerCase();
    if (low.includes('rate') || low.includes('limit') || low.includes('exceed') || low.includes('throttl')) {
        return 'OCR is rate-limited (shared demo key). Add a free OCR.space key to fix this.';
    }
    if (low.includes('size') || low.includes('large') || low.includes('1 mb') || low.includes('1mb') || low.includes('filesize')) {
        return 'Photo too large for OCR — step back a little and retry.';
    }
    if (low.includes('apikey') || low.includes('api key') || low.includes('invalid')) {
        return 'OCR key was rejected. Set EXPO_PUBLIC_OCRSPACE_API_KEY.';
    }
    return raw.slice(0, 140);
};

// ─── OCR: image → raw text ──────────────────────────────────────────────────

/**
 * Runs OCR on a local image URI. Never throws — returns { text, error } so the
 * caller can both use the text and tell the user *why* it failed.
 *
 * Sends the image as application/x-www-form-urlencoded rather than multipart:
 * React Native + axios do not reliably set the multipart boundary, which
 * silently corrupts the upload and was making every OCR call fail.
 */
export const runOCROnImage = async (imageUri: string): Promise<OCRResult> => {
    let base64: string | undefined;
    try {
        // Resize/compress to stay comfortably under OCR.space's 1 MB free-tier
        // limit (base64 inflates ~33%) while keeping label text legible.
        const manipulated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ resize: { width: 1000 } }],
            { compress: 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        base64 = manipulated.base64 ?? undefined;
    } catch {
        return { text: null, error: 'Could not read the captured photo. Retry.' };
    }
    if (!base64) return { text: null, error: 'Could not read the captured photo. Retry.' };

    const body = [
        `base64Image=${encodeURIComponent(`data:image/jpeg;base64,${base64}`)}`,
        `apikey=${encodeURIComponent(OCR_API_KEY)}`,
        'language=eng',
        'OCREngine=2',     // engine 2 handles small label text well
        'isTable=true',    // nutrition panels are tables
        'scale=true',
        'detectOrientation=true',
    ].join('&');

    try {
        const res = await axios.post(OCR_URL, body, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 25000,
        });
        const data = res.data;
        if (data?.IsErroredOnProcessing) {
            const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : data.ErrorMessage;
            return { text: null, error: explainOcrError(String(msg || 'OCR failed.')) };
        }
        const text = data?.ParsedResults?.[0]?.ParsedText;
        if (!text || !String(text).trim()) {
            return { text: null, error: 'No text detected. Fill the frame with the label and use good light.' };
        }
        return { text: String(text), error: null };
    } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) return { text: null, error: 'OCR key was rejected. Set EXPO_PUBLIC_OCRSPACE_API_KEY.' };
        if (err?.code === 'ECONNABORTED') return { text: null, error: 'OCR timed out. Check your connection and retry.' };
        return { text: null, error: 'OCR service unavailable. Retry, or type the values in below.' };
    }
};

// ─── Parse recognised text → NutritionData ──────────────────────────────────

/**
 * Parse raw OCR text from a nutrition label into a NutritionData object.
 * Handles the common per-100g label formats seen on Indian/EU packaging,
 * including "Energy (kcal) 450" column layouts and declared trans fat.
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

    // Energy — kJ preferred; fall back to kcal (× 4.184).
    // Indian labels write both "Energy 450 kcal" and "Energy (kcal) 450".
    const energyKj =
        num(/energ(?:y|ie)[^\d]*(\d+[.,]?\d*)\s*kj/) ??
        num(/energy\s*\(\s*kj\s*\)[^\d]*(\d+[.,]?\d*)/);
    const energyKcal =
        num(/(?:energ(?:y|ie)|calories?)[^\d]*(\d+[.,]?\d*)\s*kcal/) ??
        num(/energy\s*\(\s*kcal\s*\)[^\d]*(\d+[.,]?\d*)/) ??
        num(/(\d+[.,]?\d*)\s*kcal/);
    if (energyKj != null) result.energy_100g = energyKj;
    else if (energyKcal != null) result.energy_100g = Math.round(energyKcal * 4.184);

    // Trans fat must be read BEFORE total fat so its value can't be mistaken.
    result.trans_fat_100g = num(/trans[\s-]*fat(?:ty acids?)?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.saturated_fat_100g =
        num(/saturat(?:es?|ed)(?:\s*fat(?:ty acids?)?)?[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/sat\.?\s*fat[^\d]*(\d+[.,]?\d*)\s*g/);

    result.fat_100g =
        num(/total\s*fat[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/(?:^|[^a-z\-])fat[^\d]*(\d+[.,]?\d*)\s*g/);

    result.carbohydrates_100g =
        num(/(?:total\s*)?carbohydrat(?:e|es)[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/carbs?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.added_sugars_100g = num(/added\s*sugars?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.sugars_100g =
        num(/of which[^,]*sugar[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/total\s*sugars?[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/sugars?[^\d]*(\d+[.,]?\d*)\s*g/);

    result.fiber_100g =
        num(/dieta(?:ry)?\s*fib(?:re|er)[^\d]*(\d+[.,]?\d*)\s*g/) ??
        num(/fib(?:re|er)[^\d]*(\d+[.,]?\d*)\s*g/);

    result.proteins_100g = num(/proteins?[^\d]*(\d+[.,]?\d*)\s*g/);

    // Salt / sodium — prefer explicit units; fall back to the >1 ⇒ mg heuristic.
    const saltVal = num(/salt[^\d]*(\d+[.,]?\d*)\s*g/);
    const sodiumMg = num(/sodium[^\d]*(\d+[.,]?\d*)\s*mg/);
    const sodiumG = num(/sodium[^\d]*(\d+[.,]?\d*)\s*g/);
    if (saltVal != null) {
        result.salt_100g = saltVal;
    } else if (sodiumMg != null || sodiumG != null) {
        const grams = sodiumMg != null
            ? sodiumMg / 1000
            : (sodiumG! > 1 ? sodiumG! / 1000 : sodiumG!);
        result.sodium_100g = grams;
        result.salt_100g = parseFloat((grams * 2.5).toFixed(3));
    }

    const cholMg = num(/cholesterol[^\d]*(\d+[.,]?\d*)\s*mg/);
    if (cholMg != null) result.cholesterol_mg_100g = cholMg;

    const serving = num(/serving size[^\d]*(\d+[.,]?\d*)\s*g/);
    if (serving != null) result.serving_size_g = serving;

    // Drop any keys that came back undefined so callers can count real hits.
    (Object.keys(result) as (keyof NutritionData)[]).forEach(k => {
        if (result[k] == null) delete result[k];
    });
    return result;
};

// ─── Extract the ingredients list from OCR text ──────────────────────────────

/** Phrases that mark the END of an ingredients block on a label. */
const INGREDIENTS_TERMINATORS =
    /(nutrition(?:al)? (?:information|facts)|allergen (?:advice|information)|contains added|may contain|storage|store in|net (?:wt|weight|quantity)|best before|use by|mfd|mfg|manufactured|marketed by|packed by|customer care|fssai|batch no)/i;

/**
 * Pull the ingredients list out of raw label OCR text. The screen is called
 * "IngredientsSnap" — as of v5 it finally extracts ingredients, which is what
 * powers additive, allergen and diet detection for products OFF doesn't know.
 */
export const extractIngredientsFromText = (text: string): string | null => {
    if (!text) return null;
    const flat = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');
    const startMatch = flat.match(/ingredients?\s*[:\-–]?\s*/i);
    if (!startMatch || startMatch.index == null) return null;

    let block = flat.slice(startMatch.index + startMatch[0].length);
    const endMatch = block.match(INGREDIENTS_TERMINATORS);
    if (endMatch && endMatch.index != null) block = block.slice(0, endMatch.index);

    block = block.trim().replace(/[.,;\s]+$/, '');
    // Too short to be a real list ⇒ OCR noise, don't pretend.
    if (block.length < 12) return null;
    return block.length > 900 ? `${block.slice(0, 900)}…` : block;
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
