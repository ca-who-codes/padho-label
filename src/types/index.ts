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

export type IngredientFlag =
    | 'added_sugar'
    | 'refined_oil'
    | 'palm_oil'
    | 'allergen'
    | 'whole_grain'
    | 'artificial_color'
    | 'preservative'
    | 'refined_flour';

export type ParsedIngredient = {
    name: string;
    rank: number; // position in ingredient list (1-indexed)
    flags: IngredientFlag[];
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
    ingredientsParsed?: ParsedIngredient[];
    ingredientsImageUri?: string;
    scannedAt?: number; // timestamp
    category?: 'food' | 'beauty';
    subCategory?: string;
    allergens?: string;
    isVeg?: boolean;
    baseScore?: number; // 0–100
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

// ─── Scan & History ────────────────────────────────────────────────────────────

export type ScanAction = 'dismissed' | 'saved' | 'compared' | 'added_to_pantry' | 'shared';

export type ScanEvent = {
    id: string;
    productId: string; // barcode
    timestamp: number;
    locationCity?: string;
    storeName?: string;
    verdict: 'great' | 'okay' | 'avoid';
    personalizedScore: number; // 0–100
    action?: ScanAction;
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

// ─── Points & Badges ──────────────────────────────────────────────────────────

export type PointReason = 'scan' | 'contribution' | 'streak' | 'challenge' | 'review' | 'referral' | 'first_scan';

export type PointEvent = {
    id: string;
    delta: number;
    reason: PointReason;
    refId?: string; // scan barcode or challenge id
    timestamp: number;
};

export type BadgeId =
    | 'label_ninja'
    | 'sugar_smart'
    | 'pantry_champion'
    | 'explorer'
    | 'clean_beauty_pioneer'
    | 'hydration_hero'
    | 'first_scan';

export type Badge = {
    id: BadgeId;
    name: string;
    description: string;
    emoji: string;
    earnedAt?: number;
};

// ─── AI Assistants ────────────────────────────────────────────────────────────

export type AIAssistantId = 'claude' | 'zomato' | 'zepto';

export type AIAssistantMeta = {
    id: AIAssistantId;
    name: string;
    tagline: string;
    description: string;
    color: string;
    features: string[];
};

// ─── Navigation ────────────────────────────────────────────────────────────────

export type RootStackParamList = {
    Auth: undefined;
    Onboarding: undefined;
    MainTabs: undefined;
    Home: undefined;
    Scan: undefined;
    Result: { product: Product };
    History: undefined;
    Settings: undefined;
    IngredientsSnap: { product: Product };
    Chat: { product?: Product };
    Leaderboard: { category?: 'food' | 'beauty'; subCategory?: string } | undefined;
    Pantry: undefined;
    Challenges: undefined;
    Profile: undefined;
    AIAssistants: undefined;
};
