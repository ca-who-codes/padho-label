/**
 * IngredientsSnap — photograph the label, OCR it, review, apply.
 *
 * v5: the screen finally lives up to its name — it extracts the INGREDIENTS
 * list (which powers additive/allergen/diet analysis), not just the nutrition
 * numbers. Unknown barcodes also get an editable name/brand/category, so the
 * product is remembered as itself instead of "Unknown Product".
 */

import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
    ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCameraPermission,
} from 'react-native-vision-camera';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList, NutritionData, Product } from '../types';
import { updateProductInHistory, saveToHistory } from '../services/history';
import {
    runOCROnImage, parseNutritionFromText, mergeNutrition, extractIngredientsFromText,
} from '../services/ocrNutrition';
import { rememberProduct } from '../services/intelligence';
import { calculateNutriScore } from '../services/ratingEngine';
import { Camera as CameraIcon, CheckCircle, XCircle, RefreshCw, Zap, ListOrdered } from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IngredientsSnap'>;
type Stage = 'camera' | 'processing' | 'review' | 'error';

const FIELD_LABELS: Record<keyof NutritionData, string> = {
    energy_100g: 'Energy (kJ)',
    carbohydrates_100g: 'Carbohydrates (g)',
    sugars_100g: 'Total Sugar (g)',
    added_sugars_100g: 'Added Sugar (g)',
    fat_100g: 'Total Fat (g)',
    saturated_fat_100g: 'Saturated Fat (g)',
    trans_fat_100g: 'Trans Fat (g)',
    fiber_100g: 'Fibre (g)',
    proteins_100g: 'Protein (g)',
    salt_100g: 'Salt (g)',
    sodium_100g: 'Sodium (g)',
    cholesterol_mg_100g: 'Cholesterol (mg)',
    serving_size_g: 'Serving Size (g)',
};

const NUTRITION_KEYS = Object.keys(FIELD_LABELS) as (keyof NutritionData)[];

const CATEGORY_OPTIONS: { key: string; label: string }[] = [
    { key: 'biscuits', label: 'Biscuits' }, { key: 'snacks', label: 'Snacks' },
    { key: 'noodles', label: 'Noodles' }, { key: 'chocolates', label: 'Chocolate' },
    { key: 'drinks', label: 'Soft Drinks' }, { key: 'beverages', label: 'Juice/Tea' },
    { key: 'dairy', label: 'Dairy' }, { key: 'breakfast', label: 'Breakfast' },
    { key: 'spreads', label: 'Spreads' }, { key: 'sauces', label: 'Sauces' },
    { key: 'breads', label: 'Bread' }, { key: 'sweets', label: 'Sweets' },
];

/** Parse the string draft fields back into numeric NutritionData. */
const draftsToNutrition = (drafts: Record<string, string>): NutritionData => {
    const n: NutritionData = {};
    for (const key of NUTRITION_KEYS) {
        const raw = drafts[key];
        if (raw == null || raw.trim() === '') continue;
        const num = parseFloat(raw.replace(',', '.'));
        if (!isNaN(num)) (n as any)[key] = num;
    }
    return n;
};

/** Seed editable string drafts from a NutritionData object. */
const nutritionToDrafts = (n: NutritionData): Record<string, string> => {
    const d: Record<string, string> = {};
    for (const key of NUTRITION_KEYS) {
        const v = n[key];
        d[key] = v != null ? String(v) : '';
    }
    return d;
};

