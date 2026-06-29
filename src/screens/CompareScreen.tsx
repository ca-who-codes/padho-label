/**
 * CompareScreen — the "decide" surface.
 *
 * Given a product, ranks the comparable options (same sub-category) from the local
 * intelligence — scored for the active profile — and leads with the axis that
 * matters for this user (sugar for a diabetic, sodium for hypertension, …). Pure,
 * deterministic ranking; no network, no LLM.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronRight, Trophy } from 'lucide-react-native';
import { RootStackParamList, HealthConstraints } from '../types';
import { getHealthConstraints } from '../services/userProfileService';
import {
    initIntelligence, categoryProducts, rankProducts, lineKey, decisiveAxisFor,
    type RankedProduct,
} from '../services/intelligence';
import { Colors, Spacing, Radius } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Compare'>;

const AXIS_LABEL: Record<string, string> = {
    sugar: 'lowest sugar', sodium: 'lowest sodium', energy: 'fewest calories',
    protein: 'most protein', satfat: 'least saturated fat', overall: 'best overall',
};

export default function CompareScreen({ route, navigation }: Props) {
    const { product } = route.params;
    const [ranked, setRanked] = useState<RankedProduct[]>([]);
    const [axisLabel, setAxisLabel] = useState('best overall');
    const [loading, setLoading] = useState(true);

    const anchorLine = lineKey(product.brand, product.name);
    const groupKey = product.subCategory || product.category || 'food';

    useEffect(() => {
        let alive = true;
        (async () => {
            let constraints: HealthConstraints | null = null;
            try {
                constraints = await getHealthConstraints();
            } catch {
                constraints = null;
            }
            await initIntelligence();
            const pool = categoryProducts(groupKey);
            const hasAnchor = pool.some(p => lineKey(p.brand, p.name) === anchorLine);
            const candidates = hasAnchor ? pool : [product, ...pool];
            const list = rankProducts(candidates, constraints);
            if (!alive) return;
            setRanked(list);
            setAxisLabel(AXIS_LABEL[decisiveAxisFor(constraints)] || 'best overall');
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [groupKey, anchorLine]);

    const renderCard = (item: RankedProduct, i: number) => {
        const isAnchor = lineKey(item.product.brand, item.product.name) === anchorLine;
        const isWinner = i === 0;
        return (
            <TouchableOpacity
                key={`${item.product.name}-${i}`}
                style={[styles.card, isWinner && styles.winnerCard, isAnchor && styles.anchorCard]}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Result', { product: item.product })}
            >
                <View style={styles.rankCol}>
                    {isWinner
                        ? <Trophy color={Colors.primary} size={18} />
                        : <Text style={styles.rankNum}>{i + 1}</Text>}
                </View>
                <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardName} numberOfLines={1}>{item.product.name}</Text>
                        {isWinner && <View style={styles.bestPill}><Text style={styles.bestPillText}>best</Text></View>}
                        {isAnchor && <View style={styles.youPill}><Text style={styles.youPillText}>scanned</Text></View>}
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                        {[item.product.brand, item.product.quantity].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.cardReason}>{item.reason}</Text>
                </View>
                <View style={styles.cardRight}>
                    <View style={[styles.scorePill, { backgroundColor: item.color }]}>
                        <Text style={styles.scorePillText}>{item.grade} · {item.score}</Text>
                    </View>
                    <ChevronRight color={Colors.textMuted} size={16} />
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft color={Colors.textPrimary} size={22} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>Compare {groupKey}</Text>
                    <Text style={styles.subtitle}>ranked for you · {axisLabel}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
            ) : ranked.length <= 1 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>
                        No comparable products in your catalog yet. Scan a few more {groupKey} and they’ll appear here automatically.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.list}>
                    <Text style={styles.count}>{ranked.length} options compared</Text>
                    {ranked.map(renderCard)}
                    <Text style={styles.footnote}>
                        Scores are personalised to your profile. Availability and price are confirmed on Swiggy at checkout.
                    </Text>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: Spacing.md, paddingTop: 56, paddingBottom: Spacing.sm,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textTransform: 'capitalize' },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 21 },
    list: { padding: Spacing.md, gap: 10 },
    count: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#fff', borderRadius: Radius.md, padding: 12,
        borderWidth: 1, borderColor: Colors.border,
    },
    winnerCard: { borderColor: Colors.primary, borderWidth: 2 },
    anchorCard: { backgroundColor: '#fafdfb' },
    rankCol: { width: 22, alignItems: 'center' },
    rankNum: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
    cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
    cardReason: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
    cardRight: { alignItems: 'flex-end', gap: 6 },
    scorePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    scorePillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    bestPill: { backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
    bestPillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    youPill: { backgroundColor: Colors.border, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
    youPillText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '700' },
    footnote: { fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
});
