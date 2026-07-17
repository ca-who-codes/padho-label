/**
 * ratingEngine.ts — Padho Label 5.0
 *
 * Provides:
 *  - Base Nutri-Score (A–E) from nutrition data
 *  - Personalized score (0–100) adjusted for user goals/conditions
 *  - Ingredient-aware added-sugar estimation (stops over-penalising milk/fruit)
 *  - Sugar-in-teaspoons translation
 *  - "Why this grade" verdict reasons + controlled 'For You' bullets
 *  - Category-specific scoring thresholds
 *
 * Everything is deterministic and derived from structured data — zero hallucination.
 */

import { NutritionData, HealthConstraints, Product } from '../types';
import { Colors } from '../theme';

// ─── RDA (Generic Adult, 2000 kcal) ─────────────────────────────────────────

export const RDA = {
    energy: 2000,         // kcal
    fat: 70,              // g
    saturated_fat: 20,    // g
    carbohydrates: 260,   // g
    sugars: 50,           // g
    added_sugars: 25,     // g
    proteins: 50,         // g
    fiber: 30,            // g
    salt: 6,              // g
    sodium: 2400,         // mg
};

/** One teaspoon of sugar ≈ 4 g — the unit everyone actually understands. */
export const TEASPOON_G = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RatingResult = {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'E' | null;
    color: string;
    hasData: boolean;
};

export type NutrientStatus = 'positive' | 'negative' | 'fair' | 'low';

export type EnhancedRatingResult = RatingResult & {
    nutrients: Record<string, {
        value: number;
        unit: string;
        rdaPercentage: number;
        personalizedRdaPct?: number; // using HealthConstraints
        status: NutrientStatus;
    }>;
};

export type ForYouBullet = {
    emoji: string;
    text: string;
    severity: 'good' | 'warn' | 'bad' | 'tip';
};

export type VerdictReason = {
    text: string;
    tone: 'good' | 'warn' | 'bad';
};

// ─── Validity Check ───────────────────────────────────────────────────────────

const KEY_FIELDS: (keyof NutritionData)[] = [
    'energy_100g', 'sugars_100g', 'fat_100g', 'saturated_fat_100g', 'proteins_100g', 'salt_100g',
];

export const hasValidNutritionData = (nutrition: NutritionData): boolean => {
    const presentCount = KEY_FIELDS.filter(k => nutrition[k] !== undefined && nutrition[k] !== null).length;
    return presentCount >= 3;
};

// ─── Added-sugar estimation ───────────────────────────────────────────────────

/**
 * Terms that mean sugar was ADDED (vs naturally present lactose/fructose).
 * Includes the Indian-label staples: jaggery, gur, khandsari.
 */
const ADDED_SUGAR_RE = /\b(sugar|sucrose|glucose|dextrose|fructose syrup|maltodextrin|corn syrup|invert(?:ed)? (?:sugar|syrup)|liquid glucose|glucose syrup|hfcs|honey|jaggery|gur|khandsari|molasses|cane (?:sugar|juice)|caramel)\b/i;

const DAIRY_LACTOSE_ALLOWANCE_G = 5; // typical lactose in plain milk/curd per 100g

export type AddedSugarEstimate = {
    grams: number;
    /** true when we inferred (no explicit added-sugar figure on the label/data). */
    assumed: boolean;
};

/**
 * Best estimate of ADDED sugars per 100g.
 *
 * Order of trust:
 *  1. an explicit added_sugars figure
 *  2. the ingredients list — if no added-sugar term appears, the sugars are
 *     intrinsic (milk, fruit) and shouldn't be penalised as "added"
 *  3. category heuristics (plain dairy keeps a lactose allowance)
 *
 * This is what stops plain milk scoring like a cola.
 */
export const estimateAddedSugars = (product: Product): AddedSugarEstimate => {
    const n = product.nutrition || {};
    if (n.added_sugars_100g != null) return { grams: n.added_sugars_100g, assumed: false };

    const total = n.sugars_100g ?? 0;
    if (total <= 0) return { grams: 0, assumed: false };

    const ingredients = (product.ingredients || '').trim();
    if (ingredients) {
        return ADDED_SUGAR_RE.test(ingredients)
            ? { grams: total, assumed: true }   // sweetener on the label → treat sugars as added
            : { grams: 0, assumed: true };      // no sweetener listed → intrinsic sugars
    }

    const cat = (product.subCategory || '').toLowerCase();
    if (cat === 'dairy') return { grams: Math.max(0, total - DAIRY_LACTOSE_ALLOWANCE_G), assumed: true };
    // Juices/drinks: free sugars count as added (WHO guidance) — no allowance.
    return { grams: total, assumed: true };
};

