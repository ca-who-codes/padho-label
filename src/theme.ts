/**
 * theme.ts — Padho Label design system v5
 *
 * One place for colour, type, spacing, radius and shadow. Screens compose these
 * tokens; nothing hardcodes hex values. The palette: a calm neutral canvas so the
 * GRADE colours (the health verdict) are the loudest thing on screen, with saffron
 * kept as the brand accent.
 */

export const Colors = {
    // Brand
    primary: '#FF6B2C',      // saffron, modernised
    primaryDark: '#E05A1F',
    primaryLight: '#FFF1E9',
    accent: '#0E9F6E',       // green for "healthy" moments
    accentLight: '#E6F6EF',

    // Grades — Nutri-Score-familiar, tuned for white text contrast
    gradeA: '#038141',
    gradeB: '#6BA72B',
    gradeC: '#E4A400',
    gradeD: '#E8710D',
    gradeE: '#D7331C',

    // Canvas
    background: '#F6F7F9',
    card: '#FFFFFF',
    border: '#EAECF0',
    divider: '#F2F4F7',

    // Text
    textPrimary: '#101828',
    textSecondary: '#475467',
    textMuted: '#98A2B3',
    textInverse: '#FFFFFF',

    // Semantic
    danger: '#D92D20',
    dangerBg: '#FEF3F2',
    warning: '#DC6803',
    warningBg: '#FFFAEB',
    success: '#079455',
    successBg: '#ECFDF3',
    info: '#1570EF',
    infoBg: '#EFF8FF',

    // Nutrient status dots
    statusPositive: '#079455',
    statusNegative: '#D92D20',
    statusFair: '#DC6803',
    statusLow: '#98A2B3',

    // UI
    pillBackground: '#F2F4F7',
    pillText: '#475467',
    overlay: 'rgba(16, 24, 40, 0.55)',
    beauty: '#DD2590',
} as const;

export const Typography = {
    display: { fontSize: 30, fontWeight: '900' as const, color: Colors.textPrimary, letterSpacing: -0.7 },
    h1: { fontSize: 26, fontWeight: '800' as const, color: Colors.textPrimary, letterSpacing: -0.5 },
    h2: { fontSize: 21, fontWeight: '800' as const, color: Colors.textPrimary, letterSpacing: -0.3 },
    h3: { fontSize: 17, fontWeight: '700' as const, color: Colors.textPrimary },
    body: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
    bodySmall: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
    caption: { fontSize: 12, color: Colors.textMuted },
    label: {
        fontSize: 11,
        fontWeight: '800' as const,
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
    xl: 20,
    xxl: 28,
    full: 999,
};

export const Shadow = {
    sm: {
        elevation: 2,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    md: {
        elevation: 4,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
    },
    lg: {
        elevation: 8,
        shadowColor: '#101828',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
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
    (grade && GRADE_COLORS[grade.toUpperCase()]) || Colors.textMuted;

/** Map a 0–100 score (higher = better) to a grade colour. */
export const scoreColor = (score: number): string => {
    if (score >= 80) return Colors.gradeA;
    if (score >= 65) return Colors.gradeB;
    if (score >= 50) return Colors.gradeC;
    if (score >= 35) return Colors.gradeD;
    return Colors.gradeE;
};

export const APP_VERSION = '5.0.0';
