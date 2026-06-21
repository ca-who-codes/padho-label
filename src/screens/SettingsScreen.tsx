import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Trash2, ShieldCheck, Heart, Package } from 'lucide-react-native';
import { clearHistory } from '../services/history';
import { clearPantry } from '../services/pantryService';
import { Colors, Spacing, Radius, Shadow, Typography, APP_VERSION } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen(_props: Props) {
    const confirm = (title: string, message: string, onConfirm: () => Promise<void>) => {
        Alert.alert(title, message, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => { onConfirm(); } },
        ]);
    };

    const handleClearHistory = () =>
        confirm('Clear History', 'Delete all scan history? This cannot be undone.', async () => {
            await clearHistory();
            Alert.alert('Done', 'Your scan history has been cleared.');
        });

    const handleClearPantry = () =>
        confirm('Clear Pantry', 'Remove all items from your pantry? This cannot be undone.', async () => {
            await clearPantry();
            Alert.alert('Done', 'Your pantry has been cleared.');
        });

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Data */}
            <Text style={styles.sectionHeader}>Data</Text>
            <View style={styles.card}>
                <TouchableOpacity style={styles.settingItem} onPress={handleClearHistory}>
                    <View style={styles.itemLeft}>
                        <View style={[styles.iconWrap, { backgroundColor: '#fff5f5' }]}>
                            <Trash2 size={18} color={Colors.danger} />
                        </View>
                        <Text style={[styles.settingLabel, { color: Colors.danger }]}>Clear Scan History</Text>
                    </View>
                </TouchableOpacity>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.settingItem} onPress={handleClearPantry}>
                    <View style={styles.itemLeft}>
                        <View style={[styles.iconWrap, { backgroundColor: '#fff5f5' }]}>
                            <Package size={18} color={Colors.danger} />
                        </View>
                        <Text style={[styles.settingLabel, { color: Colors.danger }]}>Clear Pantry</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* About */}
            <Text style={styles.sectionHeader}>About</Text>
            <View style={styles.card}>
                <View style={styles.settingItem}>
                    <View style={styles.itemLeft}>
                        <View style={[styles.iconWrap, { backgroundColor: Colors.primaryLight }]}>
                            <ShieldCheck size={18} color={Colors.primary} />
                        </View>
                        <Text style={styles.settingLabel}>Padho Label</Text>
                    </View>
                    <Text style={styles.itemValue}>v{APP_VERSION}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.settingItem}>
                    <View style={styles.itemLeft}>
                        <View style={[styles.iconWrap, { backgroundColor: '#fce4ec' }]}>
                            <Heart size={18} color="#e91e63" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.settingLabel}>Nutrition Data</Text>
                            <Text style={styles.settingSubLabel}>Open Food Facts · Open Beauty Facts</Text>
                        </View>
                    </View>
                </View>
            </View>

            <Text style={styles.footer}>
                Padho Label helps you make informed choices. It is not medical advice — always consult a qualified professional.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    sectionHeader: { ...Typography.label, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.sm },
    card: { backgroundColor: Colors.card, marginHorizontal: Spacing.md, borderRadius: Radius.lg, ...Shadow.sm, overflow: 'hidden' },
    divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.md + 44 },
    settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
    itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconWrap: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
    settingLabel: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
    settingSubLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    itemValue: { fontSize: 14, color: Colors.textMuted },
    footer: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xl, marginHorizontal: Spacing.xl, lineHeight: 18 },
});