/** Sugar translated into teaspoons (per the grams passed in). */
export const sugarTeaspoons = (grams: number): number =>
    Math.round((grams / TEASPOON_G) * 10) / 10;

// ─── Nutrient Status ──────────────────────────────────────────────────────────

export const getNutrientStatus = (type: string, val: number): NutrientStatus => {
    switch (type) {
        case 'sugars': return val > 15 ? 'negative' : val < 5 ? 'positive' : 'fair';
        case 'added_sugars': return val > 10 ? 'negative' : val < 3 ? 'positive' : 'fair';
        case 'saturated_fat': return val > 5 ? 'negative' : val < 1.5 ? 'positive' : 'fair';
        case 'salt': return val > 1.5 ? 'negative' : val < 0.3 ? 'positive' : 'fair';
        case 'fiber': return val > 6 ? 'positive' : val > 3 ? 'fair' : 'low';
        case 'proteins': return val > 10 ? 'positive' : val < 3 ? 'low' : 'fair';
        case 'energy': return val > 400 ? 'negative' : val < 100 ? 'positive' : 'fair';
        case 'trans_fat': return val > 0 ? 'negative' : 'positive';
        default: return 'fair';
    }
};

// ─── Base Nutri-Score ─────────────────────────────────────────────────────────

export const calculateNutriScore = (nutrition: NutritionData): EnhancedRatingResult => {
    if (!hasValidNutritionData(nutrition)) {
        return { score: 0, grade: null, color: Colors.textMuted, hasData: false, nutrients: {} };
    }

    let negative = 0;
    const energyKj = nutrition.energy_100g || 0;
    if (energyKj > 0) negative += Math.min(10, Math.floor(energyKj / 335));
    const satFat = nutrition.saturated_fat_100g || 0;
    if (satFat > 0) negative += Math.min(10, Math.floor(satFat));
    const sugars = nutrition.sugars_100g || 0;
    if (sugars > 0) negative += Math.min(10, Math.floor(sugars / 4.5));
    const sodiumMg = nutrition.sodium_100g != null
        ? nutrition.sodium_100g * 1000
        : (nutrition.salt_100g != null ? nutrition.salt_100g * 400 : 0);
    if (sodiumMg > 0) negative += Math.min(10, Math.floor(sodiumMg / 90));

    let positive = 0;
    const fiber = nutrition.fiber_100g || 0;
    if (fiber > 0) positive += Math.min(5, Math.floor(fiber / 0.7));
    const proteins = nutrition.proteins_100g || 0;
    if (proteins > 0) positive += Math.min(5, Math.floor(proteins / 1.6));

    const score = negative - positive;

    let grade: 'A' | 'B' | 'C' | 'D' | 'E';
    let color: string;
    if (score <= -1) { grade = 'A'; color = Colors.gradeA; }
    else if (score <= 2) { grade = 'B'; color = Colors.gradeB; }
    else if (score <= 10) { grade = 'C'; color = Colors.gradeC; }
    else if (score <= 18) { grade = 'D'; color = Colors.gradeD; }
    else { grade = 'E'; color = Colors.gradeE; }

    const kcal = Math.round(energyKj / 4.184);
    const nutrients: EnhancedRatingResult['nutrients'] = {
        energy: { value: kcal, unit: 'kcal', rdaPercentage: Math.round((kcal / RDA.energy) * 100), status: getNutrientStatus('energy', kcal) },
        fat: { value: nutrition.fat_100g || 0, unit: 'g', rdaPercentage: Math.round(((nutrition.fat_100g || 0) / RDA.fat) * 100), status: 'fair' },
        saturated_fat: { value: satFat, unit: 'g', rdaPercentage: Math.round((satFat / RDA.saturated_fat) * 100), status: getNutrientStatus('saturated_fat', satFat) },
        trans_fat: { value: nutrition.trans_fat_100g || 0, unit: 'g', rdaPercentage: 0, status: getNutrientStatus('trans_fat', nutrition.trans_fat_100g || 0) },
        carbohydrates: { value: nutrition.carbohydrates_100g || 0, unit: 'g', rdaPercentage: Math.round(((nutrition.carbohydrates_100g || 0) / RDA.carbohydrates) * 100), status: 'fair' },
        sugars: { value: sugars, unit: 'g', rdaPercentage: Math.round((sugars / RDA.sugars) * 100), status: getNutrientStatus('sugars', sugars) },
        added_sugars: { value: nutrition.added_sugars_100g || 0, unit: 'g', rdaPercentage: Math.round(((nutrition.added_sugars_100g || 0) / RDA.added_sugars) * 100), status: getNutrientStatus('added_sugars', nutrition.added_sugars_100g || 0) },
        proteins: { value: proteins, unit: 'g', rdaPercentage: Math.round((proteins / RDA.proteins) * 100), status: getNutrientStatus('proteins', proteins) },
        fiber: { value: fiber, unit: 'g', rdaPercentage: Math.round((fiber / RDA.fiber) * 100), status: getNutrientStatus('fiber', fiber) },
        sodium: { value: sodiumMg, unit: 'mg', rdaPercentage: Math.round((sodiumMg / RDA.sodium) * 100), status: getNutrientStatus('salt', nutrition.salt_100g ?? sodiumMg / 400) },
    };

    return { score, grade, color, hasData: true, nutrients };
};

