/**
 * Chip — small labelled pill for flags ("High Sugar", "No Palm Oil"…).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Radius } from '../theme';

type Props = {
    label: string;
    color: string;         // tone colour; bg/border derived from it
    icon?: LucideIcon;
};

export default function Chip({ label, color, icon: Icon }: Props) {
    return (
        <View style={[styles.chip, { backgroundColor: color + '14', borderColor: color + '45' }]}>
            {Icon ? <Icon color={color} size={12} strokeWidth={2.5} /> : null}
            <Text style={[styles.text, { color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: Radius.full, borderWidth: 1,
    },
    text: { fontSize: 11.5, fontWeight: '800' },
});
