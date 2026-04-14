import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, FlatList, Image, Animated, ScrollView, Pressable,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, Product } from '../types';
import {
    Camera, Search, ChevronRight, Lightbulb, Heart, Award,
    Apple, Sparkles, ShoppingBag, Salad, Coffee, Leaf, Star,
    Flame, Package
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow, Typography } from '../theme';
import { getHistory } from '../services/history';
import { calculateNutriScore } from '../services/ratingEngine';
import { getTopBySubCategory, GRADE_COLOR, LeaderboardEntry, LEADERBOARD_DATA } from '../data/leaderboardData';
import { getFavorites, toggleFavorite } from '../services/favorites';
import { searchProducts } from '../services/api';
import { saveToHistory } from '../services/history';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const BEAUTY_COLOR = '#E91E63';

const HEALTH_TIPS = [
    'High sugar (>15g/100g) is linked to weight gain. Watch out for Grade D & E products.',
    'Fibre slows sugar absorption and keeps you full longer. Look for >6g/100g.',
    'Ultra-processed foods (NOVA 4) have many additives. Prefer NOVA 1 & 2.',
    'Saturated fat raises LDL cholesterol. Keep below 5g/100g for heart health.',
    'Scan the barcode before you buy — labels can be misleading.',
    'A Nutri-Score of A or B still requires mindful portion control.',
];

const FOOD_PREVIEW_CATS = ['Snacks', 'Beverages', 'Dairy', 'Breakfast'];
const BEAUTY_PREVIEW_CATS = ['Skincare', 'Haircare', 'Body Care', 'Oral Care'];

const FOOD_CAT_ICONS: Record<string, any> = {
    Snacks: ShoppingBag,
    Beverages: Coffee,
    Dairy: Leaf,
    Breakfast: Salad,
};
const BEAUTY_CAT_ICONS: Record<string, any> = {
    Skincare: Sparkles,
    Haircare: Star,
    'Body Care': Leaf,
    'Oral Care': Star,
};

