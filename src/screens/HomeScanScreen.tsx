import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, FlatList, Image, Animated, ActivityIndicator,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, Product } from '../types';
import {
    Camera, Search, ChevronRight, Lightbulb, Salad, Package, Clock,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { getHistory, saveToHistory } from '../services/history';
import { calculateNutriScore } from '../services/ratingEngine';
import { searchProducts } from '../services/api';

type Props = BottomTabScreenProps<RootStackParamList, 'Home'>;

const HEALTH_TIPS = [
    'High sugar (>15g/100g) is linked to weight gain. Watch out for Grade D & E products.',
    'Fibre slows sugar absorption and keeps you full longer. Look for >6g/100g.',
    'Ultra-processed foods (NOVA 4) carry many additives. Prefer NOVA 1 & 2.',
    'Saturated fat raises LDL cholesterol. Keep below 5g/100g for heart health.',
    'Scan the barcode before you buy — front-of-pack claims can be misleading.',
    'A Nutri-Score of A or B still rewards mindful portion control.',
];

export default function HomeScanScreen({ navigation }: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [recentScans, setRecentScans] = useState<Product[]>([]);
    const [tipIndex] = useState(() => Math.floor(Math.random() * HEALTH_TIPS.length));
    const [userName, setUserName] = useState('');
    const [apiResults, setApiResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFocused = useIsFocused();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
    }, []);

    const loadData = useCallback(async () => {
        const [history, profile] = await Promise.all([
            getHistory(),
            import('../services/userProfileService').then(m => m.getUserProfile()),
        ]);
        setRecentScans(history.slice(0, 3));
        if (profile?.name) setUserName(profile.name);
    }, []);

    useEffect(() => { if (isFocused) loadData(); }, [isFocused, loadData]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        return `${base}${userName ? ', ' + userName : ''}!`;
    };

    // Debounced Open Food Facts search
    useEffect(() => {
        const query = searchQuery.trim();
        if (query.length < 2) {
            setApiResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(async () => {
            const results = await searchProducts(query, 20);
            setApiResults(results);
            setSearching(false);
        }, 450);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    const openProduct = useCallback(async (product: Product) => {
        await saveToHistory(product);
        navigation.navigate('Result', { product });
    }, [navigation]);

    const renderHeader = useCallback(() => (
        <>
            {/* ── Hero ── */}
            <View style={styles.hero}>
                <View style={styles.brandRow}>
                    <Salad color="#fff" size={20} />
                    <Text style={styles.brandText}>Padho Label</Text>
                </View>
                <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
                    <Text style={styles.heroGreeting}>{getGreeting()}</Text>
                    <Text style={styles.heroTitle}>Know What You Eat</Text>
                    <Text style={styles.heroTagline}>Scan any product for an instant, personalised health report.</Text>
                </Animated.View>

                <Animated.View style={[styles.scanHeroCTA, { opacity: fadeAnim }]}>
                    <TouchableOpacity
                        style={styles.scanHeroBtn}
                        onPress={() => navigation.navigate('Scan')}
                        activeOpacity={0.85}
                    >
                        <Camera color="#fff" size={26} />
                        <Text style={styles.scanHeroBtnText}>Scan a Product</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            {/* Quick shortcuts */}
            <View style={styles.shortcutsRow}>
                <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('Pantry')}>
                    <View style={[styles.shortcutIcon, { backgroundColor: '#E8F5E9' }]}><Package color={Colors.accent} size={22} /></View>
                    <Text style={styles.shortcutText}>My Pantry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('History')}>
                    <View style={[styles.shortcutIcon, { backgroundColor: Colors.primaryLight }]}><Clock color={Colors.primary} size={22} /></View>
                    <Text style={styles.shortcutText}>Scan History</Text>
                </TouchableOpacity>
            </View>

            {/* ── Search Bar ── */}
            <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                    <Search color={Colors.textMuted} size={18} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search products by name…"
                        placeholderTextColor={Colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        autoCorrect={false}
                    />
                    {searching && <ActivityIndicator size="small" color={Colors.primary} />}
                </View>
            </View>

            {!isSearching && (
                <>
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
                            <View style={styles.emptyCircle}><Camera color={Colors.primary} size={24} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.emptyTitle}>Start your health journey</Text>
                                <Text style={styles.emptyDesc}>Scan your first product to see it here.</Text>
                            </View>
                            <ChevronRight color={Colors.textMuted} size={20} />
                        </TouchableOpacity>
                    )}
                </>
            )}

            {isSearching && (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        {searching ? 'Searching…' : `Results (${apiResults.length})`}
                    </Text>
                </View>
            )}
        </>
    ), [fadeAnim, slideAnim, userName, tipIndex, searchQuery, searching, recentScans, isSearching, apiResults.length, navigation]);

    const data = isSearching ? apiResults : recentScans;

    return (
        <FlatList
            style={styles.container}
            data={data}
            keyExtractor={(item, idx) => item.barcode || `idx-${idx}`}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={
                isSearching && !searching ? (
                    <Text style={styles.noResults}>No products found. Try scanning the barcode instead.</Text>
                ) : null
            }
            renderItem={({ item }) => {
                const rating = calculateNutriScore(item.nutrition || {});
                return (
                    <TouchableOpacity
                        style={styles.recentItem}
                        onPress={() => openProduct(item)}
                        activeOpacity={0.8}
                    >
                        {item.image_url ? (
                            <Image source={{ uri: item.image_url }} style={styles.recentImg} />
                        ) : (
                            <View style={[styles.recentImg, styles.recentImgPlaceholder]}>
                                <Camera color={Colors.textMuted} size={18} />
                            </View>
                        )}
                        <View style={styles.recentInfo}>
                            <Text style={styles.recentName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.recentBrand} numberOfLines={1}>{item.brand || 'Unknown brand'}</Text>
                        </View>
                        <View style={[styles.gradeDot, { backgroundColor: rating.hasData ? rating.color : Colors.textMuted }]}>
                            <Text style={styles.gradeDotText}>{rating.grade || '?'}</Text>
                        </View>
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
        paddingTop: 60,
        paddingBottom: 36,
        paddingHorizontal: Spacing.lg,
    },
    heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginBottom: 4 },
    heroTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
    heroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 18 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    brandText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    scanHeroCTA: { marginTop: 20 },
    scanHeroBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#fff',
        borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: 28,
        ...Shadow.md,
    },
    scanHeroBtnText: { color: Colors.primary, fontSize: 17, fontWeight: '800' },

    shortcutsRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, gap: 10, marginTop: Spacing.md,
    },
    shortcutBtn: {
        flex: 1, flexDirection: 'row', backgroundColor: '#fff', borderRadius: Radius.lg,
        padding: 14, alignItems: 'center', gap: 10, ...Shadow.sm,
    },
    shortcutIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    shortcutText: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },

    searchRow: { marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: Radius.full,
        paddingHorizontal: Spacing.md, height: 52,
        ...Shadow.sm,
        gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },

    tipCard: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        backgroundColor: '#fff',
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        borderLeftWidth: 3, borderLeftColor: Colors.primary,
        ...Shadow.sm,
    },
    tipText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.sm, marginBottom: Spacing.sm,
    },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    seeAll: { fontSize: 14, color: Colors.primary, fontWeight: '700' },

    recentItem: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', marginHorizontal: Spacing.md,
        borderRadius: Radius.md, padding: Spacing.md,
        marginBottom: Spacing.sm, gap: 12,
        ...Shadow.sm,
    },
    recentImg: {
        width: 48, height: 48, borderRadius: Radius.sm,
        backgroundColor: '#f9f9f9', resizeMode: 'contain',
    },
    recentImgPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0' },
    recentInfo: { flex: 1 },
    recentName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    recentBrand: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    gradeDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    gradeDotText: { color: '#fff', fontWeight: '900', fontSize: 13 },

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
