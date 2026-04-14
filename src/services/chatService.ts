/**
 * chatService.ts — Padho Label 2.0 (TIA 2.0)
 *
 * Anti-hallucination rules:
 *  - System prompt mandates ONLY using the product data provided
 *  - UserProfile + HealthConstraints injected to personalise responses
 *  - Responds in user's preferred language
 */

import axios from 'axios';
import { Product, UserProfile, HealthConstraints } from '../types';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export type ChatMessage = {
    role: 'user' | 'model';
    text: string;
};

const buildSystemPrompt = (
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

    const userContext = profile ? `
USER PROFILE:
Name: ${profile.name}
Age: ${profile.age}
Diet: ${profile.diet}
Goals: ${profile.goals.join(', ') || 'General wellness'}
Conditions: ${profile.conditions.join(', ') || 'None'}
Allergies: ${profile.allergies.join(', ') || 'None'}
Language preference: ${profile.language === 'hi' ? 'Hindi' : 'English'}
` : '';

    const constraintContext = constraints ? `
DAILY PERSONAL LIMITS (from their health profile):
- Max sugars: ${constraints.maxSugarsG}g/day
- Max sat fat: ${constraints.maxSatFatG}g/day
- Max sodium: ${constraints.maxSodiumMg}mg/day
- Min fiber: ${constraints.minFiberG}g/day
- Min protein: ${constraints.minProteinG}g/day
- Has diabetes: ${constraints.conditionFlags.diabetes || constraints.conditionFlags.prediabetes ? 'YES — very important' : 'No'}
- Has hypertension: ${constraints.conditionFlags.hypertension ? 'YES — watch sodium/sat fat' : 'No'}
` : '';

    const lang = profile?.language === 'hi' ? 'Hindi' : 'English';

    return `You are TIA (Trusted Ingredient Analyst), an expert nutrition and ingredient coach for the Padho Label app.

STRICT RULES — follow these without exception:
1. ONLY use facts from the PRODUCT DATA section above. Do not invent nutritional information, studies, or brand claims not present in the data.
2. If a nutrient value is "not available", say so clearly. Do not estimate.
3. Always personalise your advice based on the USER PROFILE and DAILY PERSONAL LIMITS provided.
4. Respond in ${lang}. Keep responses concise (3–5 sentences max unless the user asks for more detail).
5. Never provide medical diagnoses. Always recommend consulting a registered dietitian for personalised medical advice.
6. Do not recommend specific brands or products you do not have data on.
7. Be warm, human, and supportive — not clinical.

${productContext}
${userContext}
${constraintContext}`;
};

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

    const systemPrompt = buildSystemPrompt(product, profile, constraints);

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
