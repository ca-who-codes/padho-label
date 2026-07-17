/**
 * PantryScreen — v5 polish: safe areas, cleaner cards, concrete swap
 * suggestions from the local catalog with a Swiggy hand-off.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, PantryItem } from '../types';
import {
    getPantryItems, computePantryScore, getPantryGrade, removeFromPantry,
    findBetterAlternative, getSwapCandidates, type PantrySwap,
} from '../services/pantryService';
import { Colors, Spacing, Radius, Shadow, gradeColor, scoreColor } from '../theme';
import { Package, TrendingUp, Trash2, ScanBarcode, ShoppingCart } from 'lucide-react-native';
import { initIntelligence } from '../services/intelligence';
import { getHealthConstraints } from '../services/userProfileService';
import { openOnSwiggy } from '../services/swiggy';
import { AppHeader, ScoreRing, EmptyState, SectionCard } from '../components';

type Props = BottomTabScreenProps<RootStackParamList, 'Pantry'>;

export default function PantryScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
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
    const swapCandidates = getSwapCandidates(items).filter(s => s.personalizedScore < 55);
    const foodItems = items.filter(i => i.productCategory !== 'beauty');
    const beautyItems = items.filter(i => i.productCategory === 'beauty');

    const renderItem = (item: PantryItem) => {
        const sc = scoreColor(item.personalizedScore);
        return (
            <View key={item.id} style={styles.itemCard}>
                {item.productImage ? (
                    <Image source={{ uri: item.productImage }} style={styles.itemImage} />
                ) : (
                    <View style={[styles.itemImage, { backgroundColor: Colors.divider, alignItems: 'center', justifyContent: 'center' }]}>
                        <Package color={Colors.textMuted} size={18} />
                    </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.productName}</Text>
                    {item.productBrand && <Text style={styles.itemBrand}>{item.productBrand}</Text>}
                    <View style={styles.itemScoreRow}>
                        <View style={styles.itemScoreBarBg}>
                            <View style={[styles.itemScoreBar, { width: `${item.personalizedScore}%`, backgroundColor: sc }]} />
                        </View>
                        <Text style={[styles.itemScore, { color: sc }]}>{item.personalizedScore}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => handleRemove(item.productId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Trash2 color={Colors.textMuted} size={18} />
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.wrapper}>
            <AppHeader
                title="My Pantry"
                subtitle={`${items.length} product${items.length !== 1 ? 's' : ''} tracked`}
            />

            <ScrollView contentContainerStyle={{ paddingBottom: 100 + insets.bottom }} showsVerticalScrollIndicator={false}>
                {/* Pantry health */}
                <View style={styles.scoreCard}>
                    <ScoreRing
                        score={items.length > 0 ? pantryScore : null}
                        grade={items.length > 0 ? grade : null}
                        color={gradeColor(grade)}
                        size={104}
                        strokeWidth={9}
                    />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.pantryScoreLabel}>Pantry Health</Text>
                        <Text style={[styles.pantryScore, { color: items.length ? gradeColor(grade) : Colors.textMuted }]}>
                            {items.length > 0 ? `${pantryScore}/100` : 'No items yet'}
                        </Text>
                        <Text style={styles.pantryScoreSub}>
                            Average personalised score of everything you stock at home.
                        </Text>
                    </View>
                </View>

                {/* Category breakdown */}
                {items.length > 0 && (foodItems.length > 0 && beautyItems.length > 0) && (
                    <SectionCard title="Breakdown" style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md }}>
                        <View style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>🍎 Food ({foodItems.length})</Text>
                            <View style={styles.breakdownBarBg}>
                                <View style={[styles.breakdownBarFill, { width: `${computePantryScore(foodItems)}%`, backgroundColor: Colors.primary }]} />
                            </View>
                            <Text style={[styles.breakdownScore, { color: Colors.primary }]}>{computePantryScore(foodItems)}</Text>
                        </View>
                        <View style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>💄 Beauty ({beautyItems.length})</Text>
                            <View style={styles.breakdownBarBg}>
                                <View style={[styles.breakdownBarFill, { width: `${computePantryScore(beautyItems)}%`, backgroundColor: Colors.beauty }]} />
                            </View>
                            <Text style={[styles.breakdownScore, { color: Colors.beauty }]}>{computePantryScore(beautyItems)}</Text>
                        </View>
                    </SectionCard>
                )}

                {/* Swap Suggestions */}
                {swapCandidates.length > 0 && (
                    <SectionCard
                        title="Upgrade these"
                        icon={TrendingUp}
                        iconColor={Colors.warning}
                        style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md }}
                    >
                        {swapCandidates.map(item => {
                            const swap = swaps[item.id];
                            return (
                                <View key={item.id} style={styles.swapCard}>
                                    {item.productImage ? (
                                        <Image source={{ uri: item.productImage }} style={styles.swapImage} />
                                    ) : (
                                        <View style={[styles.swapImage, { alignItems: 'center', justifyContent: 'center' }]}>
                                            <Package color={Colors.textMuted} size={16} />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.swapName} numberOfLines={1}>{item.productName}</Text>
                                        {swap ? (
                                            <Text style={styles.swapScore} numberOfLines={2}>
                                                <Text style={{ color: Colors.danger, fontWeight: '800' }}>{item.personalizedScore}</Text>
                                                <Text style={{ color: Colors.textMuted }}> → try </Text>
                                                <Text style={{ color: Colors.success, fontWeight: '800' }}>{swap.toName} ({swap.toScore})</Text>
                                            </Text>
                                        ) : (
                                            <Text style={[styles.swapScore, { color: Colors.danger }]}>Scores {item.personalizedScore}/100 — look for a better option</Text>
                                        )}
                                    </View>
                                    {swap && (
                                        <TouchableOpacity
                                            style={styles.swapBuyBtn}
                                            onPress={() => openOnSwiggy(`${swap.toBrand || ''} ${swap.toName}`)}
                                        >
                                            <ShoppingCart color="#fff" size={13} />
                                            <Text style={styles.swapBuyText}>Swiggy</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        })}
                    </SectionCard>
                )}

                {/* Product list */}
                {items.length === 0 ? (
                    <EmptyState
                        emoji="🧺"
                        title="Your pantry is empty"
                        body={'Scan a product and tap "Add to Pantry" to track what you stock — and get swap suggestions for the weak spots.'}
                        ctaLabel="Scan a Product"
                        onCta={() => navigation.navigate('Scan')}
                    />
                ) : (
                    <SectionCard title="All products" style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.md }}>
                        {items.map(renderItem)}
                    </SectionCard>
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={[styles.fab, { bottom: 24 + insets.bottom }]}
                onPress={() => navigation.navigate('Scan')}
            >
                <ScanBarcode color="#fff" size={24} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },

    scoreCard: {
        flexDirection: 'row', alignItems: 'center', gap: 18,
        backgroundColor: Colors.card, marginHorizontal: Spacing.md, marginBottom: Spacing.md,
        borderRadius: Radius.xxl, padding: Spacing.lg, ...Shadow.md,
    },
    pantryScoreLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
    pantryScore: { fontSize: 24, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },
    pantryScoreSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 17 },

    breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    breakdownLabel: { fontSize: 13, color: Colors.textSecondary, width: 108, fontWeight: '600' },
    breakdownBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.divider, overflow: 'hidden' },
    breakdownBarFill: { height: '100%', borderRadius: 4 },
    breakdownScore: { fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },

    swapCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    swapImage: { width: 38, height: 38, borderRadius: Radius.sm, backgroundColor: Colors.divider, resizeMode: 'contain' },
    swapName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    swapScore: { fontSize: 12.5, marginTop: 2 },
    swapBuyBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.full,
    },
    swapBuyText: { color: '#fff', fontSize: 12, fontWeight: '800' },

    itemCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    itemImage: { width: 44, height: 44, borderRadius: Radius.sm, resizeMode: 'contain' },
    itemName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    itemBrand: { fontSize: 11.5, color: Colors.textMuted, marginTop: 1 },
    itemScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    itemScoreBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.divider, overflow: 'hidden' },
    itemScoreBar: { height: '100%', borderRadius: 2 },
    itemScore: { fontSize: 11, fontWeight: '800', width: 24, textAlign: 'right' },

    fab: {
        position: 'absolute', right: 20,
        backgroundColor: Colors.primary, width: 56, height: 56, borderRadius: 28,
        alignItems: 'center', justifyContent: 'center', ...Shadow.lg,
    },
});
