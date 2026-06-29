import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
    Share, Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, HealthConstraints } from '../types';
import {
    calculateNutriScore, calculatePersonalizedScore, generateForYouBullets,
    getVerdictText, nutriScoreToPercent,
} from '../services/ratingEngine';
import { findAdditives, getConcernColor, getAdditiveSummary } from '../services/additivesService';
import { findChemicals, calculateSafetyScore } from '../services/beautyService';
import { isFavorite as checkFav, toggleFavorite } from '../services/favorites';
import { addToPantry, isInPantry } from '../services/pantryService';
import { getHealthConstraints } from '../services/userProfileService';
import {
    ArrowLeft, Heart, Share2, Plus,
    CheckCircle, AlertTriangle, XCircle, ChevronRight,
    FlaskConical, ShieldCheck,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;
const TABS = ['Overview', 'Nutrition', 'Ingredients', 'For You'] as const;
type TabId = typeof TABS[number];

const NUTRIENT_LABELS: Record<string, string> = {
    energy: 'Energy', fat: 'Total Fat', saturated_fat: 'Saturated Fat',
    trans_fat: 'Trans Fat', carbohydrates: 'Carbohydrates', sugars: 'Total Sugars',
    added_sugars: 'Added Sugars', proteins: 'Protein', fiber: 'Dietary Fiber', sodium: 'Sodium',
};

export default function ResultScreen({ route, navigation }: Props) {
    const { product } = route.params;
    const [activeTab, setActiveTab] = useState<TabId>('Overview');
    const [isFavState, setIsFavState] = useState(false);
    const [inPantryState, setInPantryState] = useState(false);
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [selectedAdditive, setSelectedAdditive] = useState<any>(null);

    const isBeauty = product.category === 'beauty';
    const primaryColor = isBeauty ? '#E91E63' : Colors.primary;

    const baseRating = useMemo(() => (isBeauty ? null : calculateNutriScore(product.nutrition)), [product, isBeauty]);
    const personalizedRating = useMemo(() => {
        if (isBeauty || !constraints || !baseRating?.hasData) return null;
        return calculatePersonalizedScore(product, constraints);
    }, [product, constraints, isBeauty, baseRating]);
    const forYouBullets = useMemo(() => {
        if (isBeauty || !constraints) return [];
        return generateForYouBullets(product, constraints);
    }, [product, constraints, isBeauty]);

    const displayRating = personalizedRating || baseRating;
    const ingredients = product.ingredients || '';
    const additives = useMemo(() => (isBeauty ? [] : findAdditives(ingredients)), [ingredients, isBeauty]);
    const chemicals = useMemo(() => (isBeauty ? findChemicals(ingredients) : []), [ingredients, isBeauty]);
    const additiveSummary = useMemo(() => getAdditiveSummary(additives), [additives]);

    const score0100 = personalizedRating
        ? personalizedRating.score
        : (baseRating?.hasData ? nutriScoreToPercent(baseRating.score) : null);
    const verdictText = score0100 !== null ? getVerdictText(score0100) : 'No nutrition data';

    useEffect(() => {
        checkFav(product.barcode).then(setIsFavState);
        isInPantry(product.barcode).then(setInPantryState);
        getHealthConstraints().then(setConstraints);
    }, [product.barcode]);

    const handleToggleFav = useCallback(async () => {
        const nowFav = await toggleFavorite({
            barcode: product.barcode, name: product.name, brand: product.brand,
            image_url: product.image_url, grade: displayRating?.grade || '?',
            score: score0100 ?? 50, category: product.category || 'food',
            subCategory: 'General', savedAt: Date.now(),
        });
        setIsFavState(nowFav);
    }, [product, displayRating, score0100]);

    const handleAddToPantry = useCallback(async () => {
        await addToPantry(product, score0100 ?? 50);
        setInPantryState(true);
        setToast('Added to pantry 🧺');
        setTimeout(() => setToast(null), 2000);
    }, [product, score0100]);

    const handleShare = useCallback(async () => {
        const grade = displayRating?.grade || '?';
        const bullets = forYouBullets.slice(0, 2).map(b => `${b.emoji} ${b.text}`).join('\n');
        const msg = `I scanned ${product.name} on Padho Label 🥗\n\nHealth Grade: ${grade} (${verdictText})${bullets ? `\n\n${bullets}` : ''}`;
        try { await Share.share({ message: msg }); } catch { /* user cancelled */ }
    }, [product, displayRating, forYouBullets, verdictText]);

    // ─── Tab: Overview ───────────────────────────────────────────────────────
    const renderOverview = () => {
        const flags: { label: string; color: string; icon: any }[] = [];
        const n = product.nutrition;
        const satFat = n.saturated_fat_100g || 0;
        const sugar = n.added_sugars_100g ?? n.sugars_100g ?? 0;
        const fiber = n.fiber_100g || 0;
        const transFat = n.trans_fat_100g || 0;
        if (satFat > 8) flags.push({ label: 'High Sat Fat', color: Colors.danger, icon: AlertTriangle });
        if (sugar > 15) flags.push({ label: 'High Sugar', color: Colors.warning, icon: AlertTriangle });
        if (transFat > 0) flags.push({ label: 'Trans Fat!', color: Colors.danger, icon: XCircle });
        if (fiber > 5) flags.push({ label: 'Good Fiber', color: Colors.success, icon: CheckCircle });
        if (transFat === 0 && baseRating?.hasData) flags.push({ label: 'No Trans Fat', color: Colors.success, icon: CheckCircle });
        if (satFat === 0 && sugar < 5 && baseRating?.hasData) flags.push({ label: 'Clean Label', color: Colors.accent, icon: ShieldCheck });
        if (additives.some(a => a.level === 'high')) flags.push({ label: 'High-Risk Additives', color: Colors.danger, icon: FlaskConical });

        return (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.md, gap: 14, paddingBottom: 120 }}>
                {/* Score card */}
                <View style={styles.scoreCard}>
                    <View style={[styles.scoreCircle, { borderColor: displayRating?.color || Colors.border }]}>
                        <View style={[styles.scoreInner, { backgroundColor: displayRating?.color || Colors.border }]}>
                            <Text style={styles.scoreGrade}>{displayRating?.grade || '?'}</Text>
                        </View>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.verdictText, { color: displayRating?.color || Colors.textMuted }]}>{verdictText}</Text>
                        {score0100 !== null && (
                            <Text style={styles.scoreSubtext}>
                                Padho Score: {score0100}/100{personalizedRating ? ' · Personalised for you 🎯' : ''}
                            </Text>
                        )}
                        {product.nova_group && <Text style={styles.novaText}>NOVA {product.nova_group} · {['Natural', 'Culinary', 'Processed', 'Ultra-processed'][product.nova_group - 1]}</Text>}
                    </View>
                </View>

                {!personalizedRating && !isBeauty && baseRating?.hasData && (
                    <TouchableOpacity style={styles.personaliseHint} onPress={() => navigation.navigate('Profile')}>
                        <Text style={styles.personaliseHintText}>Set up your health profile for a score personalised to you →</Text>
                    </TouchableOpacity>
                )}

                {/* Quick flag chips */}
                {flags.length > 0 && (
                    <View style={styles.flagsRow}>
                        {flags.slice(0, 5).map((f, i) => {
                            const Icon = f.icon;
                            return (
                                <View key={i} style={[styles.flagChip, { borderColor: f.color + '60', backgroundColor: f.color + '12' }]}>
                                    <Icon color={f.color} size={12} />
                                    <Text style={[styles.flagChipText, { color: f.color }]}>{f.label}</Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Additive summary */}
                {!isBeauty && additives.length > 0 && (
                    <View style={styles.additiveSummaryCard}>
                        <FlaskConical color={Colors.textMuted} size={16} />
                        <Text style={styles.additiveSummaryText}>
                            {additives.length} additive{additives.length > 1 ? 's' : ''} detected
                            {additiveSummary.high > 0 && <Text style={{ color: Colors.danger }}> · {additiveSummary.high} high-risk</Text>}
                            {additiveSummary.moderate > 0 && <Text style={{ color: Colors.warning }}> · {additiveSummary.moderate} moderate</Text>}
                        </Text>
                        <TouchableOpacity onPress={() => setActiveTab('Ingredients')}>
                            <Text style={[styles.additiveSeeMore, { color: primaryColor }]}>View →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* No-data prompt */}
                {!isBeauty && !baseRating?.hasData && (
                    <View style={styles.noDataCard}>
                        <Text style={styles.noDataText}>Nutrition data isn't available for this product. Snap the label to fill it in.</Text>
                        <TouchableOpacity
                            style={[styles.ctaBtn, { borderColor: Colors.primary }]}
                            onPress={() => navigation.navigate('IngredientsSnap', { product })}
                        >
                            <Text style={[styles.ctaBtnText, { color: Colors.primary }]}>📸 Scan the label</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Compare — the decide surface */}
                {!isBeauty && (
                    <TouchableOpacity
                        style={[styles.ctaBtn, { borderColor: primaryColor, marginBottom: 12 }]}
                        onPress={() => navigation.navigate('Compare', { product })}
                    >
                        <Text style={[styles.ctaBtnText, { color: primaryColor }]}>⚖️  Compare healthier options</Text>
                    </TouchableOpacity>
                )}

                {/* CTA */}
                <TouchableOpacity
                    style={[styles.pantryBtn, { backgroundColor: inPantryState ? Colors.accent : primaryColor }]}
                    onPress={handleAddToPantry}
                    disabled={inPantryState}
                >
                    {inPantryState ? <CheckCircle color="#fff" size={18} /> : <Plus color="#fff" size={18} />}
                    <Text style={styles.pantryBtnText}>{inPantryState ? 'In your pantry' : 'Add to Pantry'}</Text>
                </TouchableOpacity>
            </ScrollView>
        );
    };

    // ─── Tab: Nutrition ───────────────────────────────────────────────────────
    const renderNutrition = () => {
        if (!baseRating?.hasData) return <View style={styles.emptyState}><Text style={styles.emptyText}>Nutrition data not available for this product.</Text></View>;
        const serving = product.nutrition.serving_size_g;
        return (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>
                {serving && <Text style={styles.servingNote}>Per serving: {serving}g</Text>}
                <View style={styles.nutritionTable}>
                    <View style={[styles.nutritionHeaderRow, { backgroundColor: primaryColor }]}>
                        <Text style={[styles.nutritionHeaderCell, { flex: 2 }]}>Nutrient</Text>
                        <Text style={styles.nutritionHeaderCell}>Per 100g</Text>
                        {serving && <Text style={styles.nutritionHeaderCell}>Per serving</Text>}
                        <Text style={styles.nutritionHeaderCell}>{constraints ? 'Your %' : 'RDA%'}</Text>
                    </View>
                    {Object.keys(NUTRIENT_LABELS).map(key => {
                        const data = baseRating.nutrients[key];
                        if (!data) return null;
                        const statusColor = data.status === 'positive' ? Colors.statusPositive : data.status === 'negative' ? Colors.statusNegative : data.status === 'low' ? Colors.statusLow : Colors.statusFair;
                        const perServing = serving ? ((data.value * serving) / 100).toFixed(1) : null;
                        const personalizedPct = constraints
                            ? (key === 'saturated_fat' ? Math.round((data.value / constraints.maxSatFatG) * 100)
                                : key === 'sugars' ? Math.round((data.value / constraints.maxSugarsG) * 100)
                                    : key === 'sodium' ? Math.round((data.value / constraints.maxSodiumMg) * 100)
                                        : data.rdaPercentage)
                            : data.rdaPercentage;
                        return (
                            <View key={key} style={[styles.nutritionRow, (key === 'saturated_fat' || key === 'added_sugars') ? styles.nutritionRowIndented : undefined]}>
                                <Text style={[styles.nutritionCell, { flex: 2 }]} numberOfLines={1}>{NUTRIENT_LABELS[key]}</Text>
                                <Text style={styles.nutritionCell}>{data.value.toFixed(1)}{data.unit}</Text>
                                {serving && <Text style={styles.nutritionCell}>{perServing}{data.unit}</Text>}
                                <View style={styles.rdaCell}>
                                    <View style={[styles.rdaBar, { backgroundColor: statusColor + '30' }]}>
                                        <View style={[styles.rdaBarFill, { width: `${Math.min(personalizedPct, 100)}%` as any, backgroundColor: statusColor }]} />
                                    </View>
                                    <Text style={[styles.rdaPct, { color: statusColor }]}>{personalizedPct}%</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
                {constraints && <Text style={styles.servingNote}>% based on your personal daily limits</Text>}
                <View style={styles.rdaLegend}>
                    <Text style={styles.rdaLegendTitle}>Status:</Text>
                    {[['#1B5E20', 'Good'], ['#F57C00', 'Moderate'], ['#D32F2F', 'High/Low']].map(([c, l]) => (
                        <View key={l} style={styles.rdaLegendRow}>
                            <View style={[styles.rdaLegendDot, { backgroundColor: c }]} />
                            <Text style={styles.rdaLegendLabel}>{l}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        );
    };

    // ─── Tab: Ingredients & Additives ────────────────────────────────────────
    const renderIngredients = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120, gap: 16 }}>
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Ingredients</Text>
                {ingredients ? (
                    <Text style={styles.ingredientsText}>{ingredients}</Text>
                ) : <Text style={styles.emptyText}>Ingredients not available.</Text>}
            </View>

            {!isBeauty && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Additives ({additives.length})</Text>
                    {additives.length === 0 ? (
                        <View style={styles.cleanRow}><ShieldCheck color={Colors.success} size={22} /><Text style={styles.cleanText}>No major additives found</Text></View>
                    ) : (
                        additives.map((add, i) => (
                            <TouchableOpacity key={i} style={styles.additiveRow} onPress={() => setSelectedAdditive(add)}>
                                <View style={[styles.additiveDot, { backgroundColor: getConcernColor(add.level) }]} />
                                <View style={{ flex: 1 }}>
                                    <View style={styles.additiveNameRow}>
                                        <Text style={styles.additiveName}>{add.name}</Text>
                                        <Text style={[styles.additiveId, { color: getConcernColor(add.level) }]}>{add.id}</Text>
                                    </View>
                                    <Text style={styles.additiveFunction}>{add.function} · <Text style={{ color: getConcernColor(add.level), fontWeight: '700' }}>{add.level.toUpperCase()}</Text></Text>
                                    {add.fssaiNote && <Text style={styles.fssaiNote}>FSSAI: {add.fssaiNote}</Text>}
                                </View>
                                <ChevronRight color={Colors.textMuted} size={16} />
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            )}

            {isBeauty && chemicals.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Chemicals of Concern</Text>
                    {chemicals.map((chem, i) => (
                        <View key={i} style={styles.additiveRow}>
                            <View style={[styles.additiveDot, { backgroundColor: chem.level === 'high' ? Colors.danger : chem.level === 'moderate' ? Colors.warning : Colors.statusLow }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.additiveName}>{chem.name}</Text>
                                <Text style={styles.additiveFunction}>{chem.level.toUpperCase()} concern</Text>
                                <Text style={styles.fssaiNote}>{chem.description}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );

    // ─── Tab: For You ─────────────────────────────────────────────────────────
    const renderForYou = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.md, gap: 12, paddingBottom: 120 }}>
            {!constraints ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Complete your health profile to get insights personalised to your goals and conditions.</Text>
                    <TouchableOpacity style={[styles.ctaBtn, { borderColor: Colors.primary, alignSelf: 'center', marginTop: 16 }]} onPress={() => navigation.navigate('Profile')}>
                        <Text style={[styles.ctaBtnText, { color: Colors.primary }]}>Set Up Profile →</Text>
                    </TouchableOpacity>
                </View>
            ) : forYouBullets.length === 0 ? (
                <View style={styles.emptyState}><Text style={styles.emptyText}>Not enough nutrition data for personalised insights.</Text></View>
            ) : (
                forYouBullets.map((bullet, i) => {
                    const bgColor = bullet.severity === 'bad' ? '#FFF5F5' : bullet.severity === 'warn' ? '#FFFBF0' : bullet.severity === 'good' ? '#F0FFF4' : '#F8F9FA';
                    const borderColor = bullet.severity === 'bad' ? Colors.danger : bullet.severity === 'warn' ? Colors.warning : bullet.severity === 'good' ? Colors.success : Colors.border;
                    return (
                        <View key={i} style={[styles.bulletCard, { backgroundColor: bgColor, borderLeftColor: borderColor }]}>
                            <Text style={styles.bulletEmoji}>{bullet.emoji}</Text>
                            <Text style={styles.bulletText}>{bullet.text}</Text>
                        </View>
                    );
                })
            )}
        </ScrollView>
    );

    const tabContent: Record<TabId, () => React.ReactNode> = {
        'Overview': renderOverview,
        'Nutrition': renderNutrition,
        'Ingredients': renderIngredients,
        'For You': renderForYou,
    };

    return (
        <View style={styles.wrapper}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: primaryColor }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    {product.image_url ? <Image source={{ uri: product.image_url }} style={styles.headerThumb} /> : null}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerName} numberOfLines={1}>{product.name}</Text>
                        {product.brand && <Text style={styles.headerBrand}>{product.brand}</Text>}
                    </View>
                </View>
                <TouchableOpacity onPress={handleToggleFav} style={styles.headerBtn}>
                    <Heart size={22} color="#fff" fill={isFavState ? '#fff' : 'transparent'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
                    <Share2 size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Tab bar */}
            <View style={styles.tabBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
                    {TABS.map(tab => (
                        <TouchableOpacity key={tab} style={styles.tabItem} onPress={() => setActiveTab(tab)}>
                            <Text style={[styles.tabText, activeTab === tab && { color: primaryColor, fontWeight: '800' }]}>{tab}</Text>
                            {activeTab === tab && <View style={[styles.tabIndicator, { backgroundColor: primaryColor }]} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Tab content */}
            <View style={{ flex: 1 }}>
                {tabContent[activeTab]()}
            </View>

            {/* Toast */}
            {toast && (
                <View style={styles.toast}>
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            {/* Additive detail modal */}
            {selectedAdditive && (
                <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedAdditive(null)}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedAdditive(null)}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalDragHandle} />
                            <View style={styles.modalHeader}>
                                <View style={[styles.additiveDot, { backgroundColor: getConcernColor(selectedAdditive.level), width: 12, height: 12, borderRadius: 6 }]} />
                                <Text style={styles.modalTitle}>{selectedAdditive.name}</Text>
                                <Text style={[styles.modalBadge, { backgroundColor: getConcernColor(selectedAdditive.level) + '20', color: getConcernColor(selectedAdditive.level) }]}>{selectedAdditive.level.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.modalId}>INS/E-number: {selectedAdditive.id}</Text>
                            <Text style={styles.modalFunction}>Function: {selectedAdditive.function}</Text>
                            <Text style={styles.modalDesc}>{selectedAdditive.description}</Text>
                            {selectedAdditive.fssaiNote && (
                                <View style={styles.fssaiBox}><Text style={styles.fssaiBoxText}>🇮🇳 FSSAI: {selectedAdditive.fssaiNote}</Text></View>
                            )}
                        </View>
                    </TouchableOpacity>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },
    header: { paddingTop: 44, paddingBottom: 14, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)' },
    headerName: { fontSize: 15, fontWeight: '800', color: '#fff', flex: 1 },
    headerBrand: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

    tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Colors.border, ...Shadow.sm },
    tabBarContent: { paddingHorizontal: Spacing.sm },
    tabItem: { paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
    tabText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
    tabIndicator: { position: 'absolute', bottom: 0, left: 16, right: 16, height: 2.5, borderRadius: 2 },

    // Overview
    scoreCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.lg, gap: 16, alignItems: 'center', ...Shadow.md },
    scoreCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
    scoreInner: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
    scoreGrade: { color: '#fff', fontSize: 28, fontWeight: '900' },
    verdictText: { fontSize: 16, fontWeight: '800' },
    scoreSubtext: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
    novaText: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

    personaliseHint: { backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md },
    personaliseHintText: { fontSize: 13, color: Colors.primaryDark, fontWeight: '600' },

    flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    flagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
    flagChipText: { fontSize: 11, fontWeight: '700' },

    additiveSummaryCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: Radius.md, padding: Spacing.md, ...Shadow.sm },
    additiveSummaryText: { flex: 1, fontSize: 13, color: Colors.textSecondary },
    additiveSeeMore: { fontSize: 13, fontWeight: '700' },

    noDataCard: { backgroundColor: '#fff', borderRadius: Radius.md, padding: Spacing.md, gap: 12, ...Shadow.sm },
    noDataText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

    ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: Radius.md, borderWidth: 1.5, backgroundColor: '#fff' },
    ctaBtnText: { fontSize: 14, fontWeight: '700' },

    pantryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: Radius.full, ...Shadow.sm },
    pantryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    // Nutrition
    servingNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 8, textAlign: 'center' },
    nutritionTable: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#fff', ...Shadow.sm },
    nutritionHeaderRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
    nutritionHeaderCell: { flex: 1, fontSize: 11, fontWeight: '800', color: '#fff', textAlign: 'center' },
    nutritionRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider, alignItems: 'center' },
    nutritionRowIndented: { paddingLeft: 24, backgroundColor: Colors.divider + '30' },
    nutritionCell: { flex: 1, fontSize: 12, color: Colors.textPrimary, textAlign: 'center', fontWeight: '600' },
    rdaCell: { flex: 1, alignItems: 'center', gap: 3 },
    rdaBar: { width: 40, height: 4, borderRadius: 2, overflow: 'hidden' },
    rdaBarFill: { height: '100%', borderRadius: 2 },
    rdaPct: { fontSize: 10, fontWeight: '800' },
    rdaLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' },
    rdaLegendTitle: { fontSize: 11, color: Colors.textMuted },
    rdaLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    rdaLegendDot: { width: 8, height: 8, borderRadius: 4 },
    rdaLegendLabel: { fontSize: 11, color: Colors.textMuted },

    // Ingredients & Additives
    card: { backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.md, ...Shadow.sm },
    cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 12 },
    ingredientsText: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
    additiveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    additiveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    additiveNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    additiveName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    additiveId: { fontSize: 11, fontWeight: '800' },
    additiveFunction: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
    fssaiNote: { fontSize: 11, color: Colors.info, marginTop: 2 },
    cleanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 4 },
    cleanText: { fontSize: 15, fontWeight: '700', color: Colors.success },

    // For You
    bulletCard: { flexDirection: 'row', gap: 12, borderRadius: Radius.lg, padding: Spacing.md, borderLeftWidth: 3, alignItems: 'flex-start' },
    bulletEmoji: { fontSize: 20, lineHeight: 24 },
    bulletText: { flex: 1, fontSize: 14, color: Colors.textPrimary, lineHeight: 21 },

    // Misc
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, marginTop: 60 },
    emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    toast: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#222', borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 10 },
    toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    // Additive modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: 40 },
    modalDragHandle: { width: 40, height: 5, backgroundColor: Colors.border, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, flex: 1 },
    modalBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
    modalId: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
    modalFunction: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },
    modalDesc: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
    fssaiBox: { marginTop: 14, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md },
    fssaiBoxText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});
