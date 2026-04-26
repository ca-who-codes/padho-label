/**
 * chatService.ts — Padho Label 2.0 (TIA 2.0)
 *
 * Supports two modes:
 *  - Product chat: analysing a specific scanned product
 *  - General chat: pantry, nutrition, ordering via connected AI assistants
 *
 * Anti-hallucination rules:
 *  - System prompt mandates ONLY using the product data provided
 *  - UserProfile + HealthConstraints injected to personalise responses
 *  - Connected assistant info injected so TIA knows what actions are possible
 */

import axios from 'axios';
import { Product, UserProfile, HealthConstraints } from '../types';
import { AIConnectionsMap } from './aiConnectionsService';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export type ChatMessage = {
    role: 'user' | 'model';
    text: string;
};

// ─── Product-specific system prompt ──────────────────────────────────────────

const buildProductSystemPrompt = (
    product: Product,
    profile?: UserProfile | null,
    constraints?: HealthConstraints | null,
): string => {
    const n = product.nutrition;
    const isGeneralQuery = product.barcode === 'general';

    const productContext = isGeneralQuery ? `
No specific product is being analysed. The user is asking general nutrition/health questions.
Answer general nutrition questions using your knowledge. Be helpful and accurate.
` : `
PRODUCT DATA (use ONLY this — do not invent any other facts):
Name: ${product.name}
Brand: ${product.brand || 'Unknown'}
Category: ${product.category || 'food'}
Barcode: ${product.barcode}
Energy: ${n.energy_100g ? Math.round(n.energy_100g / 4.184) + ' kcal/100g' : 'not available'}
Sugars: ${n.sugars_100g != null ? n.sugars_100g + 'g/100g' : 'not available'}
Added Sugars: ${n.added_sugars_100g != null ? n.added_sugars_100g + 'g/100g' : 'not available'}
Total Fat: ${n.fat_100g != null ? n.fat_100g + 'g/100g' : 'not available'}
Saturated Fat: ${n.saturated_fat_100g != null ? n.saturated_fat_100g + 'g/100g' : 'not available'}
Trans Fat: ${n.trans_fat_100g != null ? n.trans_fat_100g + 'g/100g' : 'not available'}
Sodium: ${n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) + 'mg/100g' : 'not available'}
Fiber: ${n.fiber_100g != null ? n.fiber_100g + 'g/100g' : 'not available'}
Protein: ${n.proteins_100g != null ? n.proteins_100g + 'g/100g' : 'not available'}
Carbohydrates: ${n.carbohydrates_100g != null ? n.carbohydrates_100g + 'g/100g' : 'not available'}
Ingredients: ${product.ingredients || 'not available'}
NOVA Group: ${product.nova_group || 'not available'}
`;
    return buildCommonSystemPrompt(productContext, profile, constraints);
};

// ─── General (no-product) system prompt ──────────────────────────────────────

const buildGeneralSystemPrompt = (
    profile?: UserProfile | null,
    constraints?: HealthConstraints | null,
    connections?: AIConnectionsMap | null,
    pantryContext?: string,
): string => {
    const connContext = connections ? `
CONNECTED SERVICES (these are enabled — you CAN help with these):
${connections.claude ? `- Claude AI: Enhanced intelligence enabled (API key connected)` : ''}
${connections.zomato ? `- Zomato: Phone ${connections.zomato.phoneNumber} connected. You CAN help order food from restaurants. When asked to order, provide step-by-step guidance and suggest what to search for on Zomato.` : '- Zomato: NOT connected. If the user asks to order food, tell them to connect Zomato in Profile → AI Assistants.'}
${connections.zepto ? `- Zepto: Phone ${connections.zepto.phoneNumber} connected. You CAN help order groceries. When asked to restock or buy groceries, guide through Zepto ordering.` : '- Zepto: NOT connected. If the user asks to order groceries, tell them to connect Zepto in Profile → AI Assistants.'}
` : `
CONNECTED SERVICES: None connected yet. If users ask to order food or groceries, tell them to go to Profile → AI Assistants to connect Zomato or Zepto first.
`;

    const pantrySection = pantryContext ? `
PANTRY STATE (current items in the user's kitchen):
${pantryContext}
` : '';

    const generalContext = `
You are TIA, the all-in-one AI assistant for Padho Label.

In general (non-product) mode, you help with:
1. PANTRY MANAGEMENT: Scanning items (ask user to describe or list them), updating stock, checking what's running low.
2. NUTRITION ADVICE: Answering general nutrition questions personalised to the user's profile and health conditions.
3. RECIPE SUGGESTIONS: Suggest recipes based on pantry items, health goals, and dietary preferences. Always respect diet type (veg/non-veg/vegan/jain/satvik).
4. ORDERING FOOD: Via Zomato (restaurant delivery) or Zepto (grocery delivery) — only if connected.
5. KITCHEN STOCK UPDATES: Help the user update their pantry — add, remove, or flag items.

${connContext}
${pantrySection}
`;
    return buildCommonSystemPrompt(generalContext, profile, constraints);
};

