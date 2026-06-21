/**
 * ProfileScreen.tsx — Padho Label
 * Health-profile summary, local activity stats, and data controls. Offline-first.
 */

import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, UserProfile } from '../types';
import { getUserProfile } from '../services/userProfileService';
import { getHistoryCount, clearHistory } from '../services/history';
import { getFavorites } from '../services/favorites';
import { getPantryItems } from '../services/pantryService';
import { Colors, Spacing, Radius, Shadow, APP_VERSION } from '../theme';
import {
    User, ChevronRight, Clock, Settings, Trash2, ShieldCheck, Heart, Package, Bookmark,
} from 'lucide-react-native';

type Props = BottomTabScreenProps<RootStackParamList, 'Profile'>;

const GOAL_LABELS: Record<string, string> = {
    weight_loss: 'Weight loss', muscle_gain: 'Muscle gain', wellness: 'Wellness',
    blood_sugar: 'Blood sugar', pcos: 'PCOS', heart: 'Heart', gut: 'Gut',
};
const CONDITION_LABELS: Record<string, string> = {
    diabetes: 'Diabetes', prediabetes: 'Pre-diabetes', hypertension: 'Hypertension',
    high_cholesterol: 'High cholesterol', fatty_liver: 'Fatty liver', pcos: 'PCOS', thyroid: 'Thyroid',
};

export default function ProfileScreen({ navigation }: Props) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [scanCount, setScanCount] = useState(0);
    const [pantryCount, setPantryCount] = useState(0);
    const [savedCount, setSavedCount] = useState(0);
    const isFocused = useIsFocused();

    const load = useCallback(async () => {
        const [p, scans, pantry, favs] = await Promise.all([
            getUserProfile(), getHistoryCount(), getPantryItems(), getFavorites(),
        ]);
        setProfile(p);
        setScanCount(scans);
        setPantryCount(pantry.length);
        setSavedCount(favs.length);
    }, []);

    React.useEffect(() => { if (isFocused) load(); }, [isFocused, load]);

    const handleClearHistory = () => {
        Alert.alert('Clear History', 'Delete all scan history? This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: async () => { await clearHistory(); setScanCount(0); } },
        ]);
    };

    return (
        <ScrollView style={styles.wrapper} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.avatarCircle}>
                    <User color="#fff" size={32} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{profile?.name || 'Your Profile'}</Text>
                    <Text style={styles.profileSub} numberOfLines={1}>
                        {profile ? `${profile.diet.replace('_', '-')} · ${profile.city}` : 'Set up your profile for personalised scores'}
                    </Text>
                </View>
                <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('Onboarding')}>
                    <Text style={styles.editBtnText}>{profile ? 'Edit' : 'Set up'}</Text>
                </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
                <View style={styles.stat}><Clock color={Colors.primary} size={20} /><Text style={styles.statV}>{scanCount}</Text><Text style={styles.statL}>Scans</Text></View>
                <View style={styles.stat}><Package color={Colors.accent} size={20} /><Text style={styles.statV}>{pantryCount}</Text><Text style={styles.statL}>Pantry</Text></View>
                <View style={styles.stat}><Bookmark color="#E91E63" size={20} /><Text style={styles.statV}>{savedCount}</Text><Text style={styles.statL}>Saved</Text></View>
            </View>

            {/* Health profile summary */}
            {profile && (profile.goals.length > 0 || profile.conditions.length > 0) && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Health Profile</Text>
                    <View style={styles.profileGrid}>
                        {profile.goals.map(g => (
                            <View key={g} style={styles.profileChip}><Text style={styles.profileChipText}>{GOAL_LABELS[g] || g}</Text></View>
                        ))}
                        {profile.conditions.map(c => (
                            <View key={c} style={[styles.profileChip, { borderColor: Colors.danger + '60', backgroundColor: Colors.danger + '10' }]}>
                                <Text style={[styles.profileChipText, { color: Colors.danger }]}>{CONDITION_LABELS[c] || c}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* History shortcut */}
            <TouchableOpacity style={styles.navRow} onPress={() => navigation.navigate('History')}>
                <Clock color={Colors.info} size={20} />
                <Text style={styles.navLabel}>Scan History</Text>
                <Text style={styles.navCount}>{scanCount}</Text>
                <ChevronRight color={Colors.textMuted} size={18} />
            </TouchableOpacity>

            {/* Settings shortcut */}
            <TouchableOpacity style={styles.navRow} onPress={() => navigation.navigate('Settings')}>
                <Settings color={Colors.textSecondary} size={20} />
                <Text style={styles.navLabel}>Settings</Text>
                <ChevronRight color={Colors.textMuted} size={18} />
            </TouchableOpacity>

            {/* Clear history */}
            <TouchableOpacity style={styles.navRow} onPress={handleClearHistory}>
                <Trash2 color={Colors.danger} size={20} />
                <Text style={[styles.navLabel, { color: Colors.danger }]}>Clear Scan History</Text>
            </TouchableOpacity>

            {/* About */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <View style={styles.aboutRow}>
                    <ShieldCheck color={Colors.primary} size={18} />
                    <Text style={styles.aboutText}>Padho Label v{APP_VERSION}</Text>
                </View>
                <View style={styles.aboutRow}>
                    <Heart color="#E91E63" size={18} />
                    <Text style={styles.aboutText}>Nutrition data: Open Food Facts · Open Beauty Facts</Text>
                </View>
                <Text style={styles.disclaimer}>
                    Padho Label is an informational tool, not medical advice. Always consult a qualified professional for dietary decisions.
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },
    header: { backgroundColor: Colors.primary, paddingTop: 50, paddingBottom: 24, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    profileName: { fontSize: 20, fontWeight: '900', color: '#fff' },
    profileSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    editBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    statsRow: { flexDirection: 'row', margin: Spacing.md, gap: 10 },
    stat: { flex: 1, backgroundColor: '#fff', borderRadius: Radius.lg, padding: 14, alignItems: 'center', gap: 4, ...Shadow.sm },
    statV: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
    statL: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    section: { backgroundColor: '#fff', marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, ...Shadow.sm },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    profileChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '60', backgroundColor: Colors.primaryLight },
    profileChipText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

    navRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: Spacing.md, marginBottom: 8, borderRadius: Radius.md, padding: Spacing.md, gap: 12, ...Shadow.sm },
    navLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
    navCount: { fontSize: 13, color: Colors.textMuted, fontWeight: '700' },

    aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    aboutText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
    disclaimer: { fontSize: 11, color: Colors.textMuted, lineHeight: 16, marginTop: 8 },
});
