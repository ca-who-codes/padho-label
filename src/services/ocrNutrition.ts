/**
 * ocrNutrition.ts
 *
 * Uses Gemini Vision API to extract nutrition values from label photos.
 * Falls back to local regex parsing if the API call fails.
 */

import axios from 'axios';
import { NutritionData } from '../types';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_VISION_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ─── OCR via Gemini Vision ─────────────────────────────────────────────────

/**
 * Send a photo of a nutrition label to Gemini Vision and get back
 * structured nutrition data. Returns the raw text for fallback parsing
 * and directly parsed values from the model.
 */
export const runOCROnImage = async (
    imageUri: string,
): Promise<string | null> => {
    if (!GEMINI_API_KEY) return null;

    try {
        const base64 = await imageToBase64(imageUri);

        const response = await axios.post(
            GEMINI_VISION_URL,
            {
                contents: [
                    {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'image/jpeg',
                                    data: base64,
                                },
                            },
                            {
                                text: `Read this nutrition label image carefully and extract ALL nutritional values.
Return ONLY a JSON object with these exact keys (use null for values not visible):
{
  "energy_kcal": number or null,
  "energy_kj": number or null,
  "fat_g": number or null,
  "saturated_fat_g": number or null,
  "trans_fat_g": number or null,
  "carbohydrates_g": number or null,
  "sugars_g": number or null,
  "added_sugars_g": number or null,
  "fiber_g": number or null,
  "proteins_g": number or null,
  "salt_g": number or null,
  "sodium_mg": number or null,
  "cholesterol_mg": number or null,
  "serving_size_g": number or null
}

Important:
- All values should be per 100g/100ml. If the label only shows per serving, note the serving size and convert.
- Return ONLY valid JSON, no markdown, no explanation.
- Use numbers only, no units in the values.`,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 512,
                },
            },
            { timeout: 20000 },
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text || null;
    } catch (err) {
        console.error('Gemini Vision OCR error:', err);
        return null;
    }
};

/** Convert a local image URI to base64. */
const imageToBase64 = (uri: string): Promise<string> =>
    new Promise((resolve, reject) => {
        fetch(uri)
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.split(',')[1] ?? result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            })
            .catch(reject);
    });

// ─── Parse Gemini JSON response ────────────────────────────────────────────

/**
 * Parse the Gemini Vision JSON response into NutritionData.
 * Falls back to regex parsing if JSON parsing fails.
 */
export const parseNutritionFromText = (text: string): Partial<NutritionData> => {
    // Try to parse as structured JSON first (from Gemini)
    const jsonResult = parseGeminiJson(text);
    if (jsonResult && Object.keys(jsonResult).length > 0) return jsonResult;

    // Fallback: regex parsing for raw OCR text
    return parseNutritionRegex(text);
};

/** Parse the structured JSON that Gemini returns. */
const parseGeminiJson = (text: string): Partial<NutritionData> | null => {
    try {
        // Strip markdown code fences if present
        const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
        const data = JSON.parse(cleaned);
        const result: Partial<NutritionData> = {};

        // Energy: prefer kJ, convert kcal to kJ if only kcal available
        if (data.energy_kj != null) {
            result.energy_100g = data.energy_kj;
        } else if (data.energy_kcal != null) {
            result.energy_100g = Math.round(data.energy_kcal * 4.184);
        }

        if (data.fat_g != null) result.fat_100g = data.fat_g;
        if (data.saturated_fat_g != null) result.saturated_fat_100g = data.saturated_fat_g;
        if (data.trans_fat_g != null) result.trans_fat_100g = data.trans_fat_g;
        if (data.carbohydrates_g != null) result.carbohydrates_100g = data.carbohydrates_g;
        if (data.sugars_g != null) result.sugars_100g = data.sugars_g;
        if (data.added_sugars_g != null) result.added_sugars_100g = data.added_sugars_g;
        if (data.fiber_g != null) result.fiber_100g = data.fiber_g;
        if (data.proteins_g != null) result.proteins_100g = data.proteins_g;
        if (data.salt_g != null) result.salt_100g = data.salt_g;
        if (data.sodium_mg != null) result.sodium_100g = data.sodium_mg / 1000; // store as g
        if (data.cholesterol_mg != null) result.cholesterol_mg_100g = data.cholesterol_mg;
        if (data.serving_size_g != null) result.serving_size_g = data.serving_size_g;

        // Only return if we actually got values
        const hasValues = Object.values(result).some(v => v != null);
        return hasValues ? result : null;
    } catch {
        return null;
    }
};

