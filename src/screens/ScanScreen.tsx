/**
 * ScanScreen — barcode scanner, rebuilt for v5.
 *
 * Fixes over v4:
 *  - The code-scanner callback fires ~30×/s; gating it with React STATE let
 *    several lookups race before the first re-render (double navigations,
 *    duplicate history writes). A synchronous ref (`busyRef`) now guards it.
 *  - The camera preview stays LIVE behind error banners instead of freezing.
 *  - Torch toggle for dim kirana-store shelves.
 *  - Haptic feedback the instant a barcode is recognised.
 *  - A short cooldown per failed barcode so dismissing an error doesn't
 *    instantly re-trigger the same failure.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Text, View, StyleSheet, TouchableOpacity,
    ActivityIndicator, Animated, TextInput, Keyboard,
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCameraPermission,
    useCodeScanner,
} from 'react-native-vision-camera';
import * as Haptics from 'expo-haptics';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList, Product } from '../types';
import { resolveByBarcode } from '../services/intelligence';
import { saveToHistory } from '../services/history';
import { XCircle, RefreshCw, Hash, Camera as SnapIcon, Zap, ZapOff } from 'lucide-react-native';
import { Colors, Spacing, Radius } from '../theme';

type Props = BottomTabScreenProps<RootStackParamList, 'Scan'>;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = [0, 1000, 2500];
const FAILED_CODE_COOLDOWN_MS = 4000;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

type ErrType = 'timeout' | 'notfound' | 'generic';

export default function ScanScreen({ navigation }: Props) {
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('back');
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<ErrType | null>(null);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [manualBarcode, setManualBarcode] = useState('');
    const [torch, setTorch] = useState(false);

    // Synchronous guards — state is too slow for a 30fps native callback.
    const busyRef = useRef(false);
    const pausedRef = useRef(false);          // true while an error/manual sheet is up
    const lastBarcode = useRef<string | null>(null);
    const failedAt = useRef<Map<string, number>>(new Map());
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
                Animated.timing(scanLineAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    // Re-arm the scanner whenever the tab regains focus.
    useEffect(() => {
        if (isFocused) {
            busyRef.current = false;
            pausedRef.current = false;
            setLoading(false);
            setErrorMsg(null);
            setErrorType(null);
            setShowManualEntry(false);
            setTorch(false);
            lastBarcode.current = null;
        }
    }, [isFocused]);

    const fetchWithRetry = async (barcode: string) => {
        let lastError: Error | null = null;
        for (let i = 0; i < MAX_RETRIES; i++) {
            if (i > 0) {
                setAttempt(i + 1);
                await sleep(RETRY_DELAY_MS[i] ?? 2500);
            }
            try {
                const product = await resolveByBarcode(barcode);
                return { product, error: null };
            } catch (err: any) {
                lastError = err;
                const msg = (err?.message ?? '').toLowerCase();
                if (!msg.includes('timeout') && !msg.includes('network') && !msg.includes('econnreset')) break;
            }
        }
        return { product: null, error: lastError };
    };

    const finishLookup = useCallback(async (
        barcode: string,
        product: Product | null,
        error: Error | null,
    ) => {
        if (product) {
            await saveToHistory(product);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            // Stay paused; refocus re-arms the scanner.
            navigation.navigate('Result', { product });
        } else {
            failedAt.current.set(barcode, Date.now());
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            if (error) {
                const isTimeout = (error.message ?? '').toLowerCase().includes('timeout');
                setErrorType(isTimeout ? 'timeout' : 'generic');
                setErrorMsg(
                    isTimeout
                        ? 'Connection timed out. Check your internet and tap Retry.'
                        : "Couldn't fetch product details. Snap the label, or retry."
                );
            } else {
                setErrorType('notfound');
                setErrorMsg('Not in any database yet. Snap the label — the app will remember it forever.');
            }
        }
        setLoading(false);
        setAttempt(0);
    }, [navigation]);

    const startLookup = useCallback(async (barcode: string) => {
        lastBarcode.current = barcode;
        pausedRef.current = true;
        setLoading(true);
        setErrorMsg(null);
        setErrorType(null);
        setAttempt(1);
        const { product, error } = await fetchWithRetry(barcode);
        await finishLookup(barcode, product, error);
    }, [finishLookup]);

    // Vision Camera V4 code scanner hook — runs on the native thread, fast
    const codeScanner = useCodeScanner({
        codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e'],
        onCodeScanned: (codes) => {
            // Synchronous gate — never rely on React state here.
            if (busyRef.current || pausedRef.current) return;
            const barcode = codes[0]?.value;
            if (!barcode) return;
            // Don't hammer a barcode that just failed.
            const failed = failedAt.current.get(barcode);
            if (failed && Date.now() - failed < FAILED_CODE_COOLDOWN_MS) return;

            busyRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            startLookup(barcode).finally(() => { busyRef.current = false; });
        },
    });

    const resumeScanning = () => {
        setErrorMsg(null);
        setErrorType(null);
        pausedRef.current = false;
    };

    const handleRetry = () => {
        const code = lastBarcode.current;
        if (!code) { resumeScanning(); return; }
        failedAt.current.delete(code);
        setErrorMsg(null);
        setErrorType(null);
        setLoading(true);
        setAttempt(1);
        fetchWithRetry(code).then(({ product, error }) => finishLookup(code, product, error));
    };

    const handleManualLookup = async () => {
        const code = manualBarcode.trim();
        if (!code) return;
        Keyboard.dismiss();
        setShowManualEntry(false);
        setManualBarcode('');
        failedAt.current.delete(code);
        await startLookup(code);
    };

    const openSnapFallback = () => {
        const skeleton: Product = {
            barcode: lastBarcode.current || `manual_${Date.now()}`,
            name: 'Unknown Product',
            nutrition: {},
            scannedAt: Date.now(),
            category: 'food',
        };
        resumeScanning();
        pausedRef.current = true; // stay paused while snapping
        navigation.navigate('IngredientsSnap', { product: skeleton });
    };

    // ── Permission gate ──────────────────────────────────────────────────────
    if (!hasPermission) {
        return (
            <View style={styles.permissionContainer}>
                <StatusBar style="dark" />
                <Text style={{ fontSize: 56 }}>📷</Text>
                <Text style={styles.permissionTitle}>Camera Access Needed</Text>
                <Text style={styles.permissionDesc}>
                    Padho Label needs your camera to scan product barcodes and labels.
                </Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={styles.permissionContainer}>
                <StatusBar style="dark" />
                <Text style={styles.permissionTitle}>No Camera Found</Text>
                <Text style={styles.permissionDesc}>Could not access a back-facing camera.</Text>
            </View>
        );
    }

    const scanLineTranslateY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 196],
    });

    return (
        <View style={styles.container}>
            {isFocused && <StatusBar style="light" />}

            {/* ── Vision Camera — preview stays live even during errors ── */}
            <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={isFocused}
                torch={device.hasTorch && torch ? 'on' : 'off'}
                codeScanner={codeScanner}
            />

            {/* ── Dark overlay with scan window ── */}
            <View style={styles.overlay} pointerEvents="none">
                <View style={styles.overlayTop} />
                <View style={styles.overlayMiddle}>
                    <View style={styles.overlaySide} />
                    <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.cornerTL]} />
                        <View style={[styles.corner, styles.cornerTR]} />
                        <View style={[styles.corner, styles.cornerBL]} />
                        <View style={[styles.corner, styles.cornerBR]} />
                        {!loading && (
                            <Animated.View
                                style={[styles.scanLine, { transform: [{ translateY: scanLineTranslateY }] }]}
                            />
                        )}
                        {loading && (
                            <View style={styles.loadingFrame}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                {attempt > 1 && (
                                    <Text style={styles.retryLabel}>Retry {attempt}/{MAX_RETRIES}</Text>
                                )}
                            </View>
                        )}
                    </View>
                    <View style={styles.overlaySide} />
                </View>
                <View style={styles.overlayBottom}>
                    <Text style={styles.hint}>
                        {loading
                            ? attempt > 1 ? `Retrying… (${attempt}/${MAX_RETRIES})` : 'Fetching product…'
                            : 'Align the barcode within the frame'}
                    </Text>
                </View>
            </View>

            {/* ── Top bar: title + torch ── */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                <Text style={styles.topBarTitle}>Scan a product</Text>
                {device.hasTorch && (
                    <TouchableOpacity
                        style={[styles.torchBtn, torch && styles.torchBtnOn]}
                        onPress={() => setTorch(t => !t)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        {torch ? <Zap color="#101828" size={18} fill="#101828" /> : <ZapOff color="#fff" size={18} />}
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Error Banner ── */}
            {errorMsg && (
                <View style={[
                    styles.errorBanner,
                    { paddingBottom: Math.max(insets.bottom, 12) + 8 },
                    errorType === 'notfound' && styles.errorBannerWarn,
                ]}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                    <View style={styles.errorActions}>
                        {/* Snap is the primary fallback for ANY barcode failure —
                            most Indian SKUs aren't in the barcode databases. */}
                        <TouchableOpacity onPress={openSnapFallback} style={styles.retryBtn}>
                            <SnapIcon color="#fff" size={16} />
                            <Text style={styles.retryBtnText}>Snap the label</Text>
                        </TouchableOpacity>
                        {errorType !== 'notfound' && (
                            <TouchableOpacity onPress={handleRetry} style={[styles.retryBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                                <RefreshCw color="#fff" size={16} />
                                <Text style={styles.retryBtnText}>Retry</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={resumeScanning} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <XCircle color="#fff" size={22} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ── Manual Entry Button ── */}
            {!loading && !showManualEntry && !errorMsg && (
                <TouchableOpacity
                    style={[styles.manualEntryBtn, { bottom: Math.max(insets.bottom, 16) + 84 }]}
                    onPress={() => { setShowManualEntry(true); pausedRef.current = true; }}
                >
                    <Hash color="#fff" size={16} />
                    <Text style={styles.manualEntryBtnText}>Enter barcode manually</Text>
                </TouchableOpacity>
            )}

            {/* ── Manual Entry Input ── */}
            {showManualEntry && (
                <View style={styles.manualEntryOverlay}>
                    <View style={styles.manualEntryCard}>
                        <Text style={styles.manualEntryTitle}>Enter Barcode</Text>
                        <TextInput
                            style={styles.manualEntryInput}
                            placeholder="e.g. 8901058000109"
                            placeholderTextColor={Colors.textMuted}
                            value={manualBarcode}
                            onChangeText={setManualBarcode}
                            keyboardType="number-pad"
                            autoFocus
                            maxLength={20}
                            returnKeyType="search"
                            onSubmitEditing={handleManualLookup}
                        />
                        <View style={styles.manualEntryActions}>
                            <TouchableOpacity
                                style={[styles.manualEntryActionBtn, { backgroundColor: Colors.pillBackground }]}
                                onPress={() => { setShowManualEntry(false); setManualBarcode(''); pausedRef.current = false; }}
                            >
                                <Text style={[styles.manualEntryActionText, { color: Colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.manualEntryActionBtn, { backgroundColor: Colors.primary }]}
                                onPress={handleManualLookup}
                            >
                                <Text style={styles.manualEntryActionText}>Search</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const FRAME_SIZE = 240;
const CORNER_SIZE = 26;
const CORNER_THICKNESS = 3.5;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: Spacing.xl, gap: 8 },
    permissionTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
    permissionDesc: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg, lineHeight: 22 },
    permissionButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: Radius.full },
    permissionButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
    overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    overlayMiddle: { flexDirection: 'row', height: FRAME_SIZE },
    overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    scanFrame: { width: FRAME_SIZE, height: FRAME_SIZE, overflow: 'hidden', position: 'relative' },
    corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: Colors.primary },
    cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderTopLeftRadius: 8 },
    cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderTopRightRadius: 8 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderBottomRightRadius: 8 },
    scanLine: {
        position: 'absolute', top: 20, left: 14, right: 14, height: 2.5,
        backgroundColor: Colors.primary, borderRadius: 2, opacity: 0.95,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
    },
    loadingFrame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    retryLabel: { color: Colors.primary, fontSize: 12, fontWeight: '700', marginTop: 8 },
    overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 36 },
    hint: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.35)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.full, overflow: 'hidden' },

    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.md, paddingBottom: 10,
    },
    topBarTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
    torchBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    },
    torchBtnOn: { backgroundColor: '#fff' },

    errorBanner: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.danger,
        paddingHorizontal: Spacing.md, paddingTop: Spacing.md, gap: 10,
    },
    errorBannerWarn: { backgroundColor: '#B54708' },
    errorText: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    errorActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.28)' },
    retryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

    manualEntryBtn: {
        position: 'absolute', alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    },
    manualEntryBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    manualEntryOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: Colors.overlay,
        justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
    },
    manualEntryCard: {
        backgroundColor: '#fff', borderRadius: Radius.xl, padding: Spacing.lg,
        width: '100%', maxWidth: 340,
    },
    manualEntryTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md, textAlign: 'center' },
    manualEntryInput: {
        backgroundColor: Colors.background, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: 14,
        fontSize: 18, fontWeight: '700', color: Colors.textPrimary,
        textAlign: 'center', letterSpacing: 2,
        borderWidth: 1, borderColor: Colors.border,
    },
    manualEntryActions: { flexDirection: 'row', gap: 10, marginTop: Spacing.lg },
    manualEntryActionBtn: { flex: 1, paddingVertical: 13, borderRadius: Radius.full, alignItems: 'center' },
    manualEntryActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
