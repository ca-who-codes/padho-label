/**
 * GradeBadge — compact round grade indicator used on list rows.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { gradeColor } from '../theme';

type Props = {
    grade?: string | null;
    size?: number;
};

export default function GradeBadge({ grade, size = 34 }: Props) {
    const color = gradeColor(grade);
    return (
        <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
            <Text style={[styles.text, { fontSize: size * 0.44 }]}>{grade?.toUpperCase() || '?'}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: { alignItems: 'center', justifyContent: 'center' },
    text: { color: '#fff', fontWeight: '900' },
});
