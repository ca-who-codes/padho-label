/**
 * CompareScreen — the "decide" surface, v5.
 *
 * Ranks the comparable options (same sub-category) from the local intelligence —
 * scored for the active profile — and leads with the axis that matters for this
 * user (sugar for a diabetic, sodium for hypertension, …). Pure, deterministic
 * ranking; no network, no LLM.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Trophy, ShoppingCart, ScanBarcode } from 'lucide-react-native';
import { RootStackParamList, HealthConstraints, Product } from '../types';
import { getHealthConstraints } from '../services/userProfileService';
import {
    initIntelligence, categoryProducts, rankProducts, lineKey, decisiveAxisFor,
    type RankedProduct,
} from '../services/intelligence';
import { openOnSwiggy } from '../services/swiggy';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { EmptyState } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Compare'>;

const AXIS_LABEL: Record<string, string> = {
    sugar: 'lowest sugar', sodium: 'lowest sodium', energy: 'fewest calories',
    protein: 'most protein', satfat: 'least saturated fat', overall: 'best overall',
};

export default function CompareScreen({ route, navigation }: Props) {
    const { product } = route.params;
    const insets = useSafeAreaInsets();
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
                onPress={() => navigation.push('Result', { product: item.product as Product })}
            >
                <View style={styles.rankCol}>
                    {isWinner
                        ? <Trophy color={Colors.primary} size={18} />
                        : <Text style={styles.rankNum}>{i + 1}</Text>}
                </View>
                <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardName} numberOfLines={1}>{item.product.name}</Text>
                        {isWinner && <View style={styles.bestPill}><Text style={styles.bestPillText}>BEST</Text></View>}
                        {isAnchor && <View style={styles.youPill}><Text style={styles.youPillText}>SCANNED</Text></View>}
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
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
                    <EmptyState
                        emoji="⚖️"
                        title="Nothing to compare yet"
                        body={`No other ${groupKey} in your catalog so far. Scan a few more and they'll rank here automatically.`}
                        ctaLabel="Scan another product"
                        onCta={() => navigation.navigate('Scan')}
                    />
                </View>
            ) : (
                <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
                    <Text style={styles.count}>{ranked.length} options · best first</Text>
                    {ranked.map(renderCard)}
                    {ranked[0] && (
                        <TouchableOpacity
                            style={styles.swiggyBtn}
                            onPress={() => openOnSwiggy(`${ranked[0].product.brand || ''} ${ranked[0].product.name}`)}
                        >
                            <ShoppingCart color="#fff" size={16} />
                            <Text style={styles.swiggyBtnText}>Order the top pick on Swiggy</Text>
                        </TouchableOpacity>
                    )}
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
        paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm,
        backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textTransform: 'capitalize', letterSpacing: -0.3 },
    subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    list: { padding: Spacing.md, gap: 10 },
    count: { fontSize: 12, color: Colors.textMuted, marginBottom: 2, fontWeight: '600' },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.card, borderRadius: Radius.lg, padding: 13,
        borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    },
    winnerCard: { borderColor: Colors.primary, borderWidth: 2 },
    anchorCard: { backgroundColor: Colors.primaryLight + '60' },
    rankCol: { width: 22, alignItems: 'center' },
    rankNum: { fontSize: 14, fontWeight: '800', color: Colors.textMuted },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
    cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
    cardReason: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, fontWeight: '600' },
    cardRight: { alignItems: 'flex-end', gap: 6 },
    scorePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    scorePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    bestPill: { backgroundColor: Colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    bestPillText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    youPill: { backgroundColor: Colors.pillBackground, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    youPillText: { color: Colors.textSecondary, fontSize: 9, fontWeight: '900' },
    footnote: { fontSize: 11, color: Colors.textMuted, marginTop: 8, lineHeight: 16 },
    swiggyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.full, marginTop: 14, ...Shadow.sm },
    swiggyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
