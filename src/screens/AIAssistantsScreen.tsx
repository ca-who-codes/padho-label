import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import {
    getAIConnections, connectAI, disconnectAI, AIConnectionsMap,
} from '../services/aiConnectionsService';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import {
    ArrowLeft, CheckCircle, Circle, ChevronRight, Sparkles,
    ShoppingBag, Zap, Brain, UtensilsCrossed, Package, MessageSquare,
} from 'lucide-react-native';

type Props = NativeStackScreenProps<RootStackParamList, 'AIAssistants'>;

// ─── Assistant definitions ────────────────────────────────────────────────────

const ASSISTANTS = [
    {
        id: 'claude' as const,
        name: 'Claude AI',
        tagline: 'Enhanced nutrition & recipe intelligence',
        description: 'Connect your Claude API key to unlock advanced nutrition analysis, personalised meal planning, and smart recipe suggestions powered by Anthropic\'s AI.',
        color: '#7C3AED',
        bgColor: '#F5F0FF',
        icon: Brain,
        features: [
            'Scan pantry with AI vision',
            'Personalised recipe suggestions',
            'Deep nutrition analysis',
            'Natural language kitchen updates',
        ],
        inputLabel: 'Claude API Key',
        inputPlaceholder: 'sk-ant-api03-...',
        inputType: 'apiKey' as const,
        hint: 'Get your key from console.anthropic.com',
    },
    {
        id: 'zomato' as const,
        name: 'Zomato',
        tagline: 'Order restaurant food via AI chat',
        description: 'Connect your Zomato account to let TIA browse restaurants, build your cart, and place orders directly from the chat — just by describing what you want.',
        color: '#E23744',
        bgColor: '#FFF0F1',
        icon: UtensilsCrossed,
        features: [
            'Search nearby restaurants',
            'Order from chat ("I want biryani")',
            'Track your delivery',
            'View order history',
        ],
        inputLabel: 'Zomato Phone Number',
        inputPlaceholder: '+91 98765 43210',
        inputType: 'phone' as const,
        hint: 'Use the phone number linked to your Zomato account',
    },
    {
        id: 'zepto' as const,
        name: 'Zepto',
        tagline: 'Order fresh groceries in 10 minutes',
        description: 'Connect your Zepto account so TIA can restock your pantry automatically — it checks what\'s running low and orders it before you run out.',
        color: '#8B1DDA',
        bgColor: '#F7F0FF',
        icon: ShoppingBag,
        features: [
            'Auto-restock pantry items',
            'Order groceries via chat',
            '10-minute delivery',
            'Smart shopping list from recipes',
        ],
        inputLabel: 'Zepto Phone Number',
        inputPlaceholder: '+91 98765 43210',
        inputType: 'phone' as const,
        hint: 'Use the phone number linked to your Zepto account',
    },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAssistantsScreen({ navigation }: Props) {
    const [connections, setConnections] = useState<AIConnectionsMap>({});
    const [modalAssistant, setModalAssistant] = useState<typeof ASSISTANTS[0] | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const c = await getAIConnections();
        setConnections(c);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openConnect = (assistant: typeof ASSISTANTS[0]) => {
        setInputValue('');
        setModalAssistant(assistant);
    };

    const handleSave = async () => {
        if (!modalAssistant) return;
        const val = inputValue.trim();
        if (!val) {
            Alert.alert('Required', `Please enter your ${modalAssistant.inputLabel}`);
            return;
        }
        // Basic validation
        if (modalAssistant.id === 'claude' && !val.startsWith('sk-ant-')) {
            Alert.alert('Invalid Key', 'Claude API keys start with "sk-ant-". Please check and try again.');
            return;
        }
        if (modalAssistant.inputType === 'phone' && val.replace(/\D/g, '').length < 10) {
            Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
            return;
        }

        setSaving(true);
        try {
            if (modalAssistant.id === 'claude') {
                await connectAI({ type: 'claude', apiKey: val, connectedAt: Date.now() });
            } else if (modalAssistant.id === 'zomato') {
                await connectAI({ type: 'zomato', phoneNumber: val, connectedAt: Date.now() });
            } else {
                await connectAI({ type: 'zepto', phoneNumber: val, connectedAt: Date.now() });
            }
            await load();
            setModalAssistant(null);
            Alert.alert('Connected!', `${modalAssistant.name} is now connected. TIA can now help you with ${modalAssistant.name} features.`);
        } finally {
            setSaving(false);
        }
    };

    const handleDisconnect = (assistant: typeof ASSISTANTS[0]) => {
        Alert.alert(
            `Disconnect ${assistant.name}`,
            `Remove your ${assistant.name} connection? You can reconnect at any time.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        await disconnectAI(assistant.id);
                        await load();
                    },
                },
            ]
        );
    };

    const connectedCount = Object.keys(connections).length;

    return (
        <View style={styles.wrapper}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={22} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>AI Assistants</Text>
                    <Text style={styles.headerSub}>
                        {connectedCount === 0
                            ? 'Connect to unlock powerful features'
                            : `${connectedCount} connected · TIA is ready`}
                    </Text>
                </View>
                <View style={styles.tiaBadge}>
                    <Sparkles color="#fff" size={16} />
                    <Text style={styles.tiaBadgeText}>TIA</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                {/* Intro banner */}
                <View style={styles.introBanner}>
                    <View style={styles.introIconRow}>
                        <View style={[styles.introIcon, { backgroundColor: '#F5F0FF' }]}><Brain color="#7C3AED" size={20} /></View>
                        <View style={[styles.introIcon, { backgroundColor: '#FFF0F1' }]}><UtensilsCrossed color="#E23744" size={20} /></View>
                        <View style={[styles.introIcon, { backgroundColor: '#F7F0FF' }]}><ShoppingBag color="#8B1DDA" size={20} /></View>
                    </View>
                    <Text style={styles.introTitle}>Let TIA do more for you</Text>
                    <Text style={styles.introDesc}>
                        Connect your AI and delivery accounts so TIA can scan your pantry, suggest recipes, and order food — all from a single chat.
                    </Text>

                    <View style={styles.capabilityList}>
                        {[
                            { icon: Package, label: 'Scan & update your pantry via AI' },
                            { icon: Brain, label: 'Personalised nutrition & recipe advice' },
                            { icon: UtensilsCrossed, label: 'Order restaurant food via Zomato' },
                            { icon: ShoppingBag, label: 'Auto-restock groceries via Zepto' },
                            { icon: MessageSquare, label: 'Talk to TIA about anything health-related' },
                        ].map(({ icon: Icon, label }, i) => (
                            <View key={i} style={styles.capRow}>
                                <View style={styles.capDot}><Icon color={Colors.primary} size={14} /></View>
                                <Text style={styles.capLabel}>{label}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Assistant cards */}
                <Text style={styles.sectionTitle}>Available Connections</Text>

                {ASSISTANTS.map(assistant => {
                    const isConnected = !!(connections as any)[assistant.id];
                    const conn = (connections as any)[assistant.id];
                    const Icon = assistant.icon;

                    return (
                        <View key={assistant.id} style={[styles.card, isConnected && styles.cardConnected]}>
                            <View style={styles.cardHeader}>
                                <View style={[styles.cardIcon, { backgroundColor: assistant.bgColor }]}>
                                    <Icon color={assistant.color} size={24} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardName}>{assistant.name}</Text>
                                        {isConnected && (
                                            <View style={styles.connectedBadge}>
                                                <CheckCircle color={Colors.success} size={14} />
                                                <Text style={styles.connectedText}>Connected</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.cardTagline}>{assistant.tagline}</Text>
                                </View>
                            </View>

                            <Text style={styles.cardDesc}>{assistant.description}</Text>

                            {/* Features */}
                            <View style={styles.featuresGrid}>
                                {assistant.features.map((f, i) => (
                                    <View key={i} style={styles.featureChip}>
                                        <Zap color={assistant.color} size={10} />
                                        <Text style={[styles.featureText, { color: assistant.color }]}>{f}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Connection info */}
                            {isConnected && conn && (
                                <View style={styles.connInfoRow}>
                                    <Text style={styles.connInfoText}>
                                        {assistant.id === 'claude'
                                            ? `Key: ${conn.apiKey.slice(0, 12)}…`
                                            : `Phone: ${conn.phoneNumber}`}
                                    </Text>
                                    <Text style={styles.connInfoDate}>
                                        Since {new Date(conn.connectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                    </Text>
                                </View>
                            )}

                            {/* Action button */}
                            <TouchableOpacity
                                style={[
                                    styles.actionBtn,
                                    isConnected
                                        ? styles.actionBtnDisconnect
                                        : { backgroundColor: assistant.color },
                                ]}
                                onPress={() => isConnected ? handleDisconnect(assistant) : openConnect(assistant)}
                            >
                                <Text style={[
                                    styles.actionBtnText,
                                    isConnected && styles.actionBtnTextDisconnect,
                                ]}>
                                    {isConnected ? 'Disconnect' : `Connect ${assistant.name}`}
                                </Text>
                                {!isConnected && <ChevronRight color="#fff" size={16} />}
                            </TouchableOpacity>
                        </View>
                    );
                })}

                {/* CTA after connecting */}
                {connectedCount > 0 && (
                    <TouchableOpacity
                        style={styles.chatCta}
                        onPress={() => navigation.navigate('Chat', {})}
                    >
                        <MessageSquare color="#fff" size={20} />
                        <Text style={styles.chatCtaText}>Open TIA Chat to try it out</Text>
                        <ChevronRight color="#fff" size={16} />
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Connect modal */}
            <Modal
                visible={!!modalAssistant}
                transparent
                animationType="slide"
                onRequestClose={() => setModalAssistant(null)}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalSheet}>
                        {modalAssistant && (
                            <>
                                <View style={styles.modalHandle} />
                                <View style={styles.modalHeader}>
                                    <View style={[styles.cardIcon, { backgroundColor: modalAssistant.bgColor }]}>
                                        <modalAssistant.icon color={modalAssistant.color} size={22} />
                                    </View>
                                    <View>
                                        <Text style={styles.modalTitle}>Connect {modalAssistant.name}</Text>
                                        <Text style={styles.modalSub}>{modalAssistant.tagline}</Text>
                                    </View>
                                </View>

                                <Text style={styles.modalLabel}>{modalAssistant.inputLabel}</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder={modalAssistant.inputPlaceholder}
                                    value={inputValue}
                                    onChangeText={setInputValue}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    secureTextEntry={modalAssistant.inputType === 'apiKey'}
                                    keyboardType={modalAssistant.inputType === 'phone' ? 'phone-pad' : 'default'}
                                    placeholderTextColor={Colors.textMuted}
                                />
                                <Text style={styles.modalHint}>{modalAssistant.hint}</Text>

                                <View style={styles.modalActions}>
                                    <TouchableOpacity
                                        style={styles.modalCancel}
                                        onPress={() => setModalAssistant(null)}
                                        disabled={saving}
                                    >
                                        <Text style={styles.modalCancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalSave, { backgroundColor: modalAssistant.color }, saving && { opacity: 0.6 }]}
                                        onPress={handleSave}
                                        disabled={saving}
                                    >
                                        {saving
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={styles.modalSaveText}>Connect</Text>}
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },

    header: {
        backgroundColor: Colors.primary, paddingTop: 50, paddingBottom: 20,
        paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    tiaBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: Radius.full,
        paddingHorizontal: 10, paddingVertical: 5,
    },
    tiaBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },

    introBanner: {
        backgroundColor: '#fff', margin: Spacing.md, borderRadius: Radius.xl,
        padding: Spacing.lg, ...Shadow.md,
    },
    introIconRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
    introIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    introTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary, marginBottom: 6 },
    introDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21, marginBottom: Spacing.md },
    capabilityList: { gap: 8 },
    capRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    capDot: {
        width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primaryLight,
        alignItems: 'center', justifyContent: 'center',
    },
    capLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },

    sectionTitle: {
        fontSize: 12, fontWeight: '800', color: Colors.textMuted,
        textTransform: 'uppercase', letterSpacing: 0.8,
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: 4,
    },

    card: {
        backgroundColor: '#fff', marginHorizontal: Spacing.md, marginBottom: Spacing.md,
        borderRadius: Radius.xl, padding: Spacing.lg, ...Shadow.sm,
        borderWidth: 1.5, borderColor: 'transparent',
    },
    cardConnected: { borderColor: Colors.success + '40' },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
    cardIcon: { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    cardName: { fontSize: 17, fontWeight: '900', color: Colors.textPrimary },
    connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.success + '15', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
    connectedText: { fontSize: 11, fontWeight: '700', color: Colors.success },
    cardTagline: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
    cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 12 },

    featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    featureChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.full,
        backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    },
    featureText: { fontSize: 11, fontWeight: '700' },

    connInfoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: Colors.background, borderRadius: Radius.sm, padding: 10, marginBottom: 12,
    },
    connInfoText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
    connInfoDate: { fontSize: 11, color: Colors.textMuted },

    actionBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        borderRadius: Radius.full, paddingVertical: 13,
    },
    actionBtnDisconnect: {
        backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.border,
    },
    actionBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    actionBtnTextDisconnect: { color: Colors.textMuted },

    chatCta: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: Colors.primary, marginHorizontal: Spacing.md, marginBottom: Spacing.md,
        borderRadius: Radius.full, paddingVertical: 14, paddingHorizontal: Spacing.lg, ...Shadow.md,
    },
    chatCtaText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
        backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: Spacing.lg, paddingBottom: 40,
    },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.lg },
    modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
    modalSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
    modalLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
    modalInput: {
        borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
        paddingHorizontal: Spacing.md, paddingVertical: 14, fontSize: 15,
        color: Colors.textPrimary, backgroundColor: Colors.background, marginBottom: 8,
    },
    modalHint: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.lg },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalCancel: {
        flex: 1, paddingVertical: 14, borderRadius: Radius.full,
        borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    },
    modalCancelText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
    modalSave: {
        flex: 2, paddingVertical: 14, borderRadius: Radius.full, alignItems: 'center',
    },
    modalSaveText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