// ─── Shared system prompt wrapper ─────────────────────────────────────────────

const buildCommonSystemPrompt = (
    modeContext: string,
    profile?: UserProfile | null,
    constraints?: HealthConstraints | null,
): string => {
    const userContext = profile ? `
USER PROFILE:
Name: ${profile.name}
Age: ${profile.age}
Diet: ${profile.diet}
Goals: ${profile.goals.join(', ') || 'General wellness'}
Conditions: ${profile.conditions.join(', ') || 'None'}
Allergies: ${profile.allergies.join(', ') || 'None'}
City: ${profile.city}
Language preference: ${profile.language === 'hi' ? 'Hindi' : 'English'}
` : '';

    const constraintContext = constraints ? `
DAILY PERSONAL LIMITS:
- Max sugars: ${constraints.maxSugarsG}g/day
- Max sat fat: ${constraints.maxSatFatG}g/day
- Max sodium: ${constraints.maxSodiumMg}mg/day
- Min fiber: ${constraints.minFiberG}g/day
- Min protein: ${constraints.minProteinG}g/day
- Has diabetes: ${constraints.conditionFlags.diabetes || constraints.conditionFlags.prediabetes ? 'YES — very important' : 'No'}
- Has hypertension: ${constraints.conditionFlags.hypertension ? 'YES — watch sodium/sat fat' : 'No'}
` : '';

    const lang = profile?.language === 'hi' ? 'Hindi' : 'English';

    return `You are TIA (Trusted Ingredient Analyst & AI Assistant) for the Padho Label app.

STRICT RULES — follow without exception:
1. Only use facts explicitly provided. Never invent nutritional data, brand claims, or service capabilities.
2. Personalise every response using the USER PROFILE and DAILY PERSONAL LIMITS.
3. Respond in ${lang}. Keep responses concise (3–5 sentences) unless the user requests detail.
4. Never provide medical diagnoses. For medical decisions, recommend consulting a registered dietitian.
5. Be warm, human, and supportive — not clinical.
6. For ordering: guide the user step-by-step but ONLY if the service is listed as connected above.

${modeContext}
${userContext}
${constraintContext}`;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const sendMessageToAI = async (
    message: string,
    product: Product,
    history: ChatMessage[],
    profile?: UserProfile | null,
    constraints?: HealthConstraints | null,
): Promise<string> => {
    if (!GEMINI_API_KEY) {
        return "TIA here! 👋 Please add your EXPO_PUBLIC_GEMINI_API_KEY to enable me.";
    }

    const systemPrompt = buildProductSystemPrompt(product, profile, constraints);

    const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: `Hi ${profile?.name || 'there'}! I'm TIA, your Padho Label nutrition coach. I've analysed ${product.name}. What would you like to know?` }] },
        ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: message }] },
    ];

    try {
        const response = await axios.post(GEMINI_URL, { contents });
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('TIA AI Error:', error);
        return "I'm having trouble connecting right now. Please try again in a moment! 🙏";
    }
};

export const sendGeneralMessageToAI = async (
    message: string,
    history: ChatMessage[],
    profile?: UserProfile | null,
    constraints?: HealthConstraints | null,
    connections?: AIConnectionsMap | null,
    pantryContext?: string,
): Promise<string> => {
    if (!GEMINI_API_KEY) {
        return "TIA here! 👋 Please add your EXPO_PUBLIC_GEMINI_API_KEY to enable me.";
    }

    const systemPrompt = buildGeneralSystemPrompt(profile, constraints, connections, pantryContext);
    const greeting = profile?.name
        ? `Hi ${profile.name}! I'm TIA, your Padho Label AI assistant. I can help with nutrition, pantry management, recipes, and ordering.`
        : `Hi! I'm TIA, your Padho Label AI assistant. How can I help you today?`;

    const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: greeting }] },
        ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: message }] },
    ];

    try {
        const response = await axios.post(GEMINI_URL, { contents });
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('TIA General AI Error:', error);
        return "I'm having trouble connecting right now. Please try again! 🙏";
    }
};
