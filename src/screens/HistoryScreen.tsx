/**
 * HistoryScreen — v5: date-grouped scans, personalised grades, swipe-free
 * per-row delete, and search.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, SectionList,
    TouchableOpacity, Image, TextInput,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RootStackParamList, Product, HealthConstraints } from '../types';
import { getHistory, removeFromHistory } from '../services/history';
import { calculateNutriScore, calculatePersonalizedScore } from '../services/ratingEngine';
import { getHealthConstraints } from '../services/userProfileService';
import { useIsFocused } from '@react-navigation/native';
import { Search, ScanLine, Trash2, X } from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { AppHeader, GradeBadge, EmptyState } from '../components';

type Props = BottomTabScreenProps<RootStackParamList, 'History'>;

type Section = { title: string; data: Product[] };

const groupByDate = (items: Product[]): Section[] => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfDay - 86400000;
    const startOfWeek = startOfDay - 6 * 86400000;

    const buckets: Record<string, Product[]> = { Today: [], Yesterday: [], 'This week': [], Earlier: [] };
    for (const p of items) {
        const t = p.scannedAt || 0;
        if (t >= startOfDay) buckets.Today.push(p);
        else if (t >= startOfYesterday) buckets.Yesterday.push(p);
        else if (t >= startOfWeek) buckets['This week'].push(p);
        else buckets.Earlier.push(p);
    }
    return Object.entries(buckets)
        .filter(([, data]) => data.length > 0)
        .map(([title, data]) => ({ title, data }));
};

export default function HistoryScreen({ navigation }: Props) {
    const [history, setHistory] = useState<Product[]>([]);
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [query, setQuery] = useState('');
    const isFocused = useIsFocused();

    const loadHistory = useCallback(async () => {
        const [data, cons] = await Promise.all([
            getHistory(),
            getHealthConstraints().catch(() => null),
        ]);
        setHistory(data);
        setConstraints(cons);
    }, []);

    useEffect(() => { if (isFocused) loadHistory(); }, [isFocused, loadHistory]);

    const handleRemove = async (barcode: string) => {
        const updated = await removeFromHistory(barcode);
        setHistory(updated);
    };

    const filtered = query.trim()
        ? history.filter(
            p =>
                p.name.toLowerCase().includes(query.toLowerCase()) ||
                (p.brand?.toLowerCase().includes(query.toLowerCase()) ?? false)
        )
        : history;

    const sections = groupByDate(filtered);

    const gradeFor = (item: Product): string | null => {
        const base = calculateNutriScore(item.nutrition);
        if (!base.hasData) return null;
        if (constraints) return calculatePersonalizedScore(item, constraints).grade;
        return base.grade;
    };

    return (
        <View style={styles.container}>
            <AppHeader title="History" subtitle={`${history.length} scan${history.length === 1 ? '' : 's'} on this device`} />

            {/* Search */}
            <View style={styles.searchRow}>
                <Search color={Colors.textMuted} size={18} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or brand…"
                    placeholderTextColor={Colors.textMuted}
                    value={query}
                    onChangeText={setQuery}
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <X color={Colors.textMuted} size={18} />
                    </TouchableOpacity>
                )}
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item, idx) => `${item.barcode}-${item.scannedAt || idx}`}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={sections.length === 0 ? { flex: 1 } : { padding: Spacing.md, paddingTop: 4 }}
                renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionHeader}>{section.title}</Text>
                )}
                ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.historyItem}
                        onPress={() => navigation.navigate('Result', { product: item })}
                        activeOpacity={0.8}
                    >
                        {item.image_url ? (
                            <Image source={{ uri: item.image_url }} style={styles.itemImage} />
                        ) : (
                            <View style={[styles.itemImage, styles.imagePlaceholder]}>
                                <ScanLine color={Colors.textMuted} size={20} />
                            </View>
                        )}
                        <View style={styles.itemInfo}>
                            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                            <Text style={styles.itemBrand} numberOfLines={1}>{item.brand || 'Unknown brand'}</Text>
                        </View>
                        <GradeBadge grade={gradeFor(item)} size={34} />
                        <TouchableOpacity
                            onPress={() => handleRemove(item.barcode)}
                            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
                            style={{ marginLeft: 4 }}
                        >
                            <Trash2 color={Colors.textMuted} size={17} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                        <EmptyState
                            emoji={query ? '🔍' : '🧾'}
                            title={query ? 'No matches found' : 'No scans yet'}
                            body={query ? 'Try a different search term.' : 'Scan a product and its health report lands here.'}
                            ctaLabel={query ? undefined : 'Scan a Product'}
                            onCta={query ? undefined : () => navigation.navigate('Scan')}
                        />
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        marginHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.md,
        height: 46,
        gap: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary },
    sectionHeader: {
        fontSize: 12, fontWeight: '800', color: Colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.8,
        marginTop: Spacing.md, marginBottom: Spacing.sm,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        padding: 12,
        gap: 10,
        ...Shadow.sm,
    },
    itemImage: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.divider, resizeMode: 'contain' },
    imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
    itemBrand: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
});
