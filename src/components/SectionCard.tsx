/**
 * SectionCard — the standard white content card with an optional title row.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Shadow, Spacing } from '../theme';

type Props = {
    title?: string;
    icon?: LucideIcon;
    iconColor?: string;
    right?: React.ReactNode;
    children: React.ReactNode;
    style?: ViewStyle;
};

export default function SectionCard({ title, icon: Icon, iconColor = Colors.textSecondary, right, children, style }: Props) {
    return (
        <View style={[styles.card, style]}>
            {title ? (
                <View style={styles.titleRow}>
                    {Icon ? <Icon color={iconColor} size={16} strokeWidth={2.4} /> : null}
                    <Text style={styles.title}>{title}</Text>
                    {right}
                </View>
            ) : null}
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: Colors.card,
        borderRadius: Radius.xl,
        padding: Spacing.md,
        ...Shadow.sm,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
    title: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
});
