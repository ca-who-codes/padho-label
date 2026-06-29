/**
 * pantryService.ts
 *
 * CRUD for pantry items + PantryScore computation.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PantryItem, HealthConstraints, Product } from '../types';
import { calculatePersonalizedScore } from './ratingEngine';
import { categoryProducts, rankProducts, lineKey } from './intelligence';

const PANTRY_KEY = '@padho_pantry_items';

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const getPantryItems = async (): Promise<PantryItem[]> => {
    try {
        const json = await AsyncStorage.getItem(PANTRY_KEY);
        return json ? JSON.parse(json) : [];
    } catch {
        return [];
    }
};

export const addToPantry = async (
    product: Product,
    personalizedScore: number,
    quantity?: number,
    unit?: 'g' | 'ml' | 'units',
    purchasedFrom?: string,
): Promise<PantryItem[]> => {
    const items = await getPantryItems();
    // If already in pantry, remove and re-add (update).
    const filtered = items.filter(i => i.productId !== product.barcode);
    const newItem: PantryItem = {
        id: `${product.barcode}_${Date.now()}`,
        productId: product.barcode,
        productName: product.name,
        productBrand: product.brand,
        productImage: product.image_url,
        productCategory: product.category,
        subCategory: product.subCategory,
        personalizedScore,
        addedAt: Date.now(),
        quantity,
        unit,
        purchasedFrom,
    };
    const updated = [newItem, ...filtered];
    await AsyncStorage.setItem(PANTRY_KEY, JSON.stringify(updated));
    return updated;
};

export const removeFromPantry = async (productId: string): Promise<PantryItem[]> => {
    const items = await getPantryItems();
    const updated = items.filter(i => i.productId !== productId);
    await AsyncStorage.setItem(PANTRY_KEY, JSON.stringify(updated));
    return updated;
};

export const clearPantry = async (): Promise<void> => {
    await AsyncStorage.removeItem(PANTRY_KEY);
};

export const isInPantry = async (productId: string): Promise<boolean> => {
    const items = await getPantryItems();
    return items.some(i => i.productId === productId);
};

// ─── Pantry Score ─────────────────────────────────────────────────────────────

/**
 * Weighted average of personalizedScore across all pantry items.
 * Returns a score from 0–100.
 */
export const computePantryScore = (items: PantryItem[]): number => {
    if (items.length === 0) return 0;
    const total = items.reduce((sum, item) => sum + item.personalizedScore, 0);
    return Math.round(total / items.length);
};

export const getPantryGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'E' => {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'E';
};

export const getGradeColor = (grade: 'A' | 'B' | 'C' | 'D' | 'E'): string => {
    const colors: Record<string, string> = {
        A: '#1B5E20', B: '#4CAF50', C: '#FFC107', D: '#FF9800', E: '#D32F2F',
    };
    return colors[grade] || '#888';
};

// ─── Category Breakdown ─────────────────────────────────────────────────────

export type CategoryBreakdown = {
    label: string;
    score: number;
    count: number;
};

export const getCategoryBreakdown = (items: PantryItem[]): CategoryBreakdown[] => {
    const foodItems = items.filter(i => i.productCategory !== 'beauty');
    const beautyItems = items.filter(i => i.productCategory === 'beauty');
    const result: CategoryBreakdown[] = [];

    if (foodItems.length > 0) {
        result.push({
            label: 'Food',
            score: computePantryScore(foodItems),
            count: foodItems.length,
        });
    }
    if (beautyItems.length > 0) {
        result.push({
            label: 'Beauty',
            score: computePantryScore(beautyItems),
            count: beautyItems.length,
        });
    }
    return result;
};

// ─── Swap Suggestions ────────────────────────────────────────────────────────

/**
 * Returns the worst 3 items (lowest personalizedScore) as swap candidates.
 */
export const getSwapCandidates = (items: PantryItem[]): PantryItem[] => {
    return [...items]
        .sort((a, b) => a.personalizedScore - b.personalizedScore)
        .slice(0, 3);
};

// ─── Concrete swap from the intelligence catalog ───────────────────────────────

export type PantrySwap = {
    fromId: string;
    toName: string;
    toBrand?: string;
    toScore: number;
    toProduct: Product;
};

/**
 * Find a concretely better-scored product in the same sub-category from the local
 * intelligence (seed + learned). Returns null unless something meaningfully better
 * exists. Requires `initIntelligence()` to have run; otherwise the catalog is empty
 * and this returns null gracefully.
 */
export const findBetterAlternative = (
    item: PantryItem,
    constraints: HealthConstraints | null,
): PantrySwap | null => {
    if (!item.subCategory) return null;
    const fromKey = lineKey(item.productBrand, item.productName);
    const pool = categoryProducts(item.subCategory).filter(p => lineKey(p.brand, p.name) !== fromKey);
    if (pool.length === 0) return null;
    const best = rankProducts(pool, constraints)[0];
    if (best && best.score >= item.personalizedScore + 8) {
        return {
            fromId: item.id,
            toName: best.product.name,
            toBrand: best.product.brand,
            toScore: best.score,
            toProduct: best.product,
        };
    }
    return null;
};