/**
 * Map a raw Nutri-Score (lower = better, roughly -15…+40) to a 0–100 scale
 * (higher = better), clamped. Used when no personalised score is available.
 */
export const nutriScoreToPercent = (score: number): number =>
    Math.max(0, Math.min(100, Math.round(100 - (score + 5) * 4)));

// ─── Category Thresholds ──────────────────────────────────────────────────────

type CategoryThresholds = {
    addedSugarPenalty: number;
    satFatPenalty: number;
    sodiumPenalty: number;
    transFatPenalty: number;
    ultraProcessedPenalty: number;
    fiberBonus: number;
    proteinBonus: number;
    noSugarBonus: number;
};

export const getCategoryThresholds = (category?: string): CategoryThresholds => {
    const defaults: CategoryThresholds = {
        addedSugarPenalty: 12, satFatPenalty: 12, sodiumPenalty: 8,
        transFatPenalty: 20, ultraProcessedPenalty: 8,
        fiberBonus: 8, proteinBonus: 6, noSugarBonus: 10,
    };
    const map: Record<string, Partial<CategoryThresholds>> = {
        biscuits: { addedSugarPenalty: 15, satFatPenalty: 15 },
        cookies: { addedSugarPenalty: 15, satFatPenalty: 15 },
        drinks: { addedSugarPenalty: 25, sodiumPenalty: 10, ultraProcessedPenalty: 15 },
        beverages: { addedSugarPenalty: 25, sodiumPenalty: 10 },
        oils: { satFatPenalty: 20, transFatPenalty: 25 },
        breakfast: { addedSugarPenalty: 20, fiberBonus: 12 },
        snacks: { addedSugarPenalty: 14, satFatPenalty: 14, sodiumPenalty: 12 },
        dairy: { satFatPenalty: 10, proteinBonus: 10 },
        cereals: { addedSugarPenalty: 20, fiberBonus: 12 },
        noodles: { sodiumPenalty: 14, ultraProcessedPenalty: 12 },
        chocolates: { addedSugarPenalty: 18, satFatPenalty: 16 },
        sweets: { addedSugarPenalty: 20, satFatPenalty: 14 },
        spreads: { addedSugarPenalty: 16, satFatPenalty: 16 },
        sauces: { addedSugarPenalty: 16, sodiumPenalty: 14 },
        breads: { sodiumPenalty: 10, fiberBonus: 10 },
        icecream: { addedSugarPenalty: 18, satFatPenalty: 14 },
    };
    const key = (category || '').toLowerCase().replace(/[^a-z]/g, '');
    const override = map[key] || {};
    return { ...defaults, ...override };
};

// ─── Personalized Score ───────────────────────────────────────────────────────

/**
 * Returns a 0–100 score adjusted for the user's goals and conditions.
 * Higher is always better.
 */
