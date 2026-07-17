import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, Animated, Dimensions, Alert,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, UserProfile, DietType, HealthGoal, HealthCondition, AllergyType, ActivityLevel } from '../types';
import { saveUserProfile, markOnboardingDone, DEFAULT_PREFERENCES, getUserProfile } from '../services/userProfileService';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
const { width } = Dimensions.get('window');

const TOTAL_STEPS = 5;

// ─── Option Sets ──────────────────────────────────────────────────────────────
const DIET_OPTIONS: { label: string; value: DietType; emoji: string }[] = [
    { label: 'Vegetarian', value: 'veg', emoji: '🥗' },
    { label: 'Non-Vegetarian', value: 'non_veg', emoji: '🍗' },
    { label: 'Eggitarian', value: 'eggitarian', emoji: '🥚' },
    { label: 'Vegan', value: 'vegan', emoji: '🌱' },
    { label: 'Jain', value: 'jain', emoji: '🙏' },
    { label: 'Satvik', value: 'satvik', emoji: '✨' },
];

const ACTIVITY_OPTIONS: { label: string; value: ActivityLevel; desc: string }[] = [
    { label: 'Sedentary', value: 'sedentary', desc: 'Desk job, little movement' },
    { label: 'Lightly Active', value: 'light', desc: 'Light exercise 1–3 days/week' },
    { label: 'Moderately Active', value: 'moderate', desc: 'Moderate exercise 3–5 days/week' },
    { label: 'Active', value: 'active', desc: 'Hard exercise 6–7 days/week' },
    { label: 'Very Active', value: 'very_active', desc: 'Physical job + training' },
];

const GOAL_OPTIONS: { label: string; value: HealthGoal; emoji: string }[] = [
    { label: 'Weight Loss', value: 'weight_loss', emoji: '⚖️' },
    { label: 'Muscle Gain', value: 'muscle_gain', emoji: '💪' },
    { label: 'General Wellness', value: 'wellness', emoji: '🌿' },
    { label: 'Blood Sugar Control', value: 'blood_sugar', emoji: '🩸' },
    { label: 'PCOS Management', value: 'pcos', emoji: '🌸' },
    { label: 'Heart Health', value: 'heart', emoji: '❤️' },
    { label: 'Gut Health', value: 'gut', emoji: '🧬' },
];

const CONDITION_OPTIONS: { label: string; value: HealthCondition; emoji: string }[] = [
    { label: 'Diabetes / Pre-diabetes', value: 'diabetes', emoji: '💊' },
    { label: 'Hypertension', value: 'hypertension', emoji: '🫀' },
    { label: 'High Cholesterol', value: 'high_cholesterol', emoji: '🔬' },
    { label: 'Fatty Liver', value: 'fatty_liver', emoji: '🫁' },
    { label: 'PCOS', value: 'pcos', emoji: '🌸' },
    { label: 'Thyroid', value: 'thyroid', emoji: '⚕️' },
];

