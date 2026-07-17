/**
 * AlertBanner — high-visibility banner for things the user MUST see
 * (allergen hits, diet conflicts). Sits at the top of the verdict.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, ShieldAlert, CheckCircle2, Info, LucideIcon } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '../theme';

export type BannerTone = 'danger' | 'warning' | 'success' | 'info';

const TONES: Record<BannerTone, { color: string; bg: string; icon: LucideIcon }> = {
    danger: { color: Colors.danger, bg: Colors.dangerBg, icon: ShieldAlert },
    warning: { color: Colors.warning, bg: Colors.warningBg, icon: AlertTriangle },
    success: { color: Colors.success, bg: Colors.successBg, icon: CheckCircle2 },
    info: { color: Colors.info, bg: Colors.infoBg, icon: Info },
};

type Props = {
    tone: BannerTone;
    title: string;
    body?: string;
};

export default function AlertBanner({ tone, title, body }: Props) {
    const t = TONES[tone];
    const Icon = t.icon;
    return (
        <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.color + '35' }]}>
            <Icon color={t.color} size={20} strokeWidth={2.4} />
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.color }]}>{title}</Text>
                {body ? <Text style={styles.body}>{body}</Text> : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        borderRadius: Radius.lg, borderWidth: 1,
        padding: Spacing.md,
    },
    title: { fontSize: 14, fontWeight: '800' },
    body: { fontSize: 13, color: Colors.textSecondary, marginTop: 3, lineHeight: 18 },
});
