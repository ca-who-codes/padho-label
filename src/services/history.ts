import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '../types';

const HISTORY_KEY = '@padho_label_history';

export const saveToHistory = async (product: Product) => {
    try {
        const existingHistory = await getHistory();
        const filtered = existingHistory.filter(p => p.barcode !== product.barcode);
        const newHistory = [product, ...filtered].slice(0, 50);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    } catch (error) {
        console.error('Error saving to history:', error);
    }
};

export const getHistory = async (): Promise<Product[]> => {
    try {
        const json = await AsyncStorage.getItem(HISTORY_KEY);
        return json ? JSON.parse(json) : [];
    } catch (error) {
        console.error('Error getting history:', error);
        return [];
    }
};

export const clearHistory = async () => {
    try {
        await AsyncStorage.removeItem(HISTORY_KEY);
    } catch (error) {
        console.error('Error clearing history:', error);
    }
};

/** Update a single field on an existing product in history (e.g. ingredientsImageUri). */
export const updateProductInHistory = async (
    barcode: string,
    updates: Partial<Product>
): Promise<Product | null> => {
    try {
        const history = await getHistory();
        const idx = history.findIndex(p => p.barcode === barcode);
        if (idx === -1) return null;
        history[idx] = { ...history[idx], ...updates };
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return history[idx];
    } catch (error) {
        console.error('Error updating product in history:', error);
        return null;
    }
};

export const getHistoryCount = async (): Promise<number> => {
    const h = await getHistory();
    return h.length;
};

/** Remove a single product from history. Returns the updated list. */
export const removeFromHistory = async (barcode: string): Promise<Product[]> => {
    try {
        const history = await getHistory();
        const updated = history.filter(p => p.barcode !== barcode);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        return updated;
    } catch (error) {
        console.error('Error removing from history:', error);
        return getHistory();
    }
};