const ALLERGY_OPTIONS: { label: string; value: AllergyType; emoji: string }[] = [
    { label: 'Gluten', value: 'gluten', emoji: '🌾' },
    { label: 'Lactose / Dairy', value: 'lactose', emoji: '🥛' },
    { label: 'Tree Nuts', value: 'nuts', emoji: '🥜' },
    { label: 'Soy', value: 'soy', emoji: '🫘' },
    { label: 'Eggs', value: 'eggs', emoji: '🥚' },
    { label: 'Fragrance / DPG', value: 'fragrance', emoji: '🌸' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
    const [step, setStep] = useState(0);
    const slideAnim = useRef(new Animated.Value(0)).current;
    // Identity of an existing profile, preserved across edits.
    const existing = useRef<{ id: string; version: number; createdAt: number } | null>(null);

    // Step 1 — About you
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [sex, setSex] = useState<'M' | 'F' | 'other'>('M');
    const [heightCm, setHeightCm] = useState('');
    const [weightKg, setWeightKg] = useState('');
    const [city, setCity] = useState('');

    // Step 2 — Diet & Lifestyle
    const [diet, setDiet] = useState<DietType>('veg');
    const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
    const [smoker, setSmoker] = useState(false);
    const [alcohol, setAlcohol] = useState(false);

    // Step 3 — Goals & Conditions
    const [goals, setGoals] = useState<HealthGoal[]>(['wellness']);
    const [conditions, setConditions] = useState<HealthCondition[]>([]);

    // Step 4 — Allergies & Preferences
    const [allergies, setAllergies] = useState<AllergyType[]>([]);

    // Pre-fill from an existing profile so "Edit" is non-destructive.
    useEffect(() => {
        getUserProfile().then(p => {
            if (!p) return;
            existing.current = { id: p.id, version: p.version, createdAt: p.createdAt };
            setName(p.name === 'Friend' ? '' : p.name);
            setAge(p.age ? String(p.age) : '');
            setSex(p.sex);
            setHeightCm(p.heightCm ? String(p.heightCm) : '');
            setWeightKg(p.weightKg ? String(p.weightKg) : '');
            setCity(p.city === 'India' ? '' : p.city);
            setDiet(p.diet);
            setActivityLevel(p.activityLevel);
            setSmoker(p.smoker);
            setAlcohol(p.alcohol);
            setGoals(p.goals.length ? p.goals : ['wellness']);
            setConditions(p.conditions);
            setAllergies(p.allergies);
        });
    }, []);

    const animateTo = (next: number) => {
        Animated.timing(slideAnim, { toValue: -next * width, duration: 300, useNativeDriver: true }).start();
        setStep(next);
    };

    const goNext = () => {
        if (step === 1 && !name.trim()) { Alert.alert('Please enter your name'); return; }
        if (step < TOTAL_STEPS - 1) animateTo(step + 1);
    };

    const goBack = () => { if (step > 0) animateTo(step - 1); };

    const toggleMulti = <T,>(val: T, arr: T[], setArr: (a: T[]) => void) => {
        setArr(arr.includes(val) ? arr.filter(i => i !== val) : [...arr, val]);
    };

    const handleFinish = async () => {
        const profile: UserProfile = {
            id: existing.current?.id || `user_${Date.now()}`,
            version: existing.current?.version ?? 0,
            name: name.trim() || 'Friend',
            age: parseInt(age) || 25,
            sex,
            heightCm: parseFloat(heightCm) || 165,
            weightKg: parseFloat(weightKg) || 65,
            city: city.trim() || 'India',
            language: 'en',
            activityLevel,
            smoker,
            alcohol,
            diet,
            goals,
            conditions,
            allergies,
            preferences: { ...DEFAULT_PREFERENCES },
            createdAt: existing.current?.createdAt || Date.now(),
            updatedAt: Date.now(),
        };
        await saveUserProfile(profile);
        await markOnboardingDone();
        navigation.replace('MainTabs');
    };

    // ─── Step Renderers ────────────────────────────────────────────────────

    const renderStep0 = () => (
        <View style={styles.stepContainer}>
            <View style={styles.heroIcon}>
                <Text style={{ fontSize: 64 }}>🥗</Text>
            </View>
            <Text style={styles.heroTitle}>Know What's In Your Food</Text>
            <Text style={styles.heroSubtitle}>
                Scan any product and get the truth in 5 seconds.
                {'\n'}Personalised for your body & goals.
            </Text>
            <View style={styles.featureList}>
                {['Instant nutrition analysis', 'Additives & safety check', 'Personalized health verdict', 'Better alternatives'].map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                        <View style={styles.checkCircle}><Check color="#fff" size={12} /></View>
                        <Text style={styles.featureText}>{f}</Text>
                    </View>
                ))}
            </View>
        </View>
    );

    const renderStep1 = () => (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>About You</Text>
            <Text style={styles.stepSubtitle}>So we can personalise your health scores</Text>
            <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} placeholderTextColor={Colors.textMuted} />
            <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Age" value={age} onChangeText={setAge} keyboardType="numeric" placeholderTextColor={Colors.textMuted} />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="City" value={city} onChangeText={setCity} placeholderTextColor={Colors.textMuted} />
            </View>
            <View style={styles.row}>
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholderTextColor={Colors.textMuted} />
                <TextInput style={[styles.input, styles.halfInput]} placeholder="Weight (kg)" value={weightKg} onChangeText={setWeightKg} keyboardType="numeric" placeholderTextColor={Colors.textMuted} />
            </View>
            <Text style={styles.fieldLabel}>Biological Sex (for calorie calculation)</Text>
            <View style={styles.chipRow}>
                {(['M', 'F', 'other'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.chip, sex === s && styles.chipActive]} onPress={() => setSex(s)}>
                        <Text style={[styles.chipText, sex === s && styles.chipTextActive]}>{s === 'M' ? '♂ Male' : s === 'F' ? '♀ Female' : '⚧ Other'}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            </View>
        </ScrollView>
    );

    const renderStep2 = () => (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Diet & Lifestyle</Text>
                <Text style={styles.fieldLabel}>Diet type</Text>
                <View style={styles.chipGrid}>
                    {DIET_OPTIONS.map(o => (
                        <TouchableOpacity key={o.value} style={[styles.chip, diet === o.value && styles.chipActive]} onPress={() => setDiet(o.value)}>
                            <Text style={{ fontSize: 18 }}>{o.emoji}</Text>
                            <Text style={[styles.chipText, diet === o.value && styles.chipTextActive]}>{o.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={styles.fieldLabel}>Activity level</Text>
                {ACTIVITY_OPTIONS.map(o => (
                    <TouchableOpacity key={o.value} style={[styles.listOption, activityLevel === o.value && styles.listOptionActive]} onPress={() => setActivityLevel(o.value)}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.listOptionTitle, activityLevel === o.value && { color: Colors.primary }]}>{o.label}</Text>
                            <Text style={styles.listOptionDesc}>{o.desc}</Text>
                        </View>
                        {activityLevel === o.value && <Check color={Colors.primary} size={18} />}
                    </TouchableOpacity>
                ))}
                <View style={styles.toggleRow}>
                    <Text style={styles.listOptionTitle}>Smoker?</Text>
                    <View style={styles.yesNoRow}>
                        <TouchableOpacity style={[styles.yesNoBtn, smoker && styles.yesNoBtnActive]} onPress={() => setSmoker(true)}><Text style={[styles.yesNoText, smoker && styles.yesNoTextActive]}>Yes</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.yesNoBtn, !smoker && styles.yesNoBtnActive]} onPress={() => setSmoker(false)}><Text style={[styles.yesNoText, !smoker && styles.yesNoTextActive]}>No</Text></TouchableOpacity>
                    </View>
                </View>
                <View style={styles.toggleRow}>
                    <Text style={styles.listOptionTitle}>Alcohol?</Text>
                    <View style={styles.yesNoRow}>
                        <TouchableOpacity style={[styles.yesNoBtn, alcohol && styles.yesNoBtnActive]} onPress={() => setAlcohol(true)}><Text style={[styles.yesNoText, alcohol && styles.yesNoTextActive]}>Yes</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.yesNoBtn, !alcohol && styles.yesNoBtnActive]} onPress={() => setAlcohol(false)}><Text style={[styles.yesNoText, !alcohol && styles.yesNoTextActive]}>No</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
        </ScrollView>
    );

    const renderStep3 = () => (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Health Goals</Text>
                <Text style={styles.stepSubtitle}>Select all that apply — we'll adjust scores accordingly</Text>
                <View style={styles.chipGrid}>
                    {GOAL_OPTIONS.map(o => (
                        <TouchableOpacity key={o.value} style={[styles.chip, goals.includes(o.value) && styles.chipActive]} onPress={() => toggleMulti(o.value, goals, setGoals)}>
                            <Text style={{ fontSize: 18 }}>{o.emoji}</Text>
                            <Text style={[styles.chipText, goals.includes(o.value) && styles.chipTextActive]}>{o.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Medical Conditions (optional)</Text>
                <View style={styles.chipGrid}>
                    {CONDITION_OPTIONS.map(o => (
                        <TouchableOpacity key={o.value} style={[styles.chip, conditions.includes(o.value) && { ...styles.chipActive, backgroundColor: Colors.danger + '20', borderColor: Colors.danger }]} onPress={() => toggleMulti(o.value, conditions, setConditions)}>
                            <Text style={{ fontSize: 16 }}>{o.emoji}</Text>
                            <Text style={[styles.chipText, conditions.includes(o.value) && { color: Colors.danger }]}>{o.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );

    const renderStep4 = () => (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Allergies & Preferences</Text>
                <Text style={styles.stepSubtitle}>We'll flag these on every scan</Text>
                <View style={styles.chipGrid}>
                    {ALLERGY_OPTIONS.map(o => (
                        <TouchableOpacity key={o.value} style={[styles.chip, allergies.includes(o.value) && { ...styles.chipActive, backgroundColor: '#FFF3E0', borderColor: Colors.warning }]} onPress={() => toggleMulti(o.value, allergies, setAllergies)}>
                            <Text style={{ fontSize: 18 }}>{o.emoji}</Text>
                            <Text style={[styles.chipText, allergies.includes(o.value) && { color: Colors.warning }]}>{o.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.doneCard}>
                    <Text style={styles.doneEmoji}>🎉</Text>
                    <Text style={styles.doneTitle}>You're all set!</Text>
                    <Text style={styles.doneDesc}>Padho Label will now give you a personalised health score for every product you scan.</Text>
                </View>
            </View>
        </ScrollView>
    );

    const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

    return (
        <KeyboardAvoidingView
            style={styles.wrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Progress bar */}
            <View style={[styles.progressBar, { paddingTop: insets.top + 16 }]}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                    <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive, i < step && styles.progressDotDone]} />
                ))}
            </View>

            {/* Sliding content */}
            <Animated.View style={[styles.slideTrack, { transform: [{ translateX: slideAnim }] }]}>
                {stepContent.map((render, i) => (
                    <View key={i} style={{ width, flex: 1 }}>
                        {render()}
                    </View>
                ))}
            </Animated.View>

            {/* Navigation buttons */}
            <View style={styles.navRow}>
                {step > 0 ? (
                    <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                        <ChevronLeft color={Colors.textSecondary} size={22} />
                        <Text style={styles.backText}>Back</Text>
                    </TouchableOpacity>
                ) : <View style={{ flex: 1 }} />}

                {step === TOTAL_STEPS - 1 ? (
                    <TouchableOpacity style={styles.nextBtn} onPress={handleFinish}>
                        <Text style={styles.nextText}>Start Scanning 🥗</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                        <Text style={styles.nextText}>{step === 0 ? "Let's go" : 'Continue'}</Text>
                        <ChevronRight color="#fff" size={20} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Skip (first step only) */}
            {step === 0 && (
                <TouchableOpacity style={styles.skipBtn} onPress={handleFinish}>
                    <Text style={styles.skipText}>Skip for now</Text>
                </TouchableOpacity>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: '#fff' },
    progressBar: {
        flexDirection: 'row', gap: 6, alignSelf: 'center',
        paddingBottom: Spacing.md,
    },
    progressDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border,
    },
    progressDotActive: { backgroundColor: Colors.primary, width: 20 },
    progressDotDone: { backgroundColor: Colors.primary + '60' },

    slideTrack: { flexDirection: 'row', width: TOTAL_STEPS * width, flex: 1 },
    stepContainer: { width, paddingHorizontal: Spacing.lg, paddingBottom: 20 },

    heroIcon: { alignItems: 'center', marginTop: 20, marginBottom: 20 },
    heroTitle: { fontSize: 28, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center', lineHeight: 34 },
    heroSubtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 22 },
    featureList: { marginTop: 32, gap: 14 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
    featureText: { fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },

    stepTitle: { fontSize: 26, fontWeight: '900', color: Colors.textPrimary, marginTop: 8, marginBottom: 6 },
    stepSubtitle: { fontSize: 14, color: Colors.textMuted, marginBottom: Spacing.md },

    input: {
        borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: 12,
        fontSize: 15, color: Colors.textPrimary, marginBottom: 12,
        backgroundColor: Colors.background,
    },
    halfInput: { flex: 1 },
    row: { flexDirection: 'row', gap: 10 },

    fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
        paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.background,
    },
    chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
    chipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: Colors.primary },

    listOption: {
        flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
        borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, marginBottom: 8,
    },
    listOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
    listOptionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
    listOptionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    yesNoRow: { flexDirection: 'row', gap: 8 },
    yesNoBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border },
    yesNoBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
    yesNoText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
    yesNoTextActive: { color: '#fff' },

    doneCard: {
        alignItems: 'center', backgroundColor: Colors.primaryLight,
        borderRadius: Radius.xl, padding: Spacing.xl, marginTop: Spacing.lg,
    },
    doneEmoji: { fontSize: 48, marginBottom: 12 },
    doneTitle: { fontSize: 22, fontWeight: '900', color: Colors.primary },
    doneDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },

    navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingBottom: 40, paddingTop: 12 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    backText: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
    nextBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: Colors.primary, borderRadius: Radius.full,
        paddingHorizontal: 24, paddingVertical: 14, ...Shadow.md,
    },
    nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    skipBtn: { alignSelf: 'center', marginBottom: 16 },
    skipText: { color: Colors.textMuted, fontSize: 14 },
});
