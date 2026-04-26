/**
 * ProfileScreen.tsx — Padho Label 2.0
 * Shows user profile summary, points, streak, badges, history, and settings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, UserProfile } from '../types';
import { getUserProfile } from '../services/userProfileService';
import { getTotalPoints, getStreak, getEarnedBadges, ALL_BADGES } from '../services/pointsService';
import { getHistoryCount, clearHistory } from '../services/history';
import { Colors, Spacing, Radius, Shadow, APP_VERSION } from '../theme';
import {
    User, Zap, Flame, Trophy, ChevronRight, History,
    Settings, Trash2, ShieldCheck, Heart, Star, LogOut, Brain,
} from 'lucide-react-native';
import { supabase } from '../services/supabaseClient';
import { getAIConnections } from '../services/aiConnectionsService';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [points, setPoints] = useState(0);
    const [streak, setStreak] = useState({ current: 0, best: 0 });
    const [scanCount, setScanCount] = useState(0);
    const [badges, setBadges] = useState(ALL_BADGES);
    const [aiConnectionCount, setAiConnectionCount] = useState(0);

    const load = useCallback(async () => {
        const [p, pts, str, count, bs, aiConns] = await Promise.all([
            getUserProfile(), getTotalPoints(), getStreak(), getHistoryCount(), getEarnedBadges(),
            getAIConnections(),
        ]);
        setProfile(p);
        setPoints(pts);
        setStreak(str);
        setScanCount(count);
        setBadges(bs);
        setAiConnectionCount(Object.keys(aiConns).length);
    }, []);

    // Reload AI connection count when screen is focused
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            getAIConnections().then(c => setAiConnectionCount(Object.keys(c).length));
        });
        return unsubscribe;
    }, [navigation]);

    useEffect(() => { load(); }, [load]);

    const earnedBadges = badges.filter(b => b.earnedAt !== undefined);

    const handleClearHistory = () => {
        Alert.alert('Clear History', 'Delete all scan history?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: async () => { await clearHistory(); setScanCount(0); Alert.alert('Done', 'Scan history cleared.'); } },
        ]);
    };

    return (
        <ScrollView style={styles.wrapper} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.avatarCircle}>
                    <User color="#fff" size={32} />
                </View>
                <View>
                    <Text style={styles.profileName}>{profile?.name || 'Your Profile'}</Text>
                    <Text style={styles.profileSub}>{profile?.diet ? `${profile.diet} · ${profile.city}` : 'Set up your profile for personalised scores'}</Text>
                </View>
                <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => navigation.navigate('Onboarding')}
                >
                    <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
                <View style={styles.stat}><Zap color={Colors.primary} size={20} /><Text style={styles.statV}>{points}</Text><Text style={styles.statL}>Points</Text></View>
                <View style={styles.stat}><Flame color="#FF6B35" size={20} /><Text style={styles.statV}>{streak.current}</Text><Text style={styles.statL}>Streak</Text></View>
                <View style={styles.stat}><Star color={Colors.warning} size={20} /><Text style={styles.statV}>{scanCount}</Text><Text style={styles.statL}>Scans</Text></View>
                <View style={styles.stat}><Trophy color="#FFC107" size={20} /><Text style={styles.statV}>{earnedBadges.length}</Text><Text style={styles.statL}>Badges</Text></View>
            </View>

            {/* Health profile summary */}
            {profile && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Health Profile</Text>
                    <View style={styles.profileGrid}>
                        {profile.goals.map(g => (
                            <View key={g} style={styles.profileChip}><Text style={styles.profileChipText}>{g.replace('_', ' ')}</Text></View>
                        ))}
                        {profile.conditions.map(c => (
                            <View key={c} style={[styles.profileChip, { borderColor: Colors.danger + '60', backgroundColor: Colors.danger + '10' }]}>
                                <Text style={[styles.profileChipText, { color: Colors.danger }]}>{c.replace('_', ' ')}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* AI Assistants */}
            <TouchableOpacity style={[styles.navRow, styles.navRowHighlight]} onPress={() => navigation.navigate('AIAssistants')}>
                <Brain color="#7C3AED" size={20} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.navLabel}>AI Assistants</Text>
                    <Text style={styles.navSublabel}>
                        {aiConnectionCount === 0
                            ? 'Connect Claude, Zomato & Zepto'
                            : `${aiConnectionCount} connected · TIA is fully set up`}
                    </Text>
                </View>
                {aiConnectionCount === 0
                    ? <View style={styles.setupBadge}><Text style={styles.setupBadgeText}>Set up</Text></View>
                    : <ChevronRight color={Colors.textMuted} size={18} />}
            </TouchableOpacity>

            {/* Challenges shortcut */}
            <TouchableOpacity style={styles.navRow} onPress={() => navigation.navigate('Challenges')}>
                <Trophy color={Colors.warning} size={20} />
                <Text style={styles.navLabel}>Challenges & Badges</Text>
                <ChevronRight color={Colors.textMuted} size={18} />
            </TouchableOpacity>

            {/* History shortcut */}
            <TouchableOpacity style={styles.navRow} onPress={() => navigation.navigate('History')}>
                <History color={Colors.info} size={20} />
                <Text style={styles.navLabel}>Scan History ({scanCount})</Text>
                <ChevronRight color={Colors.textMuted} size={18} />
            </TouchableOpacity>

            {/* Clear history */}
            <TouchableOpacity style={styles.navRow} onPress={handleClearHistory}>
                <Trash2 color={Colors.danger} size={20} />
                <Text style={[styles.navLabel, { color: Colors.danger }]}>Clear Scan History</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
                style={styles.navRow}
                onPress={async () => {
                    const { error } = await supabase.auth.signOut();
                    if (error) Alert.alert('Error', error.message);
                }}
            >
                <LogOut color={Colors.textSecondary} size={20} />
                <Text style={styles.navLabel}>Log Out</Text>
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
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },
    header: { backgroundColor: Colors.primary, paddingTop: 50, paddingBottom: 24, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    profileName: { fontSize: 20, fontWeight: '900', color: '#fff' },
    profileSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2, maxWidth: 200 },
    editBtn: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 6 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    statsRow: { flexDirection: 'row', margin: Spacing.md, gap: 10 },
    stat: { flex: 1, backgroundColor: '#fff', borderRadius: Radius.lg, padding: 12, alignItems: 'center', gap: 4, ...Shadow.sm },
    statV: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
    statL: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

    section: { backgroundColor: '#fff', marginHorizontal: Spacing.md, marginBottom: Spacing.md, borderRadius: Radius.xl, padding: Spacing.md, ...Shadow.sm },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
    profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    profileChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary + '60', backgroundColor: Colors.primaryLight },
    profileChipText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

    navRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: Spacing.md, marginBottom: 8, borderRadius: Radius.md, padding: Spacing.md, gap: 12, ...Shadow.sm },
    navRowHighlight: { borderWidth: 1.5, borderColor: '#7C3AED' + '30', backgroundColor: '#F5F0FF' },
    navLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '600' },
    navSublabel: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
    setupBadge: { backgroundColor: '#7C3AED', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    setupBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    aboutText: { fontSize: 13, color: Colors.textSecondary },
});