export const calculatePersonalizedScore = (
    product: Product,
    constraints: HealthConstraints,
): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'E'; color: string } => {
    const n = product.nutrition;
    // Prefer the specific sub-category (e.g. "biscuits") over the broad
    // "food"/"beauty" so category-tuned thresholds actually kick in.
    const thresholds = getCategoryThresholds(product.subCategory || product.category);

    let penalty = 0;
    let bonus = 0;

    // Saturated fat
    const satFat = n.saturated_fat_100g || 0;
    const satFatPct = satFat / constraints.maxSatFatG;
    if (satFatPct > 0.5) penalty += thresholds.satFatPenalty * (satFatPct / 0.5);

    // Added sugars — ingredient-aware estimate (intrinsic lactose/fructose exempt)
    const addedSugar = estimateAddedSugars(product).grams;
    const totalSugar = n.sugars_100g ?? addedSugar;
    const sugarPct = addedSugar / constraints.maxAddedSugarsG;
    if (sugarPct > 0.3) penalty += thresholds.addedSugarPenalty * (sugarPct / 0.3);
    if (addedSugar === 0 && totalSugar < 8) bonus += thresholds.noSugarBonus;

    // Sodium
    const sodiumMg = n.sodium_100g != null ? n.sodium_100g * 1000 : (n.salt_100g || 0) * 400;
    const sodiumPct = sodiumMg / constraints.maxSodiumMg;
    if (sodiumPct > 0.5) penalty += thresholds.sodiumPenalty * (sodiumPct / 0.5);

    // Trans fat
    if (n.trans_fat_100g && n.trans_fat_100g > 0) penalty += thresholds.transFatPenalty;

    // NOVA ultra-processed
    if (product.nova_group === 4) penalty += thresholds.ultraProcessedPenalty;

    // Fiber bonus
    const fiber = n.fiber_100g || 0;
    const fiberPct = fiber / constraints.minFiberG;
    if (fiberPct > 0.15) bonus += thresholds.fiberBonus * Math.min(fiberPct / 0.15, 2);

    // Protein bonus
    const protein = n.proteins_100g || 0;
    const proteinPct = protein / constraints.minProteinG;
    if (proteinPct > 0.15) bonus += thresholds.proteinBonus * Math.min(proteinPct / 0.15, 2);

    // ── Goal multipliers ──────────────────────────────────────────────────────
    if (constraints.goalFlags.weight_loss) {
        const energyKcal = (n.energy_100g || 0) / 4.184;
        if (energyKcal > 400) penalty *= 1.3;
        bonus *= 1.2;
    }
    if (constraints.goalFlags.blood_sugar || constraints.conditionFlags.diabetes || constraints.conditionFlags.prediabetes) {
        // Spikes come from TOTAL sugars, not just added — use both signals.
        if (sugarPct > 0.2 || totalSugar > 15) penalty *= 1.8;
        if (fiber > 4) bonus *= 1.5;
    }
    if (constraints.goalFlags.heart || constraints.conditionFlags.hypertension) {
        if (satFatPct > 0.3) penalty *= 1.5;
        if (sodiumPct > 0.4) penalty *= 1.4;
    }
    if (constraints.goalFlags.muscle_gain) {
        bonus *= 1.4;
    }
    if (constraints.goalFlags.gut) {
        if (product.nova_group === 4) penalty *= 1.4;
        if (fiber > 4) bonus *= 1.4;
    }

    const raw = 100 - Math.min(penalty, 80) + Math.min(bonus, 30);
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    let grade: 'A' | 'B' | 'C' | 'D' | 'E';
    let color: string;
    if (score >= 80) { grade = 'A'; color = Colors.gradeA; }
    else if (score >= 65) { grade = 'B'; color = Colors.gradeB; }
    else if (score >= 50) { grade = 'C'; color = Colors.gradeC; }
    else if (score >= 35) { grade = 'D'; color = Colors.gradeD; }
    else { grade = 'E'; color = Colors.gradeE; }

    return { score, grade, color };
};

// ─── Verdict reasons ("Why this grade") ──────────────────────────────────────

/**
 * The top drivers behind the score, strongest first. Deterministic; used in the
 * result hero so the grade is never a mystery number.
 */
