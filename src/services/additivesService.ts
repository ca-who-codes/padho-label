/**
 * additivesService.ts — Padho Label 2.0
 *
 * Scans ingredients text for known food additives (E/INS numbers and names).
 * 80+ entries covering FSSAI-notified additives.
 */

export type ConcernLevel = 'minimal' | 'moderate' | 'high';

export type Additive = {
    id: string;       // INS/E-number
    name: string;
    function: string;
    level: ConcernLevel;
    description: string;
    fssaiNote?: string;
};

const ADDITIVES_DB: Additive[] = [
    // ─── Leavening Agents ───────────────────────────────────────────────────
    { id: 'E500', name: 'Sodium Carbonates', function: 'Leavening', level: 'minimal', description: 'Common baking soda. Generally safe at typical food levels.', fssaiNote: 'Permitted' },
    { id: 'E503', name: 'Ammonium Carbonates', function: 'Leavening', level: 'minimal', description: 'Used in crackers and cookies to help rise.', fssaiNote: 'Permitted' },
    { id: 'E450', name: 'Diphosphates', function: 'Leavening', level: 'minimal', description: 'Phosphate-based leavening; high phosphate intake may affect kidneys.', fssaiNote: 'Permitted with limits' },
    { id: 'E451', name: 'Triphosphates', function: 'Leavening', level: 'minimal', description: 'Same family as diphosphates. Generally safe in normal use.', fssaiNote: 'Permitted with limits' },
    { id: 'E341', name: 'Calcium Phosphates', function: 'Leavening', level: 'minimal', description: 'Also an anti-caking agent. Generally safe.', fssaiNote: 'Permitted' },

    // ─── Acids & Acidity Regulators ──────────────────────────────────────────
    { id: 'E330', name: 'Citric Acid', function: 'Acidity regulator', level: 'minimal', description: 'Natural preservative found in citrus. Very safe.', fssaiNote: 'Permitted' },
    { id: 'E334', name: 'Tartaric Acid', function: 'Acidity regulator', level: 'minimal', description: 'Found naturally in grapes. Safe in normal amounts.', fssaiNote: 'Permitted' },
    { id: 'E296', name: 'Malic Acid', function: 'Acidity regulator', level: 'minimal', description: 'Found in apples. Considered safe.', fssaiNote: 'Permitted' },
    { id: 'E270', name: 'Lactic Acid', function: 'Acidity regulator', level: 'minimal', description: 'Produced by fermentation. Safe and widely used.', fssaiNote: 'Permitted' },
    { id: 'E338', name: 'Phosphoric Acid', function: 'Acidity regulator', level: 'moderate', description: 'Used in cola drinks. High intake may affect bone density.', fssaiNote: 'Permitted with limits' },

    // ─── Emulsifiers ─────────────────────────────────────────────────────────
    { id: 'E322', name: 'Lecithins', function: 'Emulsifier', level: 'minimal', description: 'Natural emulsifier from soy or sunflower. Very safe.', fssaiNote: 'Permitted' },
    { id: 'E471', name: 'Mono- & Diglycerides', function: 'Emulsifier', level: 'minimal', description: 'Derived from fats. Some concern about trans fat content.', fssaiNote: 'Permitted' },
    { id: 'E472e', name: 'DATEM', function: 'Emulsifier', level: 'moderate', description: 'Diacetyl tartaric acid esters. Some studies link heavy use to heart issues.', fssaiNote: 'Permitted with limits' },
    { id: 'E435', name: 'Polyoxyethylene Sorbitan Monostearate', function: 'Emulsifier', level: 'moderate', description: 'Polysorbate 60. Generally safe; some studies suggest gut microbiome effects.', fssaiNote: 'Permitted with limits' },
    { id: 'E476', name: 'Polyglycerol Polyricinoleate', function: 'Emulsifier', level: 'minimal', description: 'Used in chocolate. Considered safe by EFSA.', fssaiNote: 'Permitted' },
    { id: 'E481', name: 'Sodium Stearoyl Lactylate', function: 'Emulsifier', level: 'minimal', description: 'Made from lactic acid + stearic acid. Generally safe.', fssaiNote: 'Permitted' },

    // ─── Thickeners & Stabilisers ────────────────────────────────────────────
    { id: 'E440', name: 'Pectins', function: 'Thickener', level: 'minimal', description: 'Natural thickener from fruits. Excellent prebiotic fiber.', fssaiNote: 'Permitted' },
    { id: 'E415', name: 'Xanthan Gum', function: 'Thickener', level: 'minimal', description: 'Fermentation-derived thickener. Very safe.', fssaiNote: 'Permitted' },
    { id: 'E412', name: 'Guar Gum', function: 'Thickener', level: 'minimal', description: 'Seed-derived gum. Safe; can help lower cholesterol.', fssaiNote: 'Permitted' },
    { id: 'E407', name: 'Carrageenan', function: 'Thickener', level: 'moderate', description: 'Seaweed-derived. Some animal studies link it to gut inflammation.', fssaiNote: 'Permitted with limits — avoid in infant food' },
    { id: 'E401', name: 'Sodium Alginate', function: 'Thickener', level: 'minimal', description: 'From seaweed. Generally safe.', fssaiNote: 'Permitted' },
    { id: 'E466', name: 'Carboxymethyl Cellulose', function: 'Thickener', level: 'moderate', description: 'Synthetic cellulose derivative. May disrupt gut microbiome at high doses.', fssaiNote: 'Permitted with limits' },
    { id: 'E414', name: 'Acacia Gum', function: 'Thickener', level: 'minimal', description: 'Natural gum from acacia tree. Excellent prebiotic.', fssaiNote: 'Permitted' },

    // ─── Preservatives ───────────────────────────────────────────────────────
    { id: 'E211', name: 'Sodium Benzoate', function: 'Preservative', level: 'moderate', description: 'Can react with Vitamin C to form benzene. Linked to hyperactivity in children when combined with artificial colors.', fssaiNote: 'Permitted with limits' },
    { id: 'E210', name: 'Benzoic Acid', function: 'Preservative', level: 'moderate', description: 'Same family as sodium benzoate. Moderate concern.', fssaiNote: 'Permitted with limits' },
    { id: 'E202', name: 'Potassium Sorbate', function: 'Preservative', level: 'minimal', description: 'Common mold inhibitor. Safe at normal food levels.', fssaiNote: 'Permitted' },
    { id: 'E200', name: 'Sorbic Acid', function: 'Preservative', level: 'minimal', description: 'Naturally occurring antifungal. Generally safe.', fssaiNote: 'Permitted' },
    { id: 'E282', name: 'Calcium Propionate', function: 'Preservative', level: 'minimal', description: 'Used in bread. Generally safe; some migraine sensitivity reports.', fssaiNote: 'Permitted' },
    { id: 'E250', name: 'Sodium Nitrite', function: 'Preservative', level: 'high', description: 'Used in processed meats. Linked to increased risk of colorectal cancer at high intake.', fssaiNote: 'Permitted in meat products with strict limits' },
    { id: 'E249', name: 'Potassium Nitrite', function: 'Preservative', level: 'high', description: 'Same risks as sodium nitrite. Used in cured meats.', fssaiNote: 'Permitted with strict limits' },
    { id: 'E220', name: 'Sulphur Dioxide', function: 'Preservative', level: 'moderate', description: 'Used in dried fruits, wines. Can trigger asthma in sensitive individuals.', fssaiNote: 'Permitted with limits — must be declared' },
    { id: 'E224', name: 'Potassium Metabisulphite', function: 'Preservative', level: 'moderate', description: 'Same sulfite family. Asthma trigger for sensitive people.', fssaiNote: 'Permitted with limits' },

    // ─── Antioxidants ─────────────────────────────────────────────────────────
    { id: 'E300', name: 'Ascorbic Acid (Vitamin C)', function: 'Antioxidant', level: 'minimal', description: 'Vitamin C. Safe and nutritionally beneficial.', fssaiNote: 'Permitted' },
    { id: 'E306', name: 'Tocopherol (Vitamin E)', function: 'Antioxidant', level: 'minimal', description: 'Natural vitamin E. Safe.', fssaiNote: 'Permitted' },
    { id: 'E320', name: 'BHA', function: 'Antioxidant', level: 'high', description: 'Butylated hydroxyanisole. Possible carcinogen — listed as possibly carcinogenic by IARC.', fssaiNote: 'Permitted with limits; under review' },
    { id: 'E321', name: 'BHT', function: 'Antioxidant', level: 'moderate', description: 'Butylated hydroxytoluene. Synthetic antioxidant; some animal study concerns.', fssaiNote: 'Permitted with limits' },
    { id: 'E319', name: 'TBHQ', function: 'Antioxidant', level: 'moderate', description: 'Tert-butylhydroquinone. High doses linked to DNA damage in animal studies.', fssaiNote: 'Permitted with limits' },

    // ─── Colours ────────────────────────────────────────────────────────────
    { id: 'E102', name: 'Tartrazine', function: 'Colour', level: 'high', description: 'Artificial yellow dye (FD&C Yellow 5). Strongly linked to hyperactivity in children; requires warning in EU.', fssaiNote: 'Permitted — warning label required' },
    { id: 'E110', name: 'Sunset Yellow', function: 'Colour', level: 'high', description: 'Artificial orange-yellow dye. Linked to hyperactivity in children.', fssaiNote: 'Permitted — warning label required' },
    { id: 'E129', name: 'Allura Red', function: 'Colour', level: 'high', description: 'Artificial red dye (FD&C Red 40). Hyperactivity concerns in children.', fssaiNote: 'Permitted — warning label required' },
    { id: 'E122', name: 'Carmoisine', function: 'Colour', level: 'high', description: 'Artificial red dye. Hyperactivity concerns; banned in some countries.', fssaiNote: 'Permitted — warning label required' },
    { id: 'E124', name: 'Ponceau 4R', function: 'Colour', level: 'high', description: 'Artificial red colour. Hyperactivity concerns.', fssaiNote: 'Permitted — warning label required' },
    { id: 'E104', name: 'Quinoline Yellow', function: 'Colour', level: 'moderate', description: 'Synthetic dye. Hyperactivity concerns; banned in US.', fssaiNote: 'Permitted with limits' },
    { id: 'E150c', name: 'Ammonia Caramel', function: 'Colour', level: 'moderate', description: 'Caramel colour made with ammonia. Some concern over 4-MEI byproduct.', fssaiNote: 'Permitted with limits' },
    { id: 'E150d', name: 'Sulphite Ammonia Caramel', function: 'Colour', level: 'moderate', description: 'Caramel colour in cola drinks. 4-MEI is a suspect carcinogen.', fssaiNote: 'Permitted with limits' },
    { id: 'E171', name: 'Titanium Dioxide', function: 'Colour', level: 'moderate', description: 'White pigment. Banned in EU (2022) due to DNA damage concerns.', fssaiNote: 'Currently permitted in India — under review' },
    { id: 'E100', name: 'Curcumin', function: 'Colour', level: 'minimal', description: 'Turmeric-derived. Natural, generally safe and anti-inflammatory.', fssaiNote: 'Permitted' },
    { id: 'E120', name: 'Cochineal (Carmine)', function: 'Colour', level: 'moderate', description: 'Made from insects. Can trigger severe allergic reactions.', fssaiNote: 'Permitted — must be declared' },

    // ─── Sweeteners ──────────────────────────────────────────────────────────
    { id: 'E951', name: 'Aspartame', function: 'Sweetener', level: 'moderate', description: 'Artificial sweetener (~200× sweeter than sugar). Some controversy; IARC classifies as "possibly carcinogenic". People with PKU must avoid.', fssaiNote: 'Permitted with limits' },
    { id: 'E950', name: 'Acesulfame Potassium', function: 'Sweetener', level: 'moderate', description: 'Artificial sweetener (Ace-K). Heat-stable. Some animal studies show mixed results.', fssaiNote: 'Permitted with limits' },
    { id: 'E955', name: 'Sucralose', function: 'Sweetener', level: 'moderate', description: 'Chlorinated sugar derivative. Recent studies suggest it may affect gut microbiome and glucose tolerance.', fssaiNote: 'Permitted' },
    { id: 'E954', name: 'Saccharin', function: 'Sweetener', level: 'moderate', description: 'Oldest artificial sweetener. Animal studies showed bladder cancer risk; considered safe for humans at food levels.', fssaiNote: 'Permitted with limits' },
    { id: 'E960', name: 'Steviol Glycosides (Stevia)', function: 'Sweetener', level: 'minimal', description: 'Plant-derived sweetener. Generally safe; may lower blood pressure slightly.', fssaiNote: 'Permitted' },
    { id: 'E968', name: 'Erythritol', function: 'Sweetener', level: 'minimal', description: 'Sugar alcohol. Well tolerated; very low glycaemic index.', fssaiNote: 'Permitted' },
    { id: 'E965', name: 'Maltitol', function: 'Sweetener', level: 'minimal', description: 'Sugar alcohol. Can cause digestive discomfort in large amounts.', fssaiNote: 'Permitted' },

    // ─── Flavour Enhancers ───────────────────────────────────────────────────
    { id: 'E621', name: 'Monosodium Glutamate', function: 'Flavour enhancer', level: 'moderate', description: 'MSG. Generally safe; some people report sensitivity (MSG symptom complex).', fssaiNote: 'Permitted with limits' },
    { id: 'E627', name: 'Disodium Guanylate', function: 'Flavour enhancer', level: 'moderate', description: 'Synergistic with MSG. People with gout should limit intake.', fssaiNote: 'Permitted' },
    { id: 'E631', name: 'Disodium Inosinate', function: 'Flavour enhancer', level: 'moderate', description: 'Derived from meat or fish. Gout concern at high doses.', fssaiNote: 'Permitted' },

    // ─── Anti-caking Agents ──────────────────────────────────────────────────
    { id: 'E551', name: 'Silicon Dioxide', function: 'Anti-caking', level: 'minimal', description: 'Fine powder to prevent clumping. Safe at food levels.', fssaiNote: 'Permitted' },
    { id: 'E553b', name: 'Talc', function: 'Anti-caking', level: 'moderate', description: 'Magnesium silicate. Some concerns about asbestos contamination in industrial talc.', fssaiNote: 'Permitted for food use' },
    { id: 'E554', name: 'Sodium Aluminosilicate', function: 'Anti-caking', level: 'minimal', description: 'Anti-caking agent. Generally safe.', fssaiNote: 'Permitted' },

    // ─── Glazing & Coating ───────────────────────────────────────────────────
    { id: 'E901', name: 'Beeswax', function: 'Glazing', level: 'minimal', description: 'Natural wax. Safe. Not vegan.', fssaiNote: 'Permitted — not vegan' },
    { id: 'E904', name: 'Shellac', function: 'Glazing', level: 'minimal', description: 'Resin from lac beetle. Used on confectionery. Not vegan.', fssaiNote: 'Permitted' },
    { id: 'E903', name: 'Carnauba Wax', function: 'Glazing', level: 'minimal', description: 'Plant-based wax. Vegan. Safe.', fssaiNote: 'Permitted' },

    // ─── Humectants ──────────────────────────────────────────────────────────
    { id: 'E420', name: 'Sorbitol', function: 'Humectant', level: 'minimal', description: 'Sugar alcohol used as sweetener and humectant. Can cause bloating.', fssaiNote: 'Permitted' },
    { id: 'E422', name: 'Glycerol (Glycerine)', function: 'Humectant', level: 'minimal', description: 'Keeps products moist. Generally safe.', fssaiNote: 'Permitted' },
    { id: 'E1520', name: 'Propylene Glycol', function: 'Humectant', level: 'moderate', description: 'Synthetic liquid used as humectant and solvent. Safe at food levels.', fssaiNote: 'Permitted with limits' },

    // ─── Flour Treatment ─────────────────────────────────────────────────────
    { id: 'E925', name: 'Chlorine', function: 'Flour treatment', level: 'moderate', description: 'Used to bleach flour. Can form unwanted byproducts.', fssaiNote: 'Under review in India' },
    { id: 'E924', name: 'Potassium Bromate', function: 'Flour treatment', level: 'high', description: 'Used to improve flour. IARC classifies as possibly carcinogenic — BANNED in India since 1995.', fssaiNote: '🚫 BANNED by FSSAI' },
    { id: 'E927a', name: 'Azodicarbonamide', function: 'Flour treatment', level: 'high', description: 'Dough conditioner. Banned as food additive in EU & Australia. Hydrolyses to possible carcinogen semicarbazide.', fssaiNote: 'Permitted in India — banned in EU' },

    // ─── Miscellaneous ───────────────────────────────────────────────────────
    { id: 'E1422', name: 'Acetylated Distarch Adipate', function: 'Modified starch', level: 'minimal', description: 'Modified starch for texture. Generally safe.', fssaiNote: 'Permitted' },
    { id: 'E1442', name: 'Hydroxypropyl Distarch Phosphate', function: 'Modified starch', level: 'minimal', description: 'Modified starch. Generally recognised as safe.', fssaiNote: 'Permitted' },
    { id: 'E306', name: 'Mixed Tocopherols', function: 'Antioxidant', level: 'minimal', description: 'Vitamin E complex. Beneficial antioxidant.', fssaiNote: 'Permitted' },
];

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Scans an ingredients string and returns matched additives.
 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const findAdditives = (ingredientsText: string): Additive[] => {
    if (!ingredientsText) return [];
    const text = ingredientsText.toLowerCase();
    const found: Additive[] = [];
    const seen = new Set<string>();

    for (const additive of ADDITIVES_DB) {
        if (seen.has(additive.id)) continue;

        // E/INS number, e.g. "E472e" → matches "e472e", "ins 472e", "e-472e".
        // Requires an e/ins prefix so we never match a bare number.
        const numPart = escapeRegExp(additive.id.replace(/^e/i, '').toLowerCase());
        const idRegex = new RegExp(`\\b(?:e|ins)\\s?-?${numPart}\\b`, 'i');

        // Full additive name (parenthetical aliases stripped), matched as a
        // whole phrase — never just the first word, which caused e.g. every
        // product containing "sodium" to flag "Sodium Benzoate".
        const namePart = additive.name.split('(')[0].trim().toLowerCase();
        const nameMatch = namePart.length >= 4 && text.includes(namePart);

        if (idRegex.test(text) || nameMatch) {
            found.push(additive);
            seen.add(additive.id);
        }
    }

    // Sort: high → moderate → minimal
    const order: Record<ConcernLevel, number> = { high: 0, moderate: 1, minimal: 2 };
    return found.sort((a, b) => order[a.level] - order[b.level]);
};

export const getAdditiveSummary = (additives: Additive[]): { high: number; moderate: number; minimal: number } => {
    return {
        high: additives.filter(a => a.level === 'high').length,
        moderate: additives.filter(a => a.level === 'moderate').length,
        minimal: additives.filter(a => a.level === 'minimal').length,
    };
};

export const getConcernColor = (level: ConcernLevel): string => {
    switch (level) {
        case 'high': return '#D32F2F';
        case 'moderate': return '#F57C00';
        case 'minimal': return '#388E3C';
    }
};
