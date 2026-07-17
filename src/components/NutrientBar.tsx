/**
 * NutrientBar — one nutrient row: name, amount, and a bar showing % of the
 * user's (or generic) daily limit, coloured by status.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme';

type Props = {
    label: string;
    valueText: string;        // e.g. "27.0 g"
    percent: number;          // 0..(can exceed 100)
    color: string;
    indent?: boolean;         // sub-nutrients (sat fat, added sugar)
};

export default function NutrientBar({ label, valueText, percent, color, indent }: Props) {
    const shown = Math.max(0, Math.round(percent));
    return (
        <View style={[styles.row, indent && styles.indent]}>
            <Text style={[styles.label, indent && styles.labelIndent]} numberOfLines={1}>{label}</Text>
            <Text style={styles.value}>{valueText}</Text>
            <View style={styles.barZone}>
                <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.min(shown, 100)}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.pct, { color }]}>{shown}%</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8.5, borderBottomWidth: 1, borderBottomColor: Colors.divider },
    indent: { paddingLeft: 14 },
    label: { flex: 1.35, fontSize: 13.5, fontWeight: '600', color: Colors.textPrimary },
    labelIndent: { color: Colors.textSecondary, fontWeight: '500', fontSize: 13 },
    value: { flex: 0.75, fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', paddingRight: 10 },
    barZone: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    barBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.divider, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    pct: { width: 40, fontSize: 11, fontWeight: '800', textAlign: 'right' },
});