export default function IngredientsSnap({ route, navigation }: Props) {
    const { product } = route.params;
    const cameraRef = useRef<Camera>(null);
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('back');
    const insets = useSafeAreaInsets();

    const isUnknownProduct = !product.name || product.name === 'Unknown Product';

    const [stage, setStage] = useState<Stage>('camera');
    const [statusMsg, setStatusMsg] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [extractedNutrition, setExtractedNutrition] = useState<Partial<NutritionData>>({});
    const [ocrNote, setOcrNote] = useState<string | null>(null);
    // Editable drafts are the source of truth on the review screen.
    const [drafts, setDrafts] = useState<Record<string, string>>(() => nutritionToDrafts(product.nutrition || {}));
    const [nameDraft, setNameDraft] = useState(isUnknownProduct ? '' : product.name);
    const [brandDraft, setBrandDraft] = useState(product.brand || '');
    const [ingredientsDraft, setIngredientsDraft] = useState(product.ingredients || '');
    const [ingredientsFromOcr, setIngredientsFromOcr] = useState(false);
    const [categoryDraft, setCategoryDraft] = useState<string | undefined>(product.subCategory);

    const handleCapture = async () => {
        if (!cameraRef.current || stage !== 'camera') return;
        setStage('processing');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        try {
            setStatusMsg('Capturing image…');
            const photo = await cameraRef.current.takePhoto({
                flash: device?.hasFlash ? 'auto' : 'off',
            });
            // On Android the path is absolute; iOS may need 'file://' prefix
            const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
            setImageUri(uri);

            setStatusMsg('Reading label with OCR…');
            let ocrText: string | null = null;
            let ocrErr: string | null = null;
            try {
                const r = await runOCROnImage(uri);
                ocrText = r.text;
                ocrErr = r.error;
            } catch {
                ocrErr = 'OCR service unavailable.';
            }

            setStatusMsg('Extracting nutrition & ingredients…');
            const ocrExtracted = ocrText ? parseNutritionFromText(ocrText) : {};
            const ocrIngredients = ocrText ? extractIngredientsFromText(ocrText) : null;
            const merged = mergeNutrition(product.nutrition, ocrExtracted);

            setExtractedNutrition(ocrExtracted);
            setDrafts(nutritionToDrafts(merged));
            if (ocrIngredients && !product.ingredients) {
                setIngredientsDraft(ocrIngredients);
                setIngredientsFromOcr(true);
            }
            const foundAnything = Object.keys(ocrExtracted).length > 0 || !!ocrIngredients;
            // If OCR pulled nothing usable, tell the user why so it's not a silent fail.
            setOcrNote(!foundAnything ? (ocrErr || 'No values detected — type them in below.') : null);

            await updateProductInHistory(product.barcode, {
                ingredientsImageUri: uri,
                nutrition: merged,
            });

            setStage('review');
        } catch (err: any) {
            console.error('Capture error:', err);
            setStatusMsg(err?.message ?? 'Unknown error');
            setStage('error');
        }
    };

    const buildUpdatedProduct = (): Product => ({
        ...product,
        name: nameDraft.trim() || product.name || 'Unknown Product',
        brand: brandDraft.trim() || product.brand,
        subCategory: categoryDraft ?? product.subCategory,
        ingredients: ingredientsDraft.trim() || product.ingredients,
        ingredientsImageUri: imageUri ?? undefined,
        nutrition: draftsToNutrition(drafts),
    });

    const handleApply = async () => {
        const updated = buildUpdatedProduct();
        // Persist so the (often DB-less) product shows up in history/recents.
        await saveToHistory(updated);
        // Self-heal: an OCR'd product becomes permanent intelligence, so the next
        // scan of it is an instant hit and it can grow the shared catalog.
        await rememberProduct(updated, 'ocr');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        navigation.replace('Result', { product: updated });
    };

    const handleRetry = () => {
        setStage('camera');
        setStatusMsg('');
        setExtractedNutrition({});
        setOcrNote(null);
        setDrafts(nutritionToDrafts(product.nutrition || {}));
        setImageUri(null);
    };

    // ── PROCESSING ──────────────────────────────────────────────────────────
    if (stage === 'processing') {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: '#000' }]}>
                <StatusBar style="light" />
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.processingText}>{statusMsg}</Text>
                <Text style={styles.processingSubText}>Nutrition numbers + ingredients list</Text>
            </View>
        );
    }

    // ── ERROR ───────────────────────────────────────────────────────────────
    if (stage === 'error') {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: Colors.background }]}>
                <StatusBar style="dark" />
                <XCircle color={Colors.danger} size={48} />
                <Text style={styles.errorTitle}>Couldn't process label</Text>
                <Text style={styles.errorDesc}>{statusMsg}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <RefreshCw color="#fff" size={18} />
                    <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.retryButton, { backgroundColor: Colors.textMuted, marginTop: 12 }]}
                    onPress={() => setStage('review')}
                >
                    <CheckCircle color="#fff" size={18} />
                    <Text style={styles.retryButtonText}>Type Values Manually</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── REVIEW ──────────────────────────────────────────────────────────────
    if (stage === 'review') {
        const currentNutrition = draftsToNutrition(drafts);
        const newRating = calculateNutriScore(currentNutrition);
        const prevRating = calculateNutriScore(product.nutrition);
        const foundCount = Object.keys(extractedNutrition).length + (ingredientsFromOcr ? 1 : 0);

        return (
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <StatusBar style="dark" />
                <ScrollView
                    style={[styles.container, { backgroundColor: Colors.background }]}
                    contentContainerStyle={{ padding: Spacing.md, paddingTop: insets.top + 12, paddingBottom: 120 }}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.resultBanner}>
                        <Zap color={Colors.primary} size={22} />
                        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                            <Text style={styles.resultBannerTitle}>
                                {foundCount > 0
                                    ? `Found ${foundCount} thing${foundCount !== 1 ? 's' : ''} — review & edit`
                                    : 'Nothing detected — type the values in'}
                            </Text>
                            <Text style={[styles.resultBannerSub, ocrNote ? { color: Colors.warning } : null]}>
                                {ocrNote || 'Fix anything the camera misread. The grade updates live.'}
                            </Text>
                        </View>
                    </View>

                    {/* Product identity — crucial for unknown barcodes */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Product</Text>
                        <View style={styles.identityRow}>
                            <TextInput
                                style={[styles.identityInput, { flex: 1.2 }]}
                                value={nameDraft}
                                onChangeText={setNameDraft}
                                placeholder="Product name (e.g. Aloo Bhujia)"
                                placeholderTextColor={Colors.textMuted}
                            />
                        </View>
                        <View style={styles.identityRow}>
                            <TextInput
                                style={[styles.identityInput, { flex: 1 }]}
                                value={brandDraft}
                                onChangeText={setBrandDraft}
                                placeholder="Brand (e.g. Haldiram)"
                                placeholderTextColor={Colors.textMuted}
                            />
                        </View>
                        <Text style={styles.fieldHint}>Category — used to score it fairly against its own kind</Text>
                        <View style={styles.categoryWrap}>
                            {CATEGORY_OPTIONS.map(c => (
                                <TouchableOpacity
                                    key={c.key}
                                    style={[styles.categoryChip, categoryDraft === c.key && styles.categoryChipActive]}
                                    onPress={() => setCategoryDraft(categoryDraft === c.key ? undefined : c.key)}
                                >
                                    <Text style={[styles.categoryChipText, categoryDraft === c.key && styles.categoryChipTextActive]}>
                                        {c.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {newRating.hasData && (
                        <View style={styles.gradeCompare}>
                            <View style={styles.gradeBox}>
                                <Text style={styles.gradeBoxLabel}>BEFORE</Text>
                                <View style={[styles.gradeBadge, {
                                    backgroundColor: prevRating.hasData ? prevRating.color : Colors.textMuted
                                }]}>
                                    <Text style={styles.gradeBadgeText}>{prevRating.grade ?? '?'}</Text>
                                </View>
                            </View>
                            <Text style={styles.gradeArrow}>→</Text>
                            <View style={styles.gradeBox}>
                                <Text style={styles.gradeBoxLabel}>UPDATED</Text>
                                <View style={[styles.gradeBadge, { backgroundColor: newRating.color }]}>
                                    <Text style={styles.gradeBadgeText}>{newRating.grade}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Ingredients — powers additive/allergen/diet analysis */}
                    <View style={styles.card}>
                        <View style={styles.ingredientsHeader}>
                            <ListOrdered color={Colors.textSecondary} size={16} />
                            <Text style={[styles.cardTitle, { marginBottom: 0, flex: 1 }]}>Ingredients</Text>
                            {ingredientsFromOcr && (
                                <View style={styles.newBadge}><Text style={styles.newBadgeText}>OCR</Text></View>
                            )}
                        </View>
                        <Text style={styles.fieldHint}>
                            This unlocks additive, allergen and veg/vegan checks.
                        </Text>
                        <TextInput
                            style={styles.ingredientsInput}
                            value={ingredientsDraft}
                            onChangeText={t => { setIngredientsDraft(t); setIngredientsFromOcr(false); }}
                            placeholder="e.g. Wheat flour, sugar, palm oil, cocoa solids (4%), raising agents (INS 500)…"
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Nutrition per 100g</Text>
                        {NUTRITION_KEYS.map(key => {
                            const isNew = extractedNutrition[key] != null && product.nutrition[key] == null;
                            const empty = !drafts[key];
                            return (
                                <View key={key} style={[styles.tableRow, isNew && styles.tableRowHighlight]}>
                                    <View style={styles.rowLeft}>
                                        <Text style={styles.rowLabel}>{FIELD_LABELS[key]}</Text>
                                        {isNew && (
                                            <View style={styles.newBadge}>
                                                <Text style={styles.newBadgeText}>OCR</Text>
                                            </View>
                                        )}
                                    </View>
                                    <TextInput
                                        style={[styles.rowInput, empty && styles.rowInputMuted]}
                                        value={drafts[key] ?? ''}
                                        onChangeText={(text) =>
                                            setDrafts(prev => ({ ...prev, [key]: text.replace(/[^0-9.,]/g, '') }))
                                        }
                                        keyboardType="decimal-pad"
                                        placeholder="—"
                                        placeholderTextColor={Colors.textMuted}
                                        maxLength={8}
                                        returnKeyType="done"
                                    />
                                </View>
                            );
                        })}
                    </View>

                    <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
                        <CheckCircle color="#fff" size={20} />
                        <Text style={styles.applyButtonText}>Apply &amp; View Results</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.reshootButton} onPress={handleRetry}>
                        <RefreshCw color={Colors.primary} size={16} />
                        <Text style={styles.reshootButtonText}>Reshoot Label</Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    // ── PERMISSION ──────────────────────────────────────────────────────────
    if (!hasPermission) {
        return (
            <View style={styles.permContainer}>
                <StatusBar style="dark" />
                <Text style={styles.permTitle}>Camera Access Needed</Text>
                <Text style={styles.permDesc}>Grant camera access to photograph the ingredients label.</Text>
                <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
                    <Text style={styles.permButtonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={styles.permContainer}>
                <StatusBar style="dark" />
                <Text style={styles.permTitle}>No Camera Found</Text>
                <Text style={styles.permDesc}>Could not access a back-facing camera.</Text>
            </View>
        );
    }

    // ── CAMERA ──────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={stage === 'camera'}
                photo={true}
            />

            <View style={[styles.topOverlay, { paddingTop: insets.top + 16 }]}>
                <Text style={styles.instruction}>Point at the nutrition + ingredients panel</Text>
                <Text style={styles.instructionSub}>Fill the frame, keep the text sharp, use good light</Text>
            </View>

            <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
                <TouchableOpacity style={styles.captureButton} onPress={handleCapture} activeOpacity={0.8}>
                    <CameraIcon color="#fff" size={32} />
                </TouchableOpacity>
                <Text style={styles.captureLabel}>Capture &amp; Analyse</Text>
            </View>

            <TouchableOpacity
                style={[styles.cancelButton, { top: insets.top + 12 }]}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
                <XCircle color="#fff" size={28} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centered: { justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: Spacing.xl },
    permTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
    permDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
    permButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.full },
    permButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    processingText: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: Spacing.lg, textAlign: 'center' },
    processingSubText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.sm, textAlign: 'center' },
    errorTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.lg },
    errorDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xl },
    retryButton: { flexDirection: 'row', backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.full, alignItems: 'center', gap: Spacing.sm },
    retryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    resultBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '50', marginBottom: Spacing.md },
    resultBannerTitle: { fontSize: 15, fontWeight: '800', color: Colors.primaryDark },
    resultBannerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },

    card: { backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.md, ...Shadow.sm, marginBottom: Spacing.md },
    cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

    identityRow: { marginBottom: 10 },
    identityInput: {
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
        paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, fontWeight: '600',
        color: Colors.textPrimary, backgroundColor: Colors.background,
    },
    fieldHint: { fontSize: 12, color: Colors.textMuted, marginBottom: 8, lineHeight: 17 },
    categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full,
        borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
    },
    categoryChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
    categoryChipText: { fontSize: 12.5, fontWeight: '700', color: Colors.textSecondary },
    categoryChipTextActive: { color: Colors.primaryDark },

    ingredientsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
    ingredientsInput: {
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
        paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, lineHeight: 19,
        color: Colors.textPrimary, backgroundColor: Colors.background, minHeight: 88,
    },

    gradeCompare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm },
    gradeBox: { alignItems: 'center', flex: 1 },
    gradeBoxLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 1, marginBottom: Spacing.sm },
    gradeBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    gradeBadgeText: { fontSize: 26, fontWeight: '900', color: '#fff' },
    gradeArrow: { fontSize: 28, color: Colors.textMuted, marginHorizontal: Spacing.lg },

    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    tableRowHighlight: { backgroundColor: Colors.successBg, marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md },
    rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    rowLabel: { fontSize: 13, color: Colors.textSecondary },
    newBadge: { backgroundColor: Colors.gradeA, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    newBadgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },
    rowInput: {
        fontSize: 15, fontWeight: '700', color: Colors.textPrimary,
        textAlign: 'right', minWidth: 72, paddingVertical: 5, paddingHorizontal: 8,
        borderRadius: Radius.sm, backgroundColor: Colors.background,
        borderWidth: 1, borderColor: Colors.border,
    },
    rowInputMuted: { color: Colors.textMuted, fontWeight: '400' },
    applyButton: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 15, borderRadius: Radius.full, ...Shadow.md, marginBottom: Spacing.sm },
    applyButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    reshootButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    reshootButtonText: { color: Colors.primary, fontWeight: '700', fontSize: 15 },

    topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg, alignItems: 'center' },
    instruction: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
    instructionSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: 4 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingTop: Spacing.lg, alignItems: 'center' },
    captureButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)', ...Shadow.md },
    captureLabel: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: Spacing.sm },
    cancelButton: { position: 'absolute', right: Spacing.lg },
});
