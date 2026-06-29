/**
 * intelligence/rank.ts
 *
 * Compare-and-decide: rank a set of products for a user. Ranking is deterministic
 * (the rating engine, no LLM) and leads with the axis the user's profile makes
 * decisive — sugar for a diabetic, sodium for hypertension, protein for muscle gain.
 */

import { Product, HealthConstraints } from '../../types';
import { calculatePersonalizedScore, calculateNutriScore, nutriScoreToPercent } from '../ratingEngine';

export type DecisiveAxis = 'sugar' | 'sodium' | 'energy' | 'protein' | 'satfat' | 'overall';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';

export type RankedProduct = {
    product: Product;
    score: number;
    grade: Grade;
    color: string;
    axis: DecisiveAxis;
    axisValue?: number;
    reason: string;
};

/** Which nutrient matters most for this profile. */
export const decisiveAxisFor = (c: HealthConstraints | null): DecisiveAxis => {
    if (!c) return 'overall';
    if (c.conditionFlags.diabetes || c.conditionFlags.prediabetes || c.goalFlags.blood_sugar) return 'sugar';
    if (c.conditionFlags.hypertension || c.goalFlags.heart) return 'sodium';
    if (c.goalFlags.muscle_gain) return 'protein';
    if (c.goalFlags.weight_loss) return 'energy';
    return 'overall';
};

const axisValue = (p: Product, axis: DecisiveAxis): number | undefined => {
    const n = p.nutrition;
    switch (axis) {
        case 'sugar': return n.added_sugars_100g ?? n.sugars_100g;
        case 'sodium': return n.sodium_100g != null ? n.sodium_100g * 1000
            : (n.salt_100g != null ? Math.round(n.salt_100g * 400) : undefined);
        case 'energy': return n.energy_100g != null ? Math.round(n.energy_100g / 4.184) : undefined;
        case 'protein': return n.proteins_100g;
        case 'satfat': return n.saturated_fat_100g;
        default: return undefined;
    }
};

const reasonFor = (axis: DecisiveAxis, v: number | undefined, grade: Grade): string => {
    const r = (x: number) => Math.round(x);
    switch (axis) {
        case 'sugar': return v != null ? `${r(v)} g sugar / 100 g` : 'sugar data missing';
        case 'sodium': return v != null ? `${r(v)} mg sodium / 100 g` : 'sodium data missing';
        case 'energy': return v != null ? `${r(v)} kcal / 100 g` : 'energy data missing';
        case 'protein': return v != null ? `${r(v)} g protein / 100 g` : 'protein data missing';
        case 'satfat': return v != null ? `${r(v)} g sat fat / 100 g` : 'sat-fat data missing';
        default: return `grade ${grade}`;
    }
};

const gradeFromScore = (score: number): { grade: Grade; color: string } => {
    if (score >= 80) return { grade: 'A', color: '#1b5e20' };
    if (score >= 65) return { grade: 'B', color: '#4caf50' };
    if (score >= 50) return { grade: 'C', color: '#fbc02d' };
    if (score >= 35) return { grade: 'D', color: '#f57c00' };
    return { grade: 'E', color: '#d32f2f' };
};

/**
 * Score and sort products best-first. With a profile (constraints) it personalises;
 * without one it falls back to the base Nutri-Score so ranking still works pre-login.
 */
export const rankProducts = (
    products: Product[],
    constraints: HealthConstraints | null,
): RankedProduct[] => {
    const axis = decisiveAxisFor(constraints);
    return products
        .map((product): RankedProduct => {
            let score: number;
            let grade: Grade;
            let color: string;
            if (constraints) {
                const s = calculatePersonalizedScore(product, constraints);
                score = s.score; grade = s.grade; color = s.color;
            } else {
                const base = calculateNutriScore(product.nutrition);
                score = base.hasData ? nutriScoreToPercent(base.score) : 0;
                ({ grade, color } = gradeFromScore(score));
            }
            const v = axisValue(product, axis);
            return { product, score, grade, color, axis, axisValue: v, reason: reasonFor(axis, v, grade) };
        })
        .sort((a, b) => b.score - a.score);
};
