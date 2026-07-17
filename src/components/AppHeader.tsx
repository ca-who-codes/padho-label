/**
 * AppHeader — safe-area-aware header for tab screens. Solid brand or plain
 * variants, with optional right-side actions.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../theme';

type Props = {
    title: string;
    subtitle?: string;
    variant?: 'brand' | 'plain';
    right?: React.ReactNode;
};

export default function AppHeader({ title, subtitle, variant = 'plain', right }: Props) {
    const insets = useSafeAreaInsets();
    const brand = variant === 'brand';
    return (
        <View style={[styles.wrap, { paddingTop: insets.top + 10 }, brand ? styles.brand : styles.plain]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, brand && { color: '#fff' }]}>{title}</Text>
                {subtitle ? (
                    <Text style={[styles.subtitle, brand && { color: 'rgba(255,255,255,0.85)' }]}>{subtitle}</Text>
                ) : null}
            </View>
            {right}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: Spacing.md, paddingBottom: 14,
    },
    brand: { backgroundColor: Colors.primary },
    plain: { backgroundColor: Colors.background },
    title: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
});
