/**
 * ResultScreen — the verdict, rebuilt for v5.
 *
 * One scroll, verdict-first (no tabs hiding the story):
 *   score ring + why → allergen/diet alerts → sugar in teaspoons → flags →
 *   personalised bullets → nutrition bars → additives → ingredients →
 *   better alternatives → sticky actions.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
    Share, Modal,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList, HealthConstraints, UserProfile, Product } from '../types';
import {
    calculateNutriScore, calculatePersonalizedScore, generateForYouBullets,
    getVerdictText, nutriScoreToPercent, getVerdictReasons, sugarTeaspoons,
    estimateAddedSugars,
} from '../services/ratingEngine';
import { findAdditives, getConcernColor, getAdditiveSummary, Additive } from '../services/additivesService';
import { findChemicals } from '../services/beautyService';
import { analyzeDietary, canCheckDietary, DietaryAlert } from '../services/dietaryEngine';
import { isFavorite as checkFav, toggleFavorite } from '../services/favorites';
import { addToPantry, isInPantry } from '../services/pantryService';
import { getHealthConstraints, getUserProfile } from '../services/userProfileService';
import {
    initIntelligence, categoryProducts, rankProducts, lineKey, type RankedProduct,
} from '../services/intelligence';
import { openOnSwiggy } from '../services/swiggy';
import {
    ArrowLeft, Heart, Share2, Plus, CheckCircle, AlertTriangle, XCircle,
    ChevronRight, FlaskConical, ShieldCheck, Scale, Camera, ShoppingCart,
    Sparkles, CircleAlert,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { ScoreRing, Chip, SectionCard, AlertBanner, NutrientBar } from '../components';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

const NUTRIENT_LABELS: [key: string, label: string, indent: boolean][] = [
    ['energy', 'Energy', false],
    ['fat', 'Total Fat', false],
    ['saturated_fat', 'Saturated Fat', true],
    ['trans_fat', 'Trans Fat', true],
    ['carbohydrates', 'Carbohydrates', false],
    ['sugars', 'Total Sugars', true],
    ['proteins', 'Protein', false],
    ['fiber', 'Fibre', false],
    ['sodium', 'Sodium', false],
];

export default function ResultScreen({ route, navigation }: Props) {
    const { product } = route.params;
    const insets = useSafeAreaInsets();
    const [isFavState, setIsFavState] = useState(false);
    const [inPantryState, setInPantryState] = useState(false);
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [selectedAdditive, setSelectedAdditive] = useState<Additive | null>(null);
    const [alternatives, setAlternatives] = useState<RankedProduct[]>([]);
    const [ingredientsExpanded, setIngredientsExpanded] = useState(false);

    const isBeauty = product.category === 'beauty';

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
    const dietaryAlerts: DietaryAlert[] = useMemo(
        () => (profile ? analyzeDietary(product, { allergies: profile.allergies, diet: profile.diet }) : []),
        [product, profile],
    );
    const verdictReasons = useMemo(
        () => (isBeauty ? [] : getVerdictReasons(product, constraints)),
        [product, constraints, isBeauty],
    );

    const score0100 = personalizedRating
        ? personalizedRating.score
        : (baseRating?.hasData ? nutriScoreToPercent(baseRating.score) : null);
    const verdictText = score0100 !== null ? getVerdictText(score0100) : 'No nutrition data yet';

    // Sugar → teaspoons (the number people actually feel)
    const totalSugar = product.nutrition.sugars_100g;
    const serving = product.nutrition.serving_size_g;
    const tsPer100 = totalSugar != null ? sugarTeaspoons(totalSugar) : null;
    const tsPerServing = totalSugar != null && serving ? sugarTeaspoons((totalSugar * serving) / 100) : null;
    const addedEstimate = useMemo(() => estimateAddedSugars(product), [product]);

    useEffect(() => {
        checkFav(product.barcode).then(setIsFavState);
        isInPantry(product.barcode).then(setInPantryState);
        getHealthConstraints().then(setConstraints);
        getUserProfile().then(setProfile);
    }, [product.barcode]);

    // Better alternatives from the local catalog (seed + learned)
    useEffect(() => {
        let alive = true;
        (async () => {
            if (isBeauty || !product.subCategory) return;
            await initIntelligence();
            const cons = await getHealthConstraints().catch(() => null);
            const myLine = lineKey(product.brand, product.name);
            const pool = categoryProducts(product.subCategory).filter(
                p => lineKey(p.brand, p.name) !== myLine,
            );
            if (!pool.length || !alive) return;
            const myScore = score0100 ?? 0;
            const better = rankProducts(pool, cons).filter(r => r.score >= myScore + 5).slice(0, 3);
            if (alive) setAlternatives(better);
        })();
        return () => { alive = false; };
        // score0100 settles once constraints load; re-run then.
    }, [product, isBeauty, score0100]);

    const handleToggleFav = useCallback(async () => {
        const nowFav = await toggleFavorite({
            barcode: product.barcode, name: product.name, brand: product.brand,
            image_url: product.image_url, grade: displayRating?.grade || '?',
            score: score0100 ?? 50, category: product.category || 'food',
            subCategory: product.subCategory || 'General', savedAt: Date.now(),
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
        const reasons = verdictReasons.slice(0, 2).map(r => `${r.tone === 'good' ? '✅' : '⚠️'} ${r.text}`).join('\n');
        const msg = `I scanned ${product.name} on Padho Label 🥗\n\nHealth Grade: ${grade}${score0100 != null ? ` (${score0100}/100)` : ''} — ${verdictText}${reasons ? `\n\n${reasons}` : ''}`;
        try { await Share.share({ message: msg }); } catch { /* user cancelled */ }
    }, [product, displayRating, verdictReasons, verdictText, score0100]);

    // ── Quick flags ──────────────────────────────────────────────────────────
    const flags = useMemo(() => {
        const out: { label: string; color: string; icon: any }[] = [];
        if (isBeauty) return out;
        const n = product.nutrition;
        const satFat = n.saturated_fat_100g || 0;
        const added = addedEstimate.grams;
        const fiber = n.fiber_100g || 0;
        const transFat = n.trans_fat_100g;
        const sodiumMg = n.sodium_100g != null ? n.sodium_100g * 1000 : (n.salt_100g || 0) * 400;
        if (transFat != null && transFat > 0) out.push({ label: 'Trans Fat!', color: Colors.danger, icon: XCircle });
        if (satFat > 8) out.push({ label: 'High Sat Fat', color: Colors.danger, icon: AlertTriangle });
        if (added > 15) out.push({ label: 'High Added Sugar', color: Colors.warning, icon: AlertTriangle });
        if (sodiumMg > 600) out.push({ label: 'High Sodium', color: Colors.warning, icon: AlertTriangle });
        if (product.nova_group === 4) out.push({ label: 'Ultra-processed', color: Colors.warning, icon: FlaskConical });
        if (fiber > 5) out.push({ label: 'Good Fibre', color: Colors.success, icon: CheckCircle });
        if ((n.proteins_100g || 0) > 10) out.push({ label: 'Protein-rich', color: Colors.success, icon: CheckCircle });
        if (transFat === 0 && baseRating?.hasData) out.push({ label: 'No Trans Fat', color: Colors.success, icon: CheckCircle });
        if (added === 0 && (n.sugars_100g ?? 0) < 5 && baseRating?.hasData) out.push({ label: 'No Added Sugar', color: Colors.accent, icon: ShieldCheck });
        if (additives.some(a => a.level === 'high')) out.push({ label: 'High-Risk Additives', color: Colors.danger, icon: FlaskConical });
        return out.slice(0, 6);
    }, [product, isBeauty, additives, baseRating, addedEstimate]);

    const hasProfile = !!constraints;

    return (
        <View style={styles.wrapper}>
            <StatusBar style="dark" />

            {/* ── Header ── */}
            <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft color={Colors.textPrimary} size={24} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    {product.image_url ? (
                        <Image source={{ uri: product.image_url }} style={styles.headerThumb} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerName} numberOfLines={1}>{product.name}</Text>
                        <Text style={styles.headerBrand} numberOfLines={1}>
                            {[product.brand, product.quantity].filter(Boolean).join(' · ') || 'Unknown brand'}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity onPress={handleToggleFav} style={styles.headerBtn}>
                    <Heart size={22} color={isFavState ? Colors.danger : Colors.textSecondary} fill={isFavState ? Colors.danger : 'transparent'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleShare} style={styles.headerBtn}>
                    <Share2 size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: Spacing.md, gap: 12, paddingBottom: 110 + insets.bottom }}
            >
                {/* ── Verdict hero ── */}
                <View style={styles.heroCard}>
                    <ScoreRing
                        score={score0100}
                        grade={displayRating?.grade || null}
                        color={displayRating?.color || Colors.textMuted}
                        subtitle={personalizedRating ? 'for you' : 'general'}
                    />
                    <Text style={[styles.verdictText, { color: displayRating?.color || Colors.textMuted }]}>
                        {verdictText}
                    </Text>
                    {product.nova_group ? (
                        <Text style={styles.novaText}>
                            NOVA {product.nova_group} · {['Unprocessed', 'Culinary ingredient', 'Processed', 'Ultra-processed'][product.nova_group - 1]}
                        </Text>
                    ) : null}
                    {verdictReasons.length > 0 && (
                        <View style={styles.reasonsWrap}>
                            {verdictReasons.map((r, i) => (
                                <View key={i} style={styles.reasonRow}>
                                    {r.tone === 'good'
                                        ? <CheckCircle color={Colors.success} size={15} />
                                        : r.tone === 'bad'
                                            ? <XCircle color={Colors.danger} size={15} />
                                            : <CircleAlert color={Colors.warning} size={15} />}
                                    <Text style={styles.reasonText}>{r.text}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ── Personalisation nudge ── */}
                {!hasProfile && !isBeauty && baseRating?.hasData && (
                    <TouchableOpacity style={styles.personaliseHint} onPress={() => navigation.navigate('Onboarding')}>
                        <Sparkles color={Colors.primaryDark} size={16} />
                        <Text style={styles.personaliseHintText}>
                            Set up your health profile — scores personalised to your body, goals and allergies
                        </Text>
                        <ChevronRight color={Colors.primaryDark} size={16} />
                    </TouchableOpacity>
                )}

                {/* ── Allergen / diet alerts — the things you MUST see ── */}
                {dietaryAlerts.map((a, i) => (
                    <AlertBanner
                        key={`${a.title}-${i}`}
                        tone={a.severity === 'danger' ? 'danger' : 'warning'}
                        title={a.title}
                        body={a.detail}
                    />
                ))}
                {profile && (profile.allergies.length > 0 || profile.diet !== 'non_veg') &&
                    !canCheckDietary(product) && (
                    <AlertBanner
                        tone="info"
                        title="Couldn't check allergens or diet"
                        body="No ingredients data for this product. Snap the label below and I'll check it against your profile."
                    />
                )}

                {/* ── No-data prompt ── */}
                {!isBeauty && !baseRating?.hasData && (
                    <SectionCard>
                        <Text style={styles.noDataText}>
                            Nutrition data isn't available for this product yet. Snap the label —
                            it takes 10 seconds and the app remembers it forever.
                        </Text>
                        <TouchableOpacity
                            style={styles.snapBtn}
                            onPress={() => navigation.navigate('IngredientsSnap', { product })}
                        >
                            <Camera color="#fff" size={17} />
                            <Text style={styles.snapBtnText}>Snap the label</Text>
                        </TouchableOpacity>
                    </SectionCard>
                )}

                {/* ── Sugar in teaspoons ── */}
                {!isBeauty && tsPer100 != null && tsPer100 > 0 && (
                    <SectionCard title="Sugar, in teaspoons" icon={AlertTriangle}
                        iconColor={tsPer100 >= 6 ? Colors.danger : tsPer100 >= 3 ? Colors.warning : Colors.success}>
                        <View style={styles.tspRow}>
                            <Text style={styles.tspBig}>
                                {tsPerServing != null ? tsPerServing : tsPer100}
                                <Text style={styles.tspUnit}> tsp</Text>
                            </Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.tspLabel}>
                                    {tsPerServing != null ? `per ${serving}g serving` : 'per 100g'}
                                </Text>
                                <Text style={styles.tspSpoons} numberOfLines={1}>
                                    {'🥄'.repeat(Math.max(1, Math.min(10, Math.round(tsPerServing ?? tsPer100))))}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.tspNote}>
                            {addedEstimate.grams === 0 && addedEstimate.assumed
                                ? 'Looks naturally occurring (no added sweetener on the ingredient list).'
                                : `WHO suggests keeping ADDED sugar under ~6 tsp (25g) a day.${tsPerServing == null ? ' Value shown is per 100g.' : ''}`}
                        </Text>
                    </SectionCard>
                )}

                {/* ── Quick flags ── */}
                {flags.length > 0 && (
                    <View style={styles.flagsRow}>
                        {flags.map((f, i) => (
                            <Chip key={i} label={f.label} color={f.color} icon={f.icon} />
                        ))}
                    </View>
                )}

                {/* ── For You ── */}
                {!isBeauty && hasProfile && forYouBullets.length > 0 && (
                    <SectionCard title="For you" icon={Sparkles} iconColor={Colors.primary}>
                        <View style={{ gap: 10 }}>
                            {forYouBullets.map((bullet, i) => {
                                const borderColor = bullet.severity === 'bad' ? Colors.danger : bullet.severity === 'warn' ? Colors.warning : bullet.severity === 'good' ? Colors.success : Colors.border;
                                return (
                                    <View key={i} style={[styles.bulletCard, { borderLeftColor: borderColor }]}>
                                        <Text style={styles.bulletEmoji}>{bullet.emoji}</Text>
                                        <Text style={styles.bulletText}>{bullet.text}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </SectionCard>
                )}

                {/* ── Nutrition ── */}
                {!isBeauty && baseRating?.hasData && (
                    <SectionCard title={constraints ? 'Nutrition · % of YOUR daily limits' : 'Nutrition · % of daily RDA'}>
                        {serving ? <Text style={styles.servingNote}>Values per 100g · serving is {serving}g</Text> : null}
                        {NUTRIENT_LABELS.map(([key, label, indent]) => {
                            const data = baseRating.nutrients[key];
                            if (!data) return null;
                            const statusColor = data.status === 'positive' ? Colors.statusPositive
                                : data.status === 'negative' ? Colors.statusNegative
                                    : data.status === 'low' ? Colors.statusLow : Colors.statusFair;
                            const personalizedPct = constraints
                                ? (key === 'saturated_fat' ? (data.value / constraints.maxSatFatG) * 100
                                    : key === 'sugars' ? (data.value / constraints.maxSugarsG) * 100
                                        : key === 'sodium' ? (data.value / constraints.maxSodiumMg) * 100
                                            : data.rdaPercentage)
                                : data.rdaPercentage;
                            return (
                                <NutrientBar
                                    key={key}
                                    label={label}
                                    valueText={`${data.value.toFixed(1)}${data.unit}`}
                                    percent={personalizedPct}
                                    color={statusColor}
                                    indent={indent}
                                />
                            );
                        })}
                    </SectionCard>
                )}

                {/* ── Additives ── */}
                {!isBeauty && ingredients.length > 0 && (
                    <SectionCard
                        title={`Additives (${additives.length})`}
                        icon={FlaskConical}
                        right={additiveSummary.high > 0 ? (
                            <Text style={{ color: Colors.danger, fontSize: 12, fontWeight: '800' }}>
                                {additiveSummary.high} high-risk
                            </Text>
                        ) : undefined}
                    >
                        {additives.length === 0 ? (
                            <View style={styles.cleanRow}>
                                <ShieldCheck color={Colors.success} size={20} />
                                <Text style={styles.cleanText}>No major additives found</Text>
                            </View>
                        ) : (
                            additives.map((add, i) => (
                                <TouchableOpacity key={i} style={styles.additiveRow} onPress={() => setSelectedAdditive(add)}>
                                    <View style={[styles.additiveDot, { backgroundColor: getConcernColor(add.level) }]} />
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.additiveNameRow}>
                                            <Text style={styles.additiveName}>{add.name}</Text>
                                            <Text style={[styles.additiveId, { color: getConcernColor(add.level) }]}>{add.id}</Text>
                                        </View>
                                        <Text style={styles.additiveFunction}>
                                            {add.function} · <Text style={{ color: getConcernColor(add.level), fontWeight: '800' }}>{add.level.toUpperCase()}</Text>
                                        </Text>
                                    </View>
                                    <ChevronRight color={Colors.textMuted} size={16} />
                                </TouchableOpacity>
                            ))
                        )}
                    </SectionCard>
                )}

                {/* ── Beauty: chemicals of concern ── */}
                {isBeauty && chemicals.length > 0 && (
                    <SectionCard title="Chemicals of Concern" icon={FlaskConical} iconColor={Colors.beauty}>
                        {chemicals.map((chem, i) => (
                            <View key={i} style={styles.additiveRow}>
                                <View style={[styles.additiveDot, { backgroundColor: chem.level === 'high' ? Colors.danger : chem.level === 'moderate' ? Colors.warning : Colors.statusLow }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.additiveName}>{chem.name}</Text>
                                    <Text style={styles.additiveFunction}>{chem.level.toUpperCase()} concern · {chem.description}</Text>
                                </View>
                            </View>
                        ))}
                    </SectionCard>
                )}

                {/* ── Ingredients ── */}
                {ingredients ? (
                    <SectionCard title="Ingredients">
                        <Text style={styles.ingredientsText} numberOfLines={ingredientsExpanded ? undefined : 4}>
                            {ingredients}
                        </Text>
                        {ingredients.length > 180 && (
                            <TouchableOpacity onPress={() => setIngredientsExpanded(e => !e)}>
                                <Text style={styles.expandLink}>{ingredientsExpanded ? 'Show less' : 'Show all'}</Text>
                            </TouchableOpacity>
                        )}
                    </SectionCard>
                ) : !isBeauty && baseRating?.hasData ? (
                    <SectionCard title="Ingredients">
                        <Text style={styles.noDataText}>No ingredient list yet — snap the label to unlock additive, allergen and veg checks.</Text>
                        <TouchableOpacity
                            style={[styles.snapBtn, { backgroundColor: Colors.pillBackground }]}
                            onPress={() => navigation.navigate('IngredientsSnap', { product })}
                        >
                            <Camera color={Colors.textSecondary} size={16} />
                            <Text style={[styles.snapBtnText, { color: Colors.textSecondary }]}>Snap the label</Text>
                        </TouchableOpacity>
                    </SectionCard>
                ) : null}

                {/* ── Better alternatives ── */}
                {!isBeauty && alternatives.length > 0 && (
                    <SectionCard title="Healthier swaps" icon={Scale} iconColor={Colors.accent}>
                        {alternatives.map((alt, i) => (
                            <TouchableOpacity
                                key={i}
                                style={styles.altRow}
                                onPress={() => navigation.push('Result', { product: alt.product as Product })}
                            >
                                <View style={[styles.altScorePill, { backgroundColor: alt.color }]}>
                                    <Text style={styles.altScoreText}>{alt.grade}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.altName} numberOfLines={1}>
                                        {[alt.product.brand, alt.product.name].filter(Boolean).join(' ')}
                                    </Text>
                                    <Text style={styles.altReason}>{alt.reason} · scores {alt.score}/100</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.altBuyBtn}
                                    onPress={() => openOnSwiggy(`${alt.product.brand || ''} ${alt.product.name}`)}
                                >
                                    <ShoppingCart color="#fff" size={13} />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity onPress={() => navigation.navigate('Compare', { product })}>
                            <Text style={styles.expandLink}>Compare the whole category →</Text>
                        </TouchableOpacity>
                    </SectionCard>
                )}
            </ScrollView>

            {/* ── Sticky actions ── */}
            <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                {!isBeauty && (
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnGhost]}
                        onPress={() => navigation.navigate('Compare', { product })}
                    >
                        <Scale color={Colors.primary} size={18} />
                        <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Compare</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: inPantryState ? Colors.accent : Colors.primary }]}
                    onPress={handleAddToPantry}
                    disabled={inPantryState}
                >
                    {inPantryState ? <CheckCircle color="#fff" size={18} /> : <Plus color="#fff" size={18} />}
                    <Text style={styles.actionBtnText}>{inPantryState ? 'In your pantry' : 'Add to Pantry'}</Text>
                </TouchableOpacity>
            </View>

            {/* Toast */}
            {toast && (
                <View style={[styles.toast, { bottom: 90 + insets.bottom }]}>
                    <Text style={styles.toastText}>{toast}</Text>
                </View>
            )}

            {/* Additive detail modal */}
            {selectedAdditive && (
                <Modal visible transparent animationType="slide" onRequestClose={() => setSelectedAdditive(null)}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedAdditive(null)}>
                        <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
                            <View style={styles.modalDragHandle} />
                            <View style={styles.modalHeader}>
                                <View style={[styles.additiveDot, { backgroundColor: getConcernColor(selectedAdditive.level), width: 12, height: 12, borderRadius: 6 }]} />
                                <Text style={styles.modalTitle}>{selectedAdditive.name}</Text>
                                <Text style={[styles.modalBadge, { backgroundColor: getConcernColor(selectedAdditive.level) + '20', color: getConcernColor(selectedAdditive.level) }]}>
                                    {selectedAdditive.level.toUpperCase()}
                                </Text>
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
    header: {
        backgroundColor: Colors.card, paddingBottom: 10, paddingHorizontal: Spacing.sm,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.divider },
    headerName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
    headerBrand: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

    heroCard: {
        backgroundColor: Colors.card, borderRadius: Radius.xxl, padding: Spacing.lg,
        alignItems: 'center', gap: 6, ...Shadow.md,
    },
    verdictText: { fontSize: 19, fontWeight: '900', marginTop: 6, letterSpacing: -0.3 },
    novaText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
    reasonsWrap: { alignSelf: 'stretch', marginTop: 10, gap: 7, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 12 },
    reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    reasonText: { fontSize: 13.5, color: Colors.textSecondary, fontWeight: '600', flex: 1 },

    personaliseHint: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, padding: Spacing.md,
        borderWidth: 1, borderColor: Colors.primary + '35',
    },
    personaliseHintText: { flex: 1, fontSize: 13, color: Colors.primaryDark, fontWeight: '700', lineHeight: 18 },

    noDataText: { fontSize: 13.5, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
    snapBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: Colors.primary, borderRadius: Radius.full, paddingVertical: 12,
    },
    snapBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

    tspRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    tspBig: { fontSize: 40, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -1 },
    tspUnit: { fontSize: 16, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0 },
    tspLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    tspSpoons: { fontSize: 18, marginTop: 3 },
    tspNote: { fontSize: 12, color: Colors.textMuted, marginTop: 10, lineHeight: 17 },

    flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

    bulletCard: {
        flexDirection: 'row', gap: 10, borderRadius: Radius.md, padding: 12,
        borderLeftWidth: 3, alignItems: 'flex-start', backgroundColor: Colors.background,
    },
    bulletEmoji: { fontSize: 17, lineHeight: 22 },
    bulletText: { flex: 1, fontSize: 13.5, color: Colors.textPrimary, lineHeight: 20 },

    servingNote: { fontSize: 12, color: Colors.textMuted, marginBottom: 6 },

    additiveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    additiveDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    additiveNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    additiveName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    additiveId: { fontSize: 11, fontWeight: '800' },
    additiveFunction: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
    cleanRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 4 },
    cleanText: { fontSize: 14.5, fontWeight: '700', color: Colors.success },

    ingredientsText: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
    expandLink: { fontSize: 13, fontWeight: '800', color: Colors.primary, marginTop: 10 },

    altRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    altScorePill: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    altScoreText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    altName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
    altReason: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
    altBuyBtn: { backgroundColor: Colors.primary, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

    actionBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', gap: 10,
        paddingHorizontal: Spacing.md, paddingTop: 12,
        backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border,
    },
    actionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingVertical: 14, borderRadius: Radius.full,
    },
    actionBtnGhost: { backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary + '40' },
    actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    toast: { position: 'absolute', alignSelf: 'center', backgroundColor: Colors.textPrimary, borderRadius: Radius.full, paddingHorizontal: 20, paddingVertical: 10 },
    toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: Colors.card, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.lg },
    modalDragHandle: { width: 40, height: 5, backgroundColor: Colors.border, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, flex: 1 },
    modalBadge: { fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, overflow: 'hidden' },
    modalId: { fontSize: 13, color: Colors.textMuted, marginBottom: 4 },
    modalFunction: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },
    modalDesc: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
    fssaiBox: { marginTop: 14, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: Spacing.md },
    fssaiBoxText: { fontSize: 13, color: Colors.primaryDark, fontWeight: '600' },
});
