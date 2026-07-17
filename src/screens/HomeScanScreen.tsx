/**
 * HomeScanScreen — v5.
 *
 * Search is LOCAL-FIRST: the bundled Indian catalog + everything this device has
 * learned answers instantly (offline), and Open Food Facts results merge in
 * behind it. The hero stays focused on the one action that matters: scan.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, FlatList, Image, ActivityIndicator,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Product, HealthConstraints } from '../types';
import {
    ScanBarcode, Search, ChevronRight, Lightbulb, Salad, Package, Clock, X,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { getHistory, saveToHistory } from '../services/history';
import { calculateNutriScore, calculatePersonalizedScore } from '../services/ratingEngine';
import { getHealthConstraints, getUserProfile } from '../services/userProfileService';
import { searchProducts } from '../services/api';
import { initIntelligence, searchCatalog } from '../services/intelligence';
import { GradeBadge } from '../components';

type Props = BottomTabScreenProps<RootStackParamList, 'Home'>;

const HEALTH_TIPS = [
    'High sugar (>15g/100g) is linked to weight gain. Watch out for Grade D & E products.',
    'Fibre slows sugar absorption and keeps you full longer. Look for >6g/100g.',
    'Ultra-processed foods (NOVA 4) carry many additives. Prefer NOVA 1 & 2.',
    'Saturated fat raises LDL cholesterol. Keep below 5g/100g for heart health.',
    'Scan the barcode before you buy — front-of-pack claims can be misleading.',
    '1 teaspoon of sugar ≈ 4g. A single cola can pack 8+ teaspoons.',
    'Sodium hides in namkeen and instant noodles — check the per-100g number.',
];

type SearchRow = { product: Product; source: 'local' | 'off' };

export default function HomeScanScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
    const [searchQuery, setSearchQuery] = useState('');
    const [recentScans, setRecentScans] = useState<Product[]>([]);
    const [tipIndex] = useState(() => Math.floor(Math.random() * HEALTH_TIPS.length));
    const [userName, setUserName] = useState('');
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [localResults, setLocalResults] = useState<SearchRow[]>([]);
    const [offResults, setOffResults] = useState<SearchRow[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFocused = useIsFocused();

    const loadData = useCallback(async () => {
        const [history, profile, cons] = await Promise.all([
            getHistory(),
            getUserProfile(),
            getHealthConstraints().catch(() => null),
        ]);
        setRecentScans(history.slice(0, 5));
        setConstraints(cons);
        if (profile?.name && profile.name !== 'Friend') setUserName(profile.name);
    }, []);

    useEffect(() => { if (isFocused) loadData(); }, [isFocused, loadData]);
    useEffect(() => { initIntelligence(); }, []);

    const getGreeting = () => {
        const hour = new Date().getHours();
        const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        return `${base}${userName ? ', ' + userName : ''}`;
    };

    // Instant local search + debounced Open Food Facts merge
    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setLocalResults([]);
            setOffResults([]);
            setSearching(false);
            return;
        }
        // Local: synchronous, instant, offline.
        const local = searchCatalog(query, 10).map(r => ({ product: r as Product, source: 'local' as const }));
        setLocalResults(local);

        setSearching(true);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            const results = await searchProducts(query, 15);
            // Drop OFF rows that duplicate a local hit (same name+brand-ish).
            const localKeys = new Set(local.map(l => `${(l.product.brand || '').toLowerCase()}|${l.product.name.toLowerCase()}`));
            setOffResults(
                results
                    .filter(p => !localKeys.has(`${(p.brand || '').toLowerCase()}|${p.name.toLowerCase()}`))
                    .map(p => ({ product: p, source: 'off' as const })),
            );
            setSearching(false);
        }, 450);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [searchQuery]);

    const isSearching = searchQuery.trim().length >= 2;
    const searchRows = [...localResults, ...offResults];

    const openProduct = useCallback(async (product: Product) => {
        await saveToHistory(product);
        navigation.navigate('Result', { product });
    }, [navigation]);

    const gradeFor = useCallback((p: Product): { grade: string | null } => {
        const base = calculateNutriScore(p.nutrition || {});
        if (!base.hasData) return { grade: null };
        if (constraints) return { grade: calculatePersonalizedScore(p, constraints).grade };
        return { grade: base.grade };
    }, [constraints]);

    const renderHeader = useCallback(() => (
        <>
            {/* ── Hero ── */}
            <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
                <View style={styles.brandRow}>
                    <Salad color="#fff" size={20} />
                    <Text style={styles.brandText}>Padho Label</Text>
                </View>
                <Text style={styles.heroGreeting}>{getGreeting()}</Text>
                <Text style={styles.heroTitle}>Know what you eat</Text>
                <Text style={styles.heroTagline}>Scan any packaged food for an instant, personalised health verdict.</Text>

                <TouchableOpacity
                    style={styles.scanHeroBtn}
                    onPress={() => navigation.navigate('Scan')}
                    activeOpacity={0.85}
                >
                    <ScanBarcode color={Colors.primary} size={24} />
                    <Text style={styles.scanHeroBtnText}>Scan a Product</Text>
                </TouchableOpacity>
            </View>

            {/* ── Search Bar ── */}
            <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                    <Search color={Colors.textMuted} size={18} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search Maggi, Parle-G, Bournvita…"
                        placeholderTextColor={Colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        autoCorrect={false}
                    />
                    {searching ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                    ) : searchQuery.length > 0 ? (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X color={Colors.textMuted} size={18} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {!isSearching && (
                <>
                    {/* Quick shortcuts */}
                    <View style={styles.shortcutsRow}>
                        <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('Pantry')}>
                            <View style={[styles.shortcutIcon, { backgroundColor: Colors.accentLight }]}><Package color={Colors.accent} size={20} /></View>
                            <Text style={styles.shortcutText}>My Pantry</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('History')}>
                            <View style={[styles.shortcutIcon, { backgroundColor: Colors.primaryLight }]}><Clock color={Colors.primary} size={20} /></View>
                            <Text style={styles.shortcutText}>Scan History</Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Daily Tip ── */}
                    <View style={styles.tipCard}>
                        <Lightbulb color={Colors.primary} size={16} />
                        <Text style={styles.tipText}>{HEALTH_TIPS[tipIndex]}</Text>
                    </View>

                    {recentScans.length > 0 ? (
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Recent Scans</Text>
                            <TouchableOpacity onPress={() => navigation.navigate('History')}>
                                <Text style={styles.seeAll}>View All</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.emptyHistoryCard} onPress={() => navigation.navigate('Scan')}>
                            <View style={styles.emptyCircle}><ScanBarcode color={Colors.primary} size={24} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.emptyTitle}>Scan your first product</Text>
                                <Text style={styles.emptyDesc}>Point the camera at any barcode to get the truth.</Text>
                            </View>
                            <ChevronRight color={Colors.textMuted} size={20} />
                        </TouchableOpacity>
                    )}
                </>
            )}

            {isSearching && (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        {searchRows.length > 0
                            ? `Results (${searchRows.length})`
                            : searching ? 'Searching…' : 'No results'}
                    </Text>
                    {localResults.length > 0 && <Text style={styles.localBadge}>⚡ instant</Text>}
                </View>
            )}
        </>
    ), [insets.top, userName, tipIndex, searchQuery, searching, recentScans, isSearching, localResults.length, searchRows.length, navigation]);

    const data: SearchRow[] = isSearching
        ? searchRows
        : recentScans.map(p => ({ product: p, source: 'local' as const }));

    return (
        <FlatList
            style={styles.container}
            data={data}
            keyExtractor={(item, idx) => `${item.product.barcode || item.product.name}-${idx}`}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={
                isSearching && !searching ? (
                    <Text style={styles.noResults}>
                        Nothing found for “{searchQuery.trim()}”. Try the barcode scanner instead — it also reads labels.
                    </Text>
                ) : null
            }
            renderItem={({ item }) => {
                const { grade } = gradeFor(item.product);
                return (
                    <TouchableOpacity
                        style={styles.recentItem}
                        onPress={() => openProduct(item.product)}
                        activeOpacity={0.8}
                    >
                        {item.product.image_url ? (
                            <Image source={{ uri: item.product.image_url }} style={styles.recentImg} />
                        ) : (
                            <View style={[styles.recentImg, styles.recentImgPlaceholder]}>
                                <ScanBarcode color={Colors.textMuted} size={18} />
                            </View>
                        )}
                        <View style={styles.recentInfo}>
                            <Text style={styles.recentName} numberOfLines={1}>{item.product.name}</Text>
                            <Text style={styles.recentBrand} numberOfLines={1}>
                                {item.product.brand || 'Unknown brand'}
                                {isSearching && item.source === 'local' ? '  ·  in catalog ⚡' : ''}
                            </Text>
                        </View>
                        <GradeBadge grade={grade} size={32} />
                    </TouchableOpacity>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    hero: {
        backgroundColor: Colors.primary,
        paddingBottom: 28,
        paddingHorizontal: Spacing.lg,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
    brandText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
    heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600', marginBottom: 2 },
    heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.6 },
    heroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 6, lineHeight: 19 },
    scanHeroBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#fff',
        borderRadius: Radius.full, paddingVertical: 15, marginTop: 20,
        ...Shadow.md,
    },
    scanHeroBtnText: { color: Colors.primary, fontSize: 16.5, fontWeight: '900' },

    searchRow: { marginHorizontal: Spacing.md, marginTop: -26 },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: Radius.full,
        paddingHorizontal: Spacing.md, height: 52,
        ...Shadow.md,
        gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },

    shortcutsRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, gap: 10, marginTop: Spacing.md,
    },
    shortcutBtn: {
        flex: 1, flexDirection: 'row', backgroundColor: '#fff', borderRadius: Radius.lg,
        padding: 13, alignItems: 'center', gap: 10, ...Shadow.sm,
    },
    shortcutIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    shortcutText: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

    tipCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        backgroundColor: '#fff',
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        borderLeftWidth: 3, borderLeftColor: Colors.primary,
        ...Shadow.sm,
    },
    tipText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.md,
        marginTop: Spacing.md, marginBottom: Spacing.sm,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 },
    seeAll: { fontSize: 13, color: Colors.primary, fontWeight: '800' },
    localBadge: { fontSize: 12, color: Colors.accent, fontWeight: '800' },

    recentItem: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', marginHorizontal: Spacing.md,
        borderRadius: Radius.lg, padding: 12,
        marginBottom: Spacing.sm, gap: 12,
        ...Shadow.sm,
    },
    recentImg: {
        width: 46, height: 46, borderRadius: Radius.sm,
        backgroundColor: Colors.divider, resizeMode: 'contain',
    },
    recentImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
    recentBrand: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    emptyHistoryCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#fff', marginHorizontal: Spacing.md,
        padding: Spacing.md, borderRadius: Radius.lg, ...Shadow.sm,
        marginTop: Spacing.sm,
    },
    emptyCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    emptyDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    noResults: { textAlign: 'center', color: Colors.textMuted, fontSize: 14, marginTop: 24, paddingHorizontal: Spacing.lg, lineHeight: 20 },
});
