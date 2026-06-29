// ─── Core Product Types ────────────────────────────────────────────────────────

export type NutritionData = {
    energy_100g?: number;
    sugars_100g?: number;
    added_sugars_100g?: number;
    fat_100g?: number;
    saturated_fat_100g?: number;
    trans_fat_100g?: number;
    salt_100g?: number;
    sodium_100g?: number;
    fiber_100g?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    cholesterol_mg_100g?: number;
    serving_size_g?: number;
};

export type Product = {
    barcode: string;
    name: string;
    brand?: string;
    quantity?: string;
    image_url?: string;
    nutrition: NutritionData;
    nutriscore_grade?: string;
    nova_group?: number;
    ingredients?: string;
    ingredientsImageUri?: string;
    scannedAt?: number; // timestamp
    category?: 'food' | 'beauty';
    subCategory?: string;
    allergens?: string;
};

// ─── User Profile ──────────────────────────────────────────────────────────────

export type DietType = 'veg' | 'non_veg' | 'eggitarian' | 'vegan' | 'jain' | 'satvik';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type HealthGoal =
    | 'weight_loss'
    | 'muscle_gain'
    | 'wellness'
    | 'blood_sugar'
    | 'pcos'
    | 'heart'
    | 'gut';
export type HealthCondition =
    | 'diabetes'
    | 'prediabetes'
    | 'hypertension'
    | 'high_cholesterol'
    | 'fatty_liver'
    | 'pcos'
    | 'thyroid';
export type AllergyType = 'gluten' | 'lactose' | 'nuts' | 'soy' | 'eggs' | 'additives' | 'fragrance';

export type UserPreferences = {
    minSugar: boolean;
    highProtein: boolean;
    lowSodium: boolean;
    noPalmOil: boolean;
    organicOnly: boolean;
    crueltyFree: boolean;
    vegOnly: boolean;
    sugarSmartMode: boolean;
    showBestRated: boolean;
};

export type UserProfile = {
    id: string;
    version: number;
    name: string;
    age: number;
    sex: 'M' | 'F' | 'other';
    heightCm: number;
    weightKg: number;
    city: string;
    language: 'en' | 'hi';
    activityLevel: ActivityLevel;
    smoker: boolean;
    alcohol: boolean;
    diet: DietType;
    goals: HealthGoal[];
    conditions: HealthCondition[];
    allergies: AllergyType[];
    preferences: UserPreferences;
    createdAt: number;
    updatedAt: number;
};

// Computed from UserProfile — the engine uses this for scoring/personalisation
export type HealthConstraints = {
    userId: string;
    version: number;
    dailyCalories: number;
    maxSugarsG: number;
    maxAddedSugarsG: number;
    maxSatFatG: number;
    maxSodiumMg: number;
    maxSaltG: number;
    minFiberG: number;
    minProteinG: number;
    maxCaloriesFromSnacks: number;
    conditionFlags: Record<HealthCondition, boolean>;
    goalFlags: Record<HealthGoal, boolean>;
};

// ─── Pantry ────────────────────────────────────────────────────────────────────

export type PantryItem = {
    id: string;
    productId: string; // barcode
    productName: string;
    productBrand?: string;
    productImage?: string;
    productCategory?: 'food' | 'beauty';
    personalizedScore: number;
    addedAt: number;
    quantity?: number;
    unit?: 'g' | 'ml' | 'units';
    purchasedFrom?: string;
};

// ─── Navigation ────────────────────────────────────────────────────────────────

export type RootStackParamList = {
    Onboarding: undefined;
    MainTabs: undefined;
    Home: undefined;
    Scan: undefined;
    Result: { product: Product };
    Compare: { product: Product };
    History: undefined;
    Settings: undefined;
    IngredientsSnap: { product: Product };
    Pantry: undefined;
    Profile: undefined;
};
