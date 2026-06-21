export const Colors = {
    // Brand (Indian Inspired / Clean)
    primary: '#FF9933', // Saffron
    primaryDark: '#E68A2E',
    primaryLight: '#FFF4E6',

    accent: '#138808',  // India Green for healthy items

    // Grades (Enhanced contrast)
    gradeA: '#1B5E20',
    gradeB: '#4CAF50',
    gradeC: '#FFC107',
    gradeD: '#FF9800',
    gradeE: '#D32F2F',

    // Neutrals (White & Cream)
    background: '#FEF9E7', // Cream
    card: '#FFFFFF',
    border: '#EAECEE',
    divider: '#F2F4F4',

    // Text
    textPrimary: '#1C2833',
    textSecondary: '#566573',
    textMuted: '#ABB2B9',

    // Semantic
    danger: '#E74C3C',
    success: '#27AE60',
    warning: '#F39C12',
    info: '#3498DB',

    // Status Dots (Nutrient Analysis - Matching screenshot colors)
    statusPositive: '#2E7D32', // Deep green
    statusNegative: '#D32F2F', // Deep red
    statusFair: '#F57C00',     // Deep orange
    statusLow: '#90A4AE',      // Muted grey

    // UI Elements
    pillBackground: '#F0F3F4',
    pillText: '#566573',
};

export const Typography = {
    h1: { fontSize: 32, fontWeight: '800' as const, color: Colors.textPrimary },
    h2: { fontSize: 24, fontWeight: '700' as const, color: Colors.textPrimary },
    h3: { fontSize: 20, fontWeight: '600' as const, color: Colors.textPrimary },
    body: { fontSize: 16, color: Colors.textPrimary },
    bodySmall: { fontSize: 14, color: Colors.textSecondary },
    caption: { fontSize: 12, color: Colors.textMuted },
    label: {
        fontSize: 12,
        fontWeight: '700' as const,
        color: Colors.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: 1,
    },
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const Radius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
};

export const Shadow = {
    sm: {
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
    },
    md: {
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
    },
    lg: {
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
    },
};

// ─── Grade → colour ────────────────────────────────────────────────────────
export const GRADE_COLORS: Record<string, string> = {
    A: Colors.gradeA,
    B: Colors.gradeB,
    C: Colors.gradeC,
    D: Colors.gradeD,
    E: Colors.gradeE,
};

/** Map a letter grade (A–E) to its colour, with a neutral fallback. */
export const gradeColor = (grade?: string | null): string =>
    (grade && GRADE_COLORS[grade]) || Colors.textMuted;

export const APP_VERSION = '4.0.0';
