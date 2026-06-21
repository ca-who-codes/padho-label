/**
 * userProfileService.ts
 *
 * Manages UserProfile and HealthConstraints via AsyncStorage.
 * Profiles are versioned — every save increments the version counter.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    UserProfile,
    HealthConstraints,
    UserPreferences,
    HealthCondition,
    HealthGoal,
    ActivityLevel,
} from '../types';

const PROFILE_KEY = '@padho_user_profile';
const CONSTRAINTS_KEY = '@padho_health_constraints';
const ONBOARDING_DONE_KEY = '@padho_onboarding_done';

// ─── Default preferences ──────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: UserPreferences = {
    minSugar: false,
    highProtein: false,
    lowSodium: false,
    noPalmOil: false,
    organicOnly: false,
    crueltyFree: false,
    vegOnly: false,
    sugarSmartMode: false,
    showBestRated: false,
};

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
    try {
        const toSave: UserProfile = {
            ...profile,
            version: (profile.version || 0) + 1,
            updatedAt: Date.now(),
        };
        await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(toSave));
        // Re-compute and save constraints whenever profile is saved
        const constraints = computeHealthConstraints(toSave);
        await AsyncStorage.setItem(CONSTRAINTS_KEY, JSON.stringify(constraints));
    } catch (error) {
        console.error('Error saving user profile:', error);
    }
};

export const getUserProfile = async (): Promise<UserProfile | null> => {
    try {
        const json = await AsyncStorage.getItem(PROFILE_KEY);
        return json ? JSON.parse(json) : null;
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
};

export const getHealthConstraints = async (): Promise<HealthConstraints | null> => {
    try {
        const json = await AsyncStorage.getItem(CONSTRAINTS_KEY);
        return json ? JSON.parse(json) : null;
    } catch (error) {
        console.error('Error getting health constraints:', error);
        return null;
    }
};

export const isOnboardingDone = async (): Promise<boolean> => {
    try {
        const val = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
        return val === 'true';
    } catch {
        return false;
    }
};

export const markOnboardingDone = async (): Promise<void> => {
    await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true');
};

// ─── Health Constraints Computation ──────────────────────────────────────────

/**
 * Computes daily nutrient constraints from a UserProfile.
 * Uses Mifflin-St Jeor BMR × activity factor.
 * Condition overrides tighten specific limits.
 */
export const computeHealthConstraints = (profile: UserProfile): HealthConstraints => {
    // Clamp inputs to sane ranges so a stray/empty value never yields NaN limits.
    const clamp = (v: number, min: number, max: number, fallback: number) =>
        Number.isFinite(v) && v > 0 ? Math.min(Math.max(v, min), max) : fallback;
    const weightKg = clamp(profile.weightKg, 25, 250, 65);
    const heightCm = clamp(profile.heightCm, 100, 230, 165);
    const age = clamp(profile.age, 5, 100, 25);

    // BMR (Mifflin-St Jeor)
    let bmr: number;
    if (profile.sex === 'M') {
        bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
        bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }

    const activityFactors: Record<ActivityLevel, number> = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9,
    };
    const dailyCalories = Math.round(bmr * activityFactors[profile.activityLevel]);

    // Default limits
    let maxSugarsG = 50;
    let maxAddedSugarsG = 25;
    let maxSatFatG = 20;
    let maxSodiumMg = 2400;
    let minFiberG = 30;
    let minProteinG = Math.round(weightKg * 0.8); // 0.8g per kg

    // Condition overrides
    const hasDiabetes = profile.conditions.includes('diabetes') || profile.conditions.includes('prediabetes');
    const hasHypertension = profile.conditions.includes('hypertension');
    const hasHighChol = profile.conditions.includes('high_cholesterol');

    if (hasDiabetes) {
        maxSugarsG = 25;
        maxAddedSugarsG = 12;
        maxSatFatG = 16;
        minFiberG = 35;
    }
    if (hasHypertension) {
        maxSodiumMg = 1500;
        maxSatFatG = Math.min(maxSatFatG, 14);
    }
    if (hasHighChol) {
        maxSatFatG = Math.min(maxSatFatG, 14);
    }

    // Goal overrides
    if (profile.goals.includes('muscle_gain')) {
        minProteinG = Math.round(weightKg * 1.6);
    }
    if (profile.goals.includes('weight_loss')) {
        maxAddedSugarsG = Math.min(maxAddedSugarsG, 20);
    }

    const conditionFlags = {} as Record<HealthCondition, boolean>;
    const allConditions: HealthCondition[] = [
        'diabetes', 'prediabetes', 'hypertension', 'high_cholesterol',
        'fatty_liver', 'pcos', 'thyroid',
    ];
    allConditions.forEach(c => { conditionFlags[c] = profile.conditions.includes(c); });

    const goalFlags = {} as Record<HealthGoal, boolean>;
    const allGoals: HealthGoal[] = [
        'weight_loss', 'muscle_gain', 'wellness', 'blood_sugar', 'pcos', 'heart', 'gut',
    ];
    allGoals.forEach(g => { goalFlags[g] = profile.goals.includes(g); });

    return {
        userId: profile.id,
        version: profile.version,
        dailyCalories,
        maxSugarsG,
        maxAddedSugarsG,
        maxSatFatG,
        maxSodiumMg,
        maxSaltG: maxSodiumMg / 400,
        minFiberG,
        minProteinG,
        maxCaloriesFromSnacks: Math.round(dailyCalories * 0.2),
        conditionFlags,
        goalFlags,
    };
};
