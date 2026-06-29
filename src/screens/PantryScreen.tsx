import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    FlatList, Image, Animated,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, PantryItem } from '../types';
import { getPantryItems, computePantryScore, getPantryGrade, getGradeColor, getSwapCandidates, removeFromPantry, findBetterAlternative, type PantrySwap } from '../services/pantryService';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { Package, TrendingUp, Trash2, Camera, ShoppingCart } from 'lucide-react-native';
import { initIntelligence } from '../services/intelligence';
import { getHealthConstraints } from '../services/userProfileService';
import { openOnSwiggy } from '../services/swiggy';

type Props = BottomTabScreenProps<RootStackParamList, 'Pantry'>;

export default function PantryScreen({ navigation }: Props) {
    const [items, setItems] = useState<PantryItem[]>([]);
    const [swaps, setSwaps] = useState<Record<string, PantrySwap>>({});
    const isFocused = useIsFocused();

    const load = useCallback(async () => {
        const data = await getPantryItems();
        setItems(data);
        // Concrete swap suggestions from the intelligence catalog.
        await initIntelligence();
        let constraints = null;
        try { constraints = await getHealthConstraints(); } catch { constraints = null; }
        const map: Record<string, PantrySwap> = {};
        for (const it of data) {
            if (it.personalizedScore < 55) {
                const alt = findBetterAlternative(it, constraints);
                if (alt) map[it.id] = alt;
            }
        }
        setSwaps(map);
    }, []);

    useEffect(() => { if (isFocused) load(); }, [isFocused, load]);

    const handleRemove = async (productId: string) => {
        const updated = await removeFromPantry(productId);
        setItems(updated);
    };

    const pantryScore = computePantryScore(items);
    const grade = getPantryGrade(pantryScore);
    const gradeColor = getGradeColor(grade);
    const swapCandidates = getSwapCandidates(items);
    const foodItems = items.filter(i => i.productCategory !== 'beauty');
    const beautyItems = items.filter(i => i.productCategory === 'beauty');

    const renderItem = (item: PantryItem) => {
        const scoreColor = item.personalizedScore >= 65 ? Colors.success : item.personalizedScore >= 45 ? Colors.warning : Colors.danger;
        return (
            <View key={item.id} style={styles.itemCard}>
                {item.productImage ? (
                    <Image source={{ uri: item.productImage }} style={styles.itemImage} />
                ) : (
                    <View style={[styles.itemImage, { backgroundColor: Colors.divider, alignItems: 'center', justifyContent: 'center' }]}>
                        <Package color={Colors.textMuted} size={20} />
                    </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
                    {item.productBrand && <Text style={styles.itemBrand}>{item.productBrand}</Text>}
                    <View style={styles.itemScoreRow}>
                        <View style={[styles.scoreBar, { width: `${item.personalizedScore}%` as any, backgroundColor: scoreColor }]} />
                        <Text style={[styles.itemScore, { color: scoreColor }]}>{item.personalizedScore}/100</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => handleRemove(item.productId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Trash2 color={Colors.danger} size={18} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.wrapper}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Pantry 🧺</Text>
                <Text style={styles.headerSub}>{items.length} product{items.length !== 1 ? 's' : ''} tracked</Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
                {/* Pantry Score Header */}
                <View style={styles.scoreCard}>
                    <View style={[styles.gradeCircle, { borderColor: gradeColor }]}>
                        <View style={[styles.gradeInner, { backgroundColor: gradeColor }]}>
                            <Text style={styles.gradeText}>{items.length > 0 ? grade : '?'}</Text>
                        </View>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.pantryScoreLabel}>Pantry Health Score</Text>
                        <Text style={[styles.pantryScore, { color: gradeColor }]}>{items.length > 0 ? `${pantryScore}/100` : 'No items yet'}</Text>
                        <Text style={styles.pantryScoreSub}>Weighted average of all your scanned products</Text>
                    </View>
                </View>

                {/* Category breakdown */}
                {items.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Category Breakdown</Text>
                        {foodItems.length > 0 && (
                            <View style={styles.breakdownRow}>
                                <Text style={styles.breakdownLabel}>🍎 Food ({foodItems.length})</Text>
                                <View style={styles.breakdownBarBg}>
                                    <View style={[styles.breakdownBarFill, { width: `${computePantryScore(foodItems)}%` as any, backgroundColor: Colors.primary }]} />
                                </View>
                                <Text style={[styles.breakdownScore, { color: Colors.primary }]}>{computePantryScore(foodItems)}</Text>
                            </View>
                        )}
                        {beautyItems.length > 0 && (
                            <View style={styles.breakdownRow}>
                                <Text style={styles.breakdownLabel}>💄 Beauty ({beautyItems.length})</Text>
                                <View style={styles.breakdownBarBg}>
                                    <View style={[styles.breakdownBarFill, { width: `${computePantryScore(beautyItems)}%` as any, backgroundColor: '#E91E63' }]} />
                                </View>
                                <Text style={[styles.breakdownScore, { color: '#E91E63' }]}>{computePantryScore(beautyItems)}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Swap Suggestions */}
                {swapCandidates.length > 0 && swapCandidates[0].personalizedScore < 55 && (
                    <View style={styles.section}>
                        <View style={styles.swapHeader}>
                            <TrendingUp color={Colors.warning} size={18} />
                            <Text style={styles.sectionTitle}>Upgrade These 🔄</Text>
                        </View>
                        {swapCandidates.filter(s => s.personalizedScore < 55).map(item => {
                            const swap = swaps[item.id];
                            return (
                            <View key={item.id} style={styles.swapCard}>
                                {item.productImage && <Image source={{ uri: item.productImage }} style={styles.swapImage} />}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.swapName} numberOfLines={1}>{item.productName}</Text>
                                    {swap ? (
                                        <Text style={styles.swapScore} numberOfLines={2}>
                                            <Text style={{ color: Colors.danger }}>{item.personalizedScore}/100 → </Text>
                                            <Text style={{ color: Colors.success }}>try {swap.toName} ({swap.toScore})</Text>
                                        </Text>
                                    ) : (
                                        <Text style={[styles.swapScore, { color: Colors.danger }]}>Score {item.personalizedScore}/100 · Look for a better alternative</Text>
                                    )}
                                </View>
                                {swap && (
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 }}
                                        onPress={() => openOnSwiggy(`${swap.toBrand || ''} ${swap.toName}`)}
                                    >
                                        <ShoppingCart color="#fff" size={14} />
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Swiggy</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        );})}
                    </View>
                )}

                {/* Product list */}
                {items.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={{ fontSize: 48 }}>🧺</Text>
                        <Text style={styles.emptyTitle}>Your pantry is empty</Text>
                        <Text style={styles.emptyDesc}>Scan a product and tap "Add to Pantry" to track your household staples.</Text>
                        <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('Scan')}>
                            <Camera color="#fff" size={18} />
                            <Text style={styles.scanBtnText}>Scan a Product</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>All Products</Text>
                        {items.map(renderItem)}
                    </View>
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Scan')}>
                <Camera color="#fff" size={24} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },
    header: {
        backgroundColor: Colors.primary, paddingTop: 50, paddingBottom: 20, paddingHorizontal: Spacing.lg,
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

    scoreCard: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        backgroundColor: '#fff', margin: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg, ...Shadow.md,
    },
    gradeCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    gradeInner: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
    gradeText: { fontSize: 24, fontWeight: '900', color: '#fff' },
    pantryScoreLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
    pantryScore: { fontSize: 22, fontWeight: '900', marginTop: 2 },
    pantryScoreSub: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

    section: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.md, ...Shadow.sm },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },

    breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    breakdownLabel: { fontSize: 13, color: Colors.textSecondary, width: 110 },
    breakdownBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.divider, overflow: 'hidden' },
    breakdownBarFill: { height: '100%', borderRadius: 4 },
    breakdownScore: { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },

    swapHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    swapCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    swapImage: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.divider, resizeMode: 'contain' },
    swapName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    swapScore: { fontSize: 12, marginTop: 2 },

    itemCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    itemImage: { width: 44, height: 44, borderRadius: Radius.sm, resizeMode: 'contain' },
    itemName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    itemBrand: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    itemScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
    scoreBar: { height: 4, borderRadius: 2 },
    itemScore: { fontSize: 11, fontWeight: '800' },

    emptyState: { alignItems: 'center', padding: Spacing.xxl, gap: 12 },
    emptyTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
    emptyDesc: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    fab: { position: 'absolute', right: 20, bottom: 30, backgroundColor: Colors.primary, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...Shadow.lg },
});