export const getVerdictReasons = (
    product: Product,
    constraints: HealthConstraints | null,
): VerdictReason[] => {
    const n = product.nutrition;
    if (!hasValidNutritionData(n)) return [];

    const maxAdded = constraints?.maxAddedSugarsG ?? RDA.added_sugars;
    const maxSat = constraints?.maxSatFatG ?? RDA.saturated_fat;
    const maxSodium = constraints?.maxSodiumMg ?? RDA.sodium;

    const added = estimateAddedSugars(product);
    const satFat = n.saturated_fat_100g || 0;
    const sodiumMg = n.sodium_100g != null ? n.sodium_100g * 1000 : (n.salt_100g || 0) * 400;
    const fiber = n.fiber_100g || 0;
    const protein = n.proteins_100g || 0;

    const reasons: (VerdictReason & { w: number })[] = [];

    if (n.trans_fat_100g && n.trans_fat_100g > 0) {
        reasons.push({ tone: 'bad', text: 'Contains trans fat', w: 100 });
    }
    const sugarPct = added.grams / maxAdded;
    if (sugarPct >= 0.6) reasons.push({ tone: 'bad', text: `High added sugar (${added.grams.toFixed(0)}g/100g)`, w: 60 + sugarPct * 20 });
    else if (added.grams === 0 && (n.sugars_100g ?? 0) < 5) reasons.push({ tone: 'good', text: 'No added sugar', w: 40 });

    const satPct = satFat / maxSat;
    if (satPct >= 0.5) reasons.push({ tone: 'bad', text: `High saturated fat (${satFat.toFixed(1)}g/100g)`, w: 55 + satPct * 20 });
    else if (satFat > 0 && satFat < 1.5) reasons.push({ tone: 'good', text: 'Low saturated fat', w: 30 });

    const sodPct = sodiumMg / maxSodium;
    if (sodPct >= 0.5) reasons.push({ tone: 'bad', text: `High sodium (${Math.round(sodiumMg)}mg/100g)`, w: 50 + sodPct * 20 });

    if (product.nova_group === 4) reasons.push({ tone: 'warn', text: 'Ultra-processed (NOVA 4)', w: 45 });
    else if (product.nova_group && product.nova_group <= 2) reasons.push({ tone: 'good', text: 'Minimally processed', w: 35 });

    if (fiber >= 6) reasons.push({ tone: 'good', text: `Good fibre (${fiber.toFixed(1)}g/100g)`, w: 38 });
    if (protein >= 10) reasons.push({ tone: 'good', text: `Protein-rich (${protein.toFixed(1)}g/100g)`, w: 36 });

    return reasons.sort((a, b) => b.w - a.w).slice(0, 4).map(({ tone, text }) => ({ tone, text }));
};

// ─── For You Bullets ──────────────────────────────────────────────────────────

/**
 * Generates 4–6 personalized, human-readable bullets.
 * Uses ONLY structured nutrition + profile data. Zero hallucination.
 */
