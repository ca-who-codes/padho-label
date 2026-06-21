import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    TouchableOpacity, Image, TextInput,
} from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { RootStackParamList, Product } from '../types';
import { getHistory } from '../services/history';
import { calculateNutriScore } from '../services/ratingEngine';
import { useIsFocused } from '@react-navigation/native';
import { Search, ScanLine } from 'lucide-react-native';
import { Colors, Spacing, Radius, Shadow, Typography } from '../theme';

type Props = BottomTabScreenProps<RootStackParamList, 'History'>;

export default function HistoryScreen({ navigation }: Props) {
    const [history, setHistory] = useState<Product[]>([]);
    const [query, setQuery] = useState('');
    const isFocused = useIsFocused();

    useEffect(() => {
        if (isFocused) loadHistory();
    }, [isFocused]);

    const loadHistory = async () => {
        const data = await getHistory();
        setHistory(data);
    };

    const filtered = query.trim()
        ? history.filter(
            p =>
                p.name.toLowerCase().includes(query.toLowerCase()) ||
                (p.brand?.toLowerCase().includes(query.toLowerCase()) ?? false)
        )
        : history;

    const renderItem = ({ item }: { item: Product }) => {
        const rating = calculateNutriScore(item.nutrition);

        return (
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
                <View style={[styles.ratingBadge, { backgroundColor: rating.color }]}>
                    <Text style={styles.ratingText}>{rating.grade}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Search */}
            <View style={styles.searchRow}>
                <Search color={Colors.textMuted} size={18} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name or brand..."
                    placeholderTextColor={Colors.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    clearButtonMode="while-editing"
                />
            </View>

            <FlatList
                data={filtered}
                keyExtractor={(item) => item.barcode}
                renderItem={renderItem}
                contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { padding: Spacing.md }}
                ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <ScanLine color={Colors.textMuted} size={60} strokeWidth={1} />
                        <Text style={styles.emptyTitle}>
                            {query ? 'No matches found' : 'No scans yet'}
                        </Text>
                        <Text style={styles.emptyDesc}>
                            {query
                                ? 'Try a different search term.'
                                : 'Scan a product to see its nutritional details here.'}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        marginHorizontal: Spacing.md,
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        ...Shadow.sm,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: Colors.textPrimary,
        marginLeft: Spacing.sm,
        paddingVertical: 4,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.card,
        borderRadius: Radius.md,
        padding: Spacing.md,
        ...Shadow.sm,
    },
    itemImage: {
        width: 52,
        height: 52,
        borderRadius: Radius.sm,
        backgroundColor: Colors.border,
    },
    imagePlaceholder: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: Spacing.md,
        marginRight: Spacing.sm,
    },
    itemName: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    itemBrand: {
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    ratingBadge: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ratingText: {
        color: '#fff',
        fontWeight: '900',
        fontSize: 17,
    },
    emptyContainer: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        marginTop: 80,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.textSecondary,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
    },
    emptyDesc: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
});
