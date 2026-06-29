import React, { useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
    ScrollView, TextInput,
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCameraPermission,
} from 'react-native-vision-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, NutritionData } from '../types';
import { updateProductInHistory, saveToHistory } from '../services/history';
import { runOCROnImage, parseNutritionFromText, mergeNutrition } from '../services/ocrNutrition';
import { rememberProduct } from '../services/intelligence';
import { calculateNutriScore } from '../services/ratingEngine';
import { Camera as CameraIcon, CheckCircle, XCircle, RefreshCw, Zap } from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'IngredientsSnap'>;
type Stage = 'camera' | 'processing' | 'review' | 'error';

const FIELD_LABELS: Record<keyof NutritionData, string> = {
    energy_100g: 'Energy (kJ)',
    carbohydrates_100g: 'Carbohydrates (g)',
    sugars_100g: 'Sugar (g)',
    added_sugars_100g: 'Added Sugar (g)',
    fat_100g: 'Fat (g)',
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

    const [stage, setStage] = useState<Stage>('camera');
    const [statusMsg, setStatusMsg] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [extractedNutrition, setExtractedNutrition] = useState<Partial<NutritionData>>({});
    // Editable string drafts are the source of truth on the review screen.
    const [drafts, setDrafts] = useState<Record<string, string>>(() => nutritionToDrafts(product.nutrition || {}));

    const handleCapture = async () => {
        if (!cameraRef.current || stage !== 'camera') return;
        setStage('processing');

        try {
            setStatusMsg('Capturing image…');
            // react-native-vision-camera V4 — takePhoto returns { path }
            const photo = await cameraRef.current.takePhoto();
            // On Android the path is absolute; iOS may need 'file://' prefix
            const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
            setImageUri(uri);

            setStatusMsg('Reading label with OCR…');
            let ocrText: string | null = null;
            try {
                ocrText = await runOCROnImage(uri);
            } catch {
                /* OCR API unavailable — fall through to local parse */
            }

            setStatusMsg('Extracting nutrition values…');
            const ocrExtracted = ocrText ? parseNutritionFromText(ocrText) : {};
            const merged = mergeNutrition(product.nutrition, ocrExtracted);

            setExtractedNutrition(ocrExtracted);
            setDrafts(nutritionToDrafts(merged));

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

    const handleApply = async () => {
        const updated = {
            ...product,
            ingredientsImageUri: imageUri ?? undefined,
            nutrition: draftsToNutrition(drafts),
        };
        // Persist so the (often DB-less) product shows up in history/recents.
        await saveToHistory(updated);
        // Self-heal: an OCR'd product becomes permanent intelligence, so the next
        // scan of it is an instant hit and it can grow the shared catalog.
        await rememberProduct(updated, 'ocr');
        navigation.navigate('Result', { product: updated });
    };

    const handleRetry = () => {
        setStage('camera');
        setStatusMsg('');
        setExtractedNutrition({});
        setDrafts(nutritionToDrafts(product.nutrition || {}));
        setImageUri(null);
    };

    // ── PROCESSING ──────────────────────────────────────────────────────────
    if (stage === 'processing') {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: '#000' }]}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.processingText}>{statusMsg}</Text>
                <Text style={styles.processingSubText}>Scanning for nutritional values…</Text>
            </View>
        );
    }

    // ── ERROR ───────────────────────────────────────────────────────────────
    if (stage === 'error') {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: Colors.background }]}>
                <XCircle color={Colors.danger} size={48} />
                <Text style={styles.errorTitle}>Couldn't process label</Text>
                <Text style={styles.errorDesc}>{statusMsg}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <RefreshCw color="#fff" size={18} />
                    <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.retryButton, { backgroundColor: Colors.textMuted, marginTop: 12 }]}
                    onPress={handleApply}
                >
                    <CheckCircle color="#fff" size={18} />
                    <Text style={styles.retryButtonText}>Save Image Anyway</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── REVIEW ──────────────────────────────────────────────────────────────
    if (stage === 'review') {
        const currentNutrition = draftsToNutrition(drafts);
        const newRating = calculateNutriScore(currentNutrition);
        const prevRating = calculateNutriScore(product.nutrition);
        const foundCount = Object.keys(extractedNutrition).length;

        return (
            <ScrollView
                style={[styles.container, { backgroundColor: Colors.background }]}
                contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
            >
                <View style={styles.resultBanner}>
                    <Zap color={Colors.primary} size={22} />
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <Text style={styles.resultBannerTitle}>
                            {foundCount > 0
                                ? `Found ${foundCount} value${foundCount !== 1 ? 's' : ''} — review & edit`
                                : 'Nothing detected — type the values in'}
                        </Text>
                        <Text style={styles.resultBannerSub}>
                            Tap any field to add or correct a value. The grade updates live.
                        </Text>
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

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Review &amp; Edit Values</Text>
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
        );
    }

    // ── PERMISSION ──────────────────────────────────────────────────────────
    if (!hasPermission) {
        return (
            <View style={styles.permContainer}>
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
                <Text style={styles.permTitle}>No Camera Found</Text>
                <Text style={styles.permDesc}>Could not access a back-facing camera.</Text>
            </View>
        );
    }

    // ── CAMERA ──────────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <Camera
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                photo={true}        // enable photo mode
            />

            <View style={styles.topOverlay}>
                <Text style={styles.instruction}>Point at the nutrition / ingredients label</Text>
                <Text style={styles.instructionSub}>Make sure all text is clearly visible and in focus</Text>
            </View>

            <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.captureButton} onPress={handleCapture} activeOpacity={0.8}>
                    <CameraIcon color="#fff" size={32} />
                </TouchableOpacity>
                <Text style={styles.captureLabel}>Capture & Analyse</Text>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                <XCircle color="#fff" size={26} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centered: { justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
    permContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: Spacing.xl },
    permTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
    permDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
    permButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.full },
    permButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    processingText: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: Spacing.lg, textAlign: 'center' },
    processingSubText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.sm, textAlign: 'center' },
    errorTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.lg },
    errorDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xl },
    retryButton: { flexDirection: 'row', backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.full, alignItems: 'center', gap: Spacing.sm },
    retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    resultBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary, marginBottom: Spacing.md },
    resultBannerTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
    resultBannerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
    gradeCompare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm },
    gradeBox: { alignItems: 'center', flex: 1 },
    gradeBoxLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: Spacing.sm },
    gradeBadge: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    gradeBadgeText: { fontSize: 26, fontWeight: '900', color: '#fff' },
    gradeArrow: { fontSize: 28, color: Colors.textMuted, marginHorizontal: Spacing.lg },
    card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadow.sm, marginBottom: Spacing.md },
    cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    tableRowHighlight: { backgroundColor: '#f0fdf4', marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md, borderRadius: Radius.sm },
    rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    rowLabel: { fontSize: 13, color: Colors.textSecondary },
    newBadge: { backgroundColor: Colors.gradeA, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    newBadgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },
    rowInput: {
        fontSize: 15, fontWeight: '700', color: Colors.textPrimary,
        textAlign: 'right', minWidth: 72, paddingVertical: 4, paddingHorizontal: 8,
        borderRadius: Radius.sm, backgroundColor: Colors.background,
        borderWidth: 1, borderColor: Colors.border,
    },
    rowInputMuted: { color: Colors.textMuted, fontWeight: '400' },
    applyButton: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.full, ...Shadow.md, marginBottom: Spacing.sm },
    applyButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    reshootButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
    reshootButtonText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
    topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingTop: Spacing.xl + 30, paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg, alignItems: 'center' },
    instruction: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    instructionSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: 4 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingBottom: Spacing.xxl, paddingTop: Spacing.lg, alignItems: 'center' },
    captureButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)', ...Shadow.md },
    captureLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: Spacing.sm },
    cancelButton: { position: 'absolute', top: Spacing.xl + 30, right: Spacing.lg },
});