export const generateForYouBullets = (
    product: Product,
    constraints: HealthConstraints,
): ForYouBullet[] => {
    const n = product.nutrition;
    const bullets: ForYouBullet[] = [];

    const satFat = n.saturated_fat_100g || 0;
    const satFatPct = Math.round((satFat / constraints.maxSatFatG) * 100);
    const added = estimateAddedSugars(product);
    const addedSugar = added.grams;
    const totalSugar = n.sugars_100g ?? 0;
    const sugarPct = Math.round((addedSugar / constraints.maxAddedSugarsG) * 100);
    const sodiumMg = n.sodium_100g != null ? n.sodium_100g * 1000 : (n.salt_100g || 0) * 400;
    const fiber = n.fiber_100g || 0;
    const protein = n.proteins_100g || 0;
    const transFat = n.trans_fat_100g;
    const kcal = Math.round((n.energy_100g || 0) / 4.184);

    // Diabetes / blood sugar — total sugars matter, not just added
    const isDiabetic = constraints.conditionFlags.diabetes || constraints.conditionFlags.prediabetes;
    if (isDiabetic) {
        if (totalSugar > 15 || addedSugar > 8) {
            const tsp = sugarTeaspoons(totalSugar || addedSugar);
            bullets.push({
                emoji: '🔴',
                text: `Not diabetes-friendly — ${ (totalSugar || addedSugar).toFixed(1)}g sugar per 100g (≈${tsp} tsp) will spike blood glucose. Look for a lower-sugar option.`,
                severity: 'bad',
            });
        } else if (fiber > 4) {
            bullets.push({
                emoji: '✅',
                text: `Better for blood sugar — the fibre (${fiber.toFixed(1)}g/100g) slows glucose absorption. Still eat in moderation.`,
                severity: 'good',
            });
        }
    }

    // Saturated fat
    if (satFat > 8) {
        bullets.push({
            emoji: '⚠️',
            text: `High saturated fat (${satFat.toFixed(1)}g/100g — ~${satFatPct}% of your personal daily limit). Keep servings small.`,
            severity: 'warn',
        });
    } else if (n.saturated_fat_100g != null && satFat < 2) {
        bullets.push({
            emoji: '✅',
            text: `Low saturated fat (${satFat.toFixed(1)}g/100g) — good for heart health.`,
            severity: 'good',
        });
    }

    // Trans fat — only make claims when the label actually declares it
    if (transFat != null && transFat > 0) {
        bullets.push({
            emoji: '🔴',
            text: `Contains trans fat (${transFat.toFixed(1)}g/100g). Trans fats are strongly linked to heart disease — avoid.`,
            severity: 'bad',
        });
    } else if (transFat === 0) {
        bullets.push({
            emoji: '✅',
            text: 'Zero trans fat declared — good.',
            severity: 'good',
        });
    }

    // Added sugar (ingredient-aware)
    if (addedSugar > 15) {
        bullets.push({
            emoji: '⚠️',
            text: `Added sugar is high (${addedSugar.toFixed(1)}g/100g ≈ ${sugarTeaspoons(addedSugar)} tsp — ~${sugarPct}% of your daily limit). Best as an occasional treat.`,
            severity: 'warn',
        });
    } else if (addedSugar === 0 && totalSugar > 0 && added.assumed) {
        bullets.push({
            emoji: '✅',
            text: `The ${totalSugar.toFixed(1)}g sugar here looks naturally occurring (no added sweetener on the label).`,
            severity: 'good',
        });
    } else if (addedSugar === 0 && totalSugar === 0) {
        bullets.push({
            emoji: '✅',
            text: 'Sugar-free — excellent choice.',
            severity: 'good',
        });
    } else if (addedSugar > 0 && addedSugar < 5) {
        bullets.push({
            emoji: '✅',
            text: `Low added sugar (${addedSugar.toFixed(1)}g/100g) — within a sensible daily budget.`,
            severity: 'good',
        });
    }

    // Fiber
    if (fiber > 5) {
        bullets.push({
            emoji: '✅',
            text: `Good source of fibre (${fiber.toFixed(1)}g/100g) — helps satiety, gut health, and blunts the sugar spike.`,
            severity: 'good',
        });
    } else if (fiber < 1.5) {
        bullets.push({
            emoji: '💡',
            text: `Low fibre (${fiber.toFixed(1)}g/100g). Pair with a high-fibre food to slow digestion.`,
            severity: 'tip',
        });
    }

    // Protein
    if (constraints.goalFlags.muscle_gain && protein > 10) {
        bullets.push({
            emoji: '💪',
            text: `Good protein hit (${protein.toFixed(1)}g/100g) — supports muscle recovery and growth.`,
            severity: 'good',
        });
    } else if (constraints.goalFlags.muscle_gain && protein < 5) {
        bullets.push({
            emoji: '💡',
            text: `Low protein (${protein.toFixed(1)}g/100g). For your muscle-gain goal, pair with a protein-rich food.`,
            severity: 'tip',
        });
    }

    // Sodium
    const sodiumPct = Math.round((sodiumMg / constraints.maxSodiumMg) * 100);
    if (sodiumMg > 500) {
        bullets.push({
            emoji: '⚠️',
            text: `High sodium (${Math.round(sodiumMg)}mg/100g — ~${sodiumPct}% of your daily limit). Watch your intake${constraints.conditionFlags.hypertension ? ' — important for your blood pressure' : ''}.`,
            severity: 'warn',
        });
    }

    // Weight loss — calorie density
    if (constraints.goalFlags.weight_loss && kcal > 450) {
        bullets.push({
            emoji: '💡',
            text: `Calorie-dense (${kcal} kcal/100g). Watch your portion size — factor it into your daily budget.`,
            severity: 'tip',
        });
    }

    // NOVA group
    if (product.nova_group === 4) {
        bullets.push({
            emoji: '⚠️',
            text: 'Ultra-processed (NOVA 4). Linked to higher long-term health risks — limit frequency.',
            severity: 'warn',
        });
    } else if (product.nova_group && product.nova_group <= 2) {
        bullets.push({
            emoji: '✅',
            text: `Minimally processed (NOVA ${product.nova_group}) — a cleaner, less processed product.`,
            severity: 'good',
        });
    }

    // Overall recommendation if not enough bullets
    if (bullets.length < 3) {
        bullets.push({
            emoji: '💡',
            text: 'Nutrition data is limited. Scan the ingredients label for a full picture.',
            severity: 'tip',
        });
    }

    return bullets.slice(0, 6);
};

// ─── Verdict helper ───────────────────────────────────────────────────────────

export const getVerdictText = (score: number, category?: string): string => {
    if (score >= 80) return 'Excellent choice';
    if (score >= 65) return 'Good for regular use';
    if (score >= 50) return 'Okay in moderation';
    if (score >= 35) return 'Use sparingly';
    return 'Avoid — look for better options';
};