// ─── Regex Nutrition Parser (Fallback) ─────────────────────────────────────

/**
 * Parse raw OCR text (from a nutrition label) into a NutritionData object.
 * Handles common label formats from major markets.
 */
const parseNutritionRegex = (text: string): Partial<NutritionData> => {
    const t = text.toLowerCase().replace(/\s+/g, ' ');
    const result: Partial<NutritionData> = {};

    const num = (pattern: RegExp): number | undefined => {
        const m = t.match(pattern);
        if (!m) return undefined;
        const n = parseFloat(m[1].replace(',', '.'));
        return isNaN(n) ? undefined : n;
    };

    // Energy — kJ preferred; fallback kcal (multiply by 4.184)
    const energyKj = num(/energ(?:y|ie)[^\d]*(\d+[\.,]?\d*)\s*kj/);
    const energyKcal = num(/(?:energ(?:y|ie)|calories?)[^\d]*(\d+[\.,]?\d*)\s*kcal/);
    if (energyKj != null) result.energy_100g = energyKj;
    else if (energyKcal != null) result.energy_100g = Math.round(energyKcal * 4.184);

    // Fat
    result.fat_100g = num(/(?:^|[^a-z])fat[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Saturated fat
    result.saturated_fat_100g =
        num(/saturat(?:es?|ed fat)[^\d]*(\d+[\.,]?\d*)\s*g/) ??
        num(/sat\.?\s*fat[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Carbohydrates
    result.carbohydrates_100g =
        num(/carbohydrat(?:e|es)[^\d]*(\d+[\.,]?\d*)\s*g/) ??
        num(/carbs?[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Sugars
    result.sugars_100g =
        num(/of which[^,]*sugar[^\d]*(\d+[\.,]?\d*)\s*g/) ??
        num(/sugar[s]?[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Fibre / Fiber
    result.fiber_100g =
        num(/dieta(?:ry)?\s*fib(?:re|er)[^\d]*(\d+[\.,]?\d*)\s*g/) ??
        num(/fib(?:re|er)[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Protein
    result.proteins_100g = num(/protein[s]?[^\d]*(\d+[\.,]?\d*)\s*g/);

    // Salt / sodium
    const saltVal = num(/salt[^\d]*(\d+[\.,]?\d*)\s*g/);
    const sodiumVal = num(/sodium[^\d]*(\d+[\.,]?\d*)\s*(?:g|mg)/);

    if (saltVal != null) {
        result.salt_100g = saltVal;
    } else if (sodiumVal != null) {
        result.sodium_100g = sodiumVal > 1 ? sodiumVal / 1000 : sodiumVal;
        result.salt_100g = sodiumVal > 1
            ? parseFloat((sodiumVal * 2.5 / 1000).toFixed(3))
            : parseFloat((sodiumVal * 2.5).toFixed(3));
    }

    // Cholesterol
    const cholMg = num(/cholesterol[^\d]*(\d+[\.,]?\d*)\s*mg/);
    if (cholMg != null) result.cholesterol_mg_100g = cholMg;

    return result;
};

/**
 * Merge OCR-extracted nutrition into existing product nutrition.
 * Existing API values are kept; OCR values fill in the gaps.
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
