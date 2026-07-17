/**
 * EmptyState — friendly zero-data state with an optional call to action.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

type Props = {
    emoji: string;
    title: string;
    body: string;
    ctaLabel?: string;
    onCta?: () => void;
};

export default function EmptyState({ emoji, title, body, ctaLabel, onCta }: Props) {
    return (
        <View style={styles.wrap}>
            <Text style={styles.emoji}>{emoji}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
            {ctaLabel && onCta ? (
                <TouchableOpacity style={styles.cta} onPress={onCta} activeOpacity={0.85}>
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', padding: Spacing.xl, gap: 8 },
    emoji: { fontSize: 52 },
    title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
    body: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
    cta: {
        marginTop: 10, backgroundColor: Colors.primary,
        paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.full,
    },
    ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