export default function HomeScanScreen({ navigation }: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [recentScans, setRecentScans] = useState<Product[]>([]);
    const [tipIndex] = useState(() => Math.floor(Math.random() * HEALTH_TIPS.length));
    const [topFood, setTopFood] = useState<LeaderboardEntry[]>([]);
    const [topBeauty, setTopBeauty] = useState<LeaderboardEntry[]>([]);
    const [favBarcodes, setFavBarcodes] = useState<Set<string>>(new Set());
    const [favAnims] = useState<Record<string, Animated.Value>>({});

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    const [userName, setUserName] = useState('');
    const [points, setPoints] = useState(0);
    const [streak, setStreak] = useState(0);
    const [apiResults, setApiResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadData();
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
    }, []);

    const loadData = async () => {
        const history = await getHistory();
        setRecentScans(history.slice(0, 3));
        setTopFood(getTopBySubCategory('food', 'All', 3));
        setTopBeauty(getTopBySubCategory('beauty', 'All', 3));

        const [profile, favs, pts, str] = await Promise.all([
            import('../services/userProfileService').then(m => m.getUserProfile()),
            getFavorites(),
            import('../services/pointsService').then(m => m.getTotalPoints()),
            import('../services/pointsService').then(m => m.getStreak()),
        ]);

        if (profile?.name) setUserName(profile.name);
        setFavBarcodes(new Set(favs.map(f => f.barcode)));
        setPoints(pts);
        setStreak(str.current);
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        return `${base}${userName ? ', ' + userName : ''}! 🌟`;
    };

    const handleToggleFav = useCallback(async (item: LeaderboardEntry) => {
        if (!favAnims[item.barcode]) {
            favAnims[item.barcode] = new Animated.Value(1);
        }
        const anim = favAnims[item.barcode];
        Animated.sequence([
            Animated.spring(anim, { toValue: 1.4, useNativeDriver: true, speed: 40 }),
            Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 40 }),
        ]).start();

        const nowFav = await toggleFavorite({
            barcode: item.barcode,
            name: item.name,
            brand: item.brand,
            image_url: item.image_url,
            grade: item.grade,
            score: item.score,
            category: item.category,
            subCategory: item.subCategory,
            savedAt: Date.now(),
        });
        setFavBarcodes(prev => {
            const next = new Set(prev);
            nowFav ? next.add(item.barcode) : next.delete(item.barcode);
            return next;
        });
    }, [favAnims]);

    const renderLeaderRow = (item: LeaderboardEntry, idx: number, color: string) => {
        const isFav = favBarcodes.has(item.barcode);
        if (!favAnims[item.barcode]) {
            favAnims[item.barcode] = new Animated.Value(1);
        }
        const anim = favAnims[item.barcode];
        const medals = ['🥇', '🥈', '🥉'];

        return (
            <View key={item.barcode} style={styles.leaderRow}>
                <Text style={styles.medalEmoji}>{medals[idx] || `${idx + 1}`}</Text>
                <Image source={{ uri: item.image_url }} style={styles.leaderImg} />
                <View style={styles.leaderInfo}>
                    <Text style={styles.leaderName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.leaderBrand}>{item.brand}</Text>
                    {/* mini score bar */}
                    <View style={styles.miniBarBg}>
                        <View style={[styles.miniBarFill, { width: `${item.score}%` as any, backgroundColor: color }]} />
                    </View>
                </View>
                <View style={[styles.gradeDot, { backgroundColor: GRADE_COLOR[item.grade] || Colors.gradeC }]}>
                    <Text style={styles.gradeDotText}>{item.grade}</Text>
                </View>
                <TouchableOpacity onPress={() => handleToggleFav(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Animated.View style={{ transform: [{ scale: anim }] }}>
                        <Heart size={18} color={isFav ? '#E91E63' : Colors.textMuted} fill={isFav ? '#E91E63' : 'transparent'} />
                    </Animated.View>
                </TouchableOpacity>
            </View>
        );
    };

    const renderCategorySection = (
        label: string,
        emoji: string,
        color: string,
        cats: string[],
        icons: Record<string, any>,
        catType: 'food' | 'beauty',
        topItems: LeaderboardEntry[]
    ) => (
        <View style={[styles.catSection, { borderTopColor: color }]}>
            {/* Category header */}
            <View style={styles.catHeader}>
                <View style={[styles.catIconCircle, { backgroundColor: color + '20' }]}>
                    <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.catLabel}>{label}</Text>
                    <Text style={styles.catSub}>{cats.length - 1} sub-categories</Text>
                </View>
                <TouchableOpacity
                    style={[styles.exploreBtn, { backgroundColor: color }]}
                    onPress={() => navigation.navigate('Leaderboard', { category: catType })}
                >
                    <Text style={styles.exploreBtnText}>Explore</Text>
                    <ChevronRight color="#fff" size={14} />
                </TouchableOpacity>
            </View>

            {/* Sub-category pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subPillsRow}>
                {cats.slice(1).map(sub => {
                    const Icon = icons[sub] || Star;
                    return (
                        <TouchableOpacity
                            key={sub}
                            style={[styles.subPill, { borderColor: color + '40' }]}
                            onPress={() => navigation.navigate('Leaderboard', { category: catType, subCategory: sub })}
                        >
                            <Icon color={color} size={13} />
                            <Text style={[styles.subPillText, { color }]}>{sub}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Top 3 mini leaderboard */}
            <View style={styles.miniLeaderboard}>
                <View style={styles.miniLeaderHeader}>
                    <Award color={color} size={14} />
                    <Text style={[styles.miniLeaderTitle, { color }]}>Top Rated</Text>
                </View>
                {topItems.map((item, idx) => renderLeaderRow(item, idx, color))}
                <TouchableOpacity
                    style={[styles.viewAllBtn, { borderColor: color }]}
                    onPress={() => navigation.navigate('Leaderboard', { category: catType })}
                >
                    <Text style={[styles.viewAllText, { color }]}>View Full {label} Leaderboard</Text>
                    <ChevronRight color={color} size={14} />
                </TouchableOpacity>
            </View>
        </View>
    );

    // Debounced API search when query changes
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
            try {
                const results = await searchProducts(query, 15);
                setApiResults(results);
            } catch {
                setApiResults([]);
            }
            setSearching(false);
        }, 500);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [searchQuery]);

    // Combine local leaderboard matches + API results (deduplicated)
    const filteredSearch = searchQuery.trim().length > 0
        ? (() => {
            const q = searchQuery.toLowerCase();
            const localMatches = LEADERBOARD_DATA.filter(item =>
                item.name.toLowerCase().indexOf(q) !== -1 ||
                item.brand.toLowerCase().indexOf(q) !== -1
            );
            const localBarcodes = new Set(localMatches.map(m => m.barcode));
            const apiExtra = apiResults.filter(p => !localBarcodes.has(p.barcode));
            return [...localMatches, ...apiExtra].slice(0, 25);
        })()
        : [];

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
                    <Text style={styles.heroTitle}>Know What You Use</Text>
                    <Text style={styles.heroTagline}>Scan any product for an instant health report.</Text>
                </Animated.View>

                {/* Stats Bar */}
                <View style={styles.statsBar}>
                    <TouchableOpacity style={styles.statItem} onPress={() => navigation.navigate('Challenges')}>
                        <Flame color="#FF6B35" size={16} fill={streak > 0 ? "#FF6B35" : "transparent"} />
                        <Text style={styles.statLabel}>{streak} Day Streak</Text>
                    </TouchableOpacity>
                    <View style={styles.statDivider} />
                    <TouchableOpacity style={styles.statItem} onPress={() => navigation.navigate('Challenges')}>
                        <Sparkles color="#FFD700" size={16} />
                        <Text style={styles.statLabel}>{points} Points</Text>
                    </TouchableOpacity>
                </View>

                {/* Scan CTA */}
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

            {/* Quick Shortcuts */}
            <View style={styles.shortcutsRow}>
                <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('Pantry')}>
                    <View style={[styles.shortcutIcon, { backgroundColor: '#E8F5E9' }]}><Package color={Colors.primary} size={22} /></View>
                    <Text style={styles.shortcutText}>My Pantry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('Chat')}>
                    <View style={[styles.shortcutIcon, { backgroundColor: '#E3F2FD' }]}><Star color={Colors.info} size={22} /></View>
                    <Text style={styles.shortcutText}>TIA Coach</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shortcutBtn} onPress={() => navigation.navigate('Challenges')}>
                    <View style={[styles.shortcutIcon, { backgroundColor: '#FFF3E0' }]}><Award color={Colors.warning} size={22} /></View>
                    <Text style={styles.shortcutText}>Challenges</Text>
                </TouchableOpacity>
            </View>

            {/* ── Search Bar ── */}
            <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                    <Search color={Colors.textMuted} size={18} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search products…"
                        placeholderTextColor={Colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={() => navigation.navigate('Scan')}
                        returnKeyType="search"
                    />
                </View>
            </View>

            {searchQuery.trim().length === 0 && (
                <>
                    {/* ── Daily Tip ── */}
                    <View style={styles.tipCard}>
                        <Lightbulb color={Colors.primary} size={16} />
                        <Text style={styles.tipText}>{HEALTH_TIPS[tipIndex]}</Text>
                    </View>

                    {/* ── Food Category Section ── */}
                    {renderCategorySection(
                        'Food & Beverages', '🍎', Colors.primary,
                        ['All', ...['Beverages', 'Snacks', 'Dairy', 'Breakfast', 'Condiments', 'Noodles']],
                        FOOD_CAT_ICONS, 'food', topFood
                    )}

                    {/* ── Beauty Category Section ── */}
                    {renderCategorySection(
                        'Beauty & Personal Care', '💄', BEAUTY_COLOR,
                        ['All', ...['Skincare', 'Haircare', 'Body Care', 'Oral Care']],
                        BEAUTY_CAT_ICONS, 'beauty', topBeauty
                    )}

                    {/* ── Recent Scans header ── */}
                    {recentScans.length > 0 ? (
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Your Recent Scans</Text>
                            <TouchableOpacity onPress={() => navigation.navigate('History')}>
                                <Text style={styles.seeAll}>View All</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.emptyHistoryCard}
                            onPress={() => navigation.navigate('Scan')}
                        >
                            <View style={styles.emptyCircle}><Camera color={Colors.primary} size={24} /></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.emptyTitle}>Start Your Health Journey</Text>
                                <Text style={styles.emptyDesc}>Scan your first product to see the magic here.</Text>
                            </View>
                            <ChevronRight color={Colors.textMuted} size={20} />
                        </TouchableOpacity>
                    )}
                </>
            )}

            {searchQuery.trim().length > 0 && (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>
                        {searching ? 'Searching...' : `Search Results (${filteredSearch.length})`}
                    </Text>
                </View>
            )}
        </>
    ), [fadeAnim, slideAnim, userName, points, streak, tipIndex, searchQuery, searching, recentScans, topFood, topBeauty, favBarcodes, getGreeting, navigation, renderCategorySection]);

    return (
        <FlatList
            style={styles.container}
            data={searchQuery.trim().length > 0 ? filteredSearch : recentScans}
            keyExtractor={item => item.barcode}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={renderHeader}
            renderItem={({ item }: { item: any }) => {
                const rating = item.grade ? { grade: item.grade, score: item.score, color: GRADE_COLOR[item.grade] } : calculateNutriScore(item.nutrition || {});
                return (
                    <TouchableOpacity
                        style={styles.recentItem}
                        onPress={async () => {
                            const product = item.nutrition ? item : { ...item, nutrition: {} };
                            if (item.nutrition) await saveToHistory(product);
                            navigation.navigate('Result', { product });
                        }}
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
                            <Text style={styles.recentBrand}>{item.brand || 'Unknown brand'}</Text>
                        </View>
                        <View style={[styles.gradeDot, { backgroundColor: rating.color }]}>
                            <Text style={styles.gradeDotText}>{rating.grade || '?'}</Text>
                        </View>
                    </TouchableOpacity >
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    // Hero
    hero: {
        backgroundColor: Colors.primary,
        paddingTop: 60,
        paddingBottom: 36,
        paddingHorizontal: Spacing.lg,
    },
    heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 4 },
    heroTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
    heroTagline: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, lineHeight: 18 },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
    brandText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    statsBar: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: Radius.md, marginTop: 16, padding: 10,
    },
    statItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    statLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
    statDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.3)' },
    scanHeroCTA: { marginTop: 16 },
    scanHeroBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#fff',
        borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: 28,
        ...Shadow.md,
    },
    scanHeroBtnText: { color: Colors.primary, fontSize: 17, fontWeight: '800' },

    // Quick Shortcuts
    shortcutsRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, gap: 10, marginTop: Spacing.md,
    },
    shortcutBtn: {
        flex: 1, backgroundColor: '#fff', borderRadius: Radius.lg,
        padding: 12, alignItems: 'center', gap: 8, ...Shadow.sm,
    },
    shortcutIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    shortcutText: { fontSize: 11, fontWeight: '800', color: Colors.textPrimary },

    // Search
    searchRow: {
        marginHorizontal: Spacing.md,
        marginTop: -22,
        marginBottom: Spacing.md,
    },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: Radius.full,
        paddingHorizontal: Spacing.md, height: 52,
        ...Shadow.md,
        gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },

    // Tip
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

    // Category sections
    catSection: {
        backgroundColor: '#fff',
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderRadius: Radius.xl,
        overflow: 'hidden',
        borderTopWidth: 3,
        ...Shadow.md,
    },
    catHeader: {
        flexDirection: 'row', alignItems: 'center',
        padding: Spacing.md, gap: 12,
    },
    catIconCircle: {
        width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
    },
    catLabel: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary },
    catSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    exploreBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: Radius.full,
    },
    exploreBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

    // Sub-category pills inside section
    subPillsRow: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        gap: 8,
    },
    subPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: Radius.full, borderWidth: 1,
        backgroundColor: Colors.background,
    },
    subPillText: { fontSize: 12, fontWeight: '700' },

    // Mini leaderboard inside section
    miniLeaderboard: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        borderTopWidth: 1, borderTopColor: Colors.divider,
        paddingTop: Spacing.md,
    },
    miniLeaderHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    },
    miniLeaderTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
    leaderRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: Colors.divider,
        gap: 10,
    },
    medalEmoji: { fontSize: 18, width: 28, textAlign: 'center' },
    leaderImg: {
        width: 44, height: 44, borderRadius: 8,
        backgroundColor: '#f5f5f5', resizeMode: 'contain',
    },
    leaderInfo: { flex: 1 },
    leaderName: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
    leaderBrand: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    miniBarBg: { height: 3, backgroundColor: Colors.divider, borderRadius: 2, marginTop: 5 },
    miniBarFill: { height: '100%', borderRadius: 2 },
    gradeDot: {
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
    },
    gradeDotText: { color: '#fff', fontWeight: '900', fontSize: 12 },

    viewAllBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginTop: 14, paddingVertical: 10, borderRadius: Radius.full,
        borderWidth: 1.5, gap: 6,
    },
    viewAllText: { fontSize: 13, fontWeight: '800' },

    // Section headers
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.sm, marginBottom: Spacing.sm,
    },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
    seeAll: { fontSize: 14, color: Colors.primary, fontWeight: '700' },

    // Recent scans
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

    // Empty state
    emptyHistoryCard: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: '#fff', marginHorizontal: Spacing.md,
        padding: Spacing.md, borderRadius: Radius.lg, ...Shadow.sm,
        marginTop: Spacing.sm,
    },
    emptyCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    emptyDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
