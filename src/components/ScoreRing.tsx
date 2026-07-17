/**
 * ScoreRing — the hero of every verdict. An animated circular progress ring
 * showing the 0–100 score with the grade letter in the centre.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
    score: number | null;     // 0–100, null = no data
    grade: string | null;     // A–E, null = unknown
    color: string;
    size?: number;
    strokeWidth?: number;
    subtitle?: string;
};

export default function ScoreRing({ score, grade, color, size = 132, strokeWidth = 11, subtitle }: Props) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        progress.setValue(0);
        Animated.timing(progress, {
            toValue: score != null ? Math.max(0, Math.min(100, score)) / 100 : 0,
            duration: 900,
            useNativeDriver: false, // strokeDashoffset is not a native-driver prop
        }).start();
    }, [score, progress]);

    const dashOffset = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [circumference, 0],
    });

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={Colors.divider} strokeWidth={strokeWidth} fill="none"
                />
                <AnimatedCircle
                    cx={size / 2} cy={size / 2} r={radius}
                    stroke={score != null ? color : Colors.border}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={dashOffset as unknown as number}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <Text style={[styles.grade, { color: score != null ? color : Colors.textMuted, fontSize: size * 0.3 }]}>
                {grade || '?'}
            </Text>
            {score != null && (
                <Text style={styles.score}>{score}<Text style={styles.scoreMax}>/100</Text></Text>
            )}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    grade: { fontWeight: '900', lineHeight: undefined },
    score: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginTop: 1 },
    scoreMax: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
    subtitle: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1 },
});
