import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, ScrollView,
    TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { Send, ArrowLeft, Sparkles, Brain } from 'lucide-react-native';
import { sendMessageToAI, sendGeneralMessageToAI, ChatMessage } from '../services/chatService';
import { getUserProfile, getHealthConstraints } from '../services/userProfileService';
import { UserProfile, HealthConstraints } from '../types';
import { getAIConnections, AIConnectionsMap } from '../services/aiConnectionsService';
import { getPantryItems } from '../services/pantryService';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
    const product = route.params?.product ?? undefined;
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [connections, setConnections] = useState<AIConnectionsMap>({});
    const [pantryContext, setPantryContext] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    const isGeneralChat = !product;

    useEffect(() => {
        const init = async () => {
            const [p, c, aiConns, pantryItems] = await Promise.all([
                getUserProfile(),
                getHealthConstraints(),
                getAIConnections(),
                isGeneralChat ? getPantryItems() : Promise.resolve([]),
            ]);

            setProfile(p);
            setConstraints(c);
            setConnections(aiConns);

            if (isGeneralChat && pantryItems.length > 0) {
                const summary = pantryItems.map(i => `- ${i.productName}${i.productBrand ? ` (${i.productBrand})` : ''}: score ${i.personalizedScore}/100`).join('\n');
                setPantryContext(summary);
            }

            const connCount = Object.keys(aiConns).length;
            const greeting = p
                ? `Hi ${p.name}! 👋 I'm TIA, your Padho Label AI assistant. ${
                    product
                        ? `I've analysed **${product.name}** for you. Ask me anything!`
                        : connCount > 0
                            ? `I have ${connCount} service${connCount > 1 ? 's' : ''} connected and can see your pantry. Ask me about nutrition, recipes, or let me help you order!`
                            : "I can help with nutrition, pantry management, and recipes. Connect Zomato or Zepto in Profile to unlock ordering too!"
                  }`
                : `Hi! 👋 I'm TIA. ${product ? `I've analysed **${product.name}**.` : "Ask me about nutrition, pantry, recipes, or ordering."} How can I help?`;

            setMessages([{ role: 'model', text: greeting }]);
        };
        init();
    }, [product?.name]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading) return;
        const userText = input.trim();
        setInput('');
        const newMessages: ChatMessage[] = [...messages, { role: 'user', text: userText }];
        setMessages(newMessages);
        setLoading(true);

        let response: string;
        if (product) {
            response = await sendMessageToAI(userText, product, newMessages.slice(1), profile, constraints);
        } else {
            response = await sendGeneralMessageToAI(
                userText,
                newMessages.slice(1),
                profile,
                constraints,
                connections,
                pantryContext || undefined,
            );
        }
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        setLoading(false);
    }, [input, loading, messages, product, profile, constraints, connections, pantryContext]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    const isBeauty = product?.category === 'beauty';
    const primaryColor = isGeneralChat ? '#7C3AED' : (isBeauty ? '#E91E63' : Colors.primary);
    const connCount = Object.keys(connections).length;

    const suggestedQuestions = isGeneralChat ? [
        'What should I cook with my pantry items today?',
        profile?.conditions?.includes('diabetes')
            ? 'What foods should I avoid with diabetes?'
            : 'Give me a healthy meal plan for today',
        connections.zepto ? 'Order fresh vegetables from Zepto' : 'Help me plan my grocery list',
        connections.zomato ? 'Find a healthy restaurant near me' : 'What are high-protein meal ideas?',
    ] : [
        profile?.conditions?.includes('diabetes') ? 'Is this safe for a diabetic?' : 'Is this a healthy choice?',
        'What are the high-risk additives?',
        'How much should I eat per day?',
        profile?.goals?.includes('weight_loss') ? 'Will this help me lose weight?' : 'What nutrients does this provide?',
    ];

    return (
        <KeyboardAvoidingView
            style={styles.wrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
            {/* Header */}
            <View style={[styles.header, { backgroundColor: primaryColor }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={styles.avatarCircle}>
                    {isGeneralChat ? <Brain color="#fff" size={20} /> : <Sparkles color="#fff" size={20} />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerName}>TIA – AI Assistant</Text>
                    <Text style={styles.headerSub}>
                        {product
                            ? `Analysing: ${product.name}`
                            : connCount > 0
                                ? `${connCount} service${connCount > 1 ? 's' : ''} connected · Pantry · Ordering`
                                : 'Pantry · Nutrition · Recipes'}
                    </Text>
                </View>
                {/* Connect nudge for general chat with no connections */}
                {isGeneralChat && connCount === 0 && (
                    <TouchableOpacity
                        style={styles.connectNudge}
                        onPress={() => navigation.navigate('AIAssistants')}
                    >
                        <Text style={styles.connectNudgeText}>Connect</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: Spacing.md, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
            >
                {messages.map((msg, i) => (
                    <View key={i} style={[styles.msgRow, msg.role === 'user' ? styles.rowUser : styles.rowBot]}>
                        {msg.role === 'model' && (
                            <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                                {isGeneralChat ? <Brain color="#fff" size={14} /> : <Sparkles color="#fff" size={14} />}
                            </View>
                        )}
                        <View style={[
                            styles.bubble,
                            msg.role === 'user'
                                ? [styles.bubbleUser, { backgroundColor: primaryColor }]
                                : styles.bubbleBot,
                        ]}>
                            <Text style={[
                                styles.msgText,
                                msg.role === 'user' ? styles.msgTextUser : styles.msgTextBot,
                            ]}>
                                {msg.text}
                            </Text>
                        </View>
                    </View>
                ))}

                {loading && (
                    <View style={styles.rowBot}>
                        <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                            {isGeneralChat ? <Brain color="#fff" size={14} /> : <Sparkles color="#fff" size={14} />}
                        </View>
                        <View style={styles.typingDots}>
                            <Text style={styles.typingText}>
                                {product ? `Analysing ${product.name}…` : 'Thinking…'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Suggested questions shown after greeting only */}
                {messages.length === 1 && (
                    <View style={styles.suggestedRow}>
                        {suggestedQuestions.map((q, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[styles.suggestionChip, { borderColor: primaryColor + '60' }]}
                                onPress={() => setInput(q)}
                            >
                                <Text style={[styles.suggestionText, { color: primaryColor }]}>{q}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputBar}>
                <TextInput
                    style={styles.inputField}
                    placeholder={isGeneralChat ? 'Ask about pantry, recipes, orders…' : 'Ask TIA anything…'}
                    placeholderTextColor={Colors.textMuted}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    maxLength={500}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit
                />
                <TouchableOpacity
                    style={[
                        styles.sendBtn,
                        { backgroundColor: primaryColor },
                        (!input.trim() || loading) && { opacity: 0.4 },
                    ]}
                    onPress={handleSend}
                    disabled={!input.trim() || loading}
                >
                    <Send color="#fff" size={18} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: Colors.background },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 44, paddingBottom: 14, paddingHorizontal: Spacing.md, gap: 10,
    },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    avatarCircle: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
    },
    headerName: { fontSize: 16, fontWeight: '800', color: '#fff' },
    headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
    connectNudge: {
        backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full,
        paddingHorizontal: 10, paddingVertical: 5,
    },
    connectNudgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    msgRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8 },
    rowBot: { justifyContent: 'flex-start' },
    rowUser: { justifyContent: 'flex-end' },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    bubble: { maxWidth: '78%', padding: 12, borderRadius: 18 },
    bubbleBot: { backgroundColor: '#fff', borderBottomLeftRadius: 4, ...Shadow.sm },
    bubbleUser: { borderBottomRightRadius: 4 },
    msgText: { fontSize: 14, lineHeight: 21 },
    msgTextBot: { color: Colors.textPrimary },
    msgTextUser: { color: '#fff' },

    typingDots: { backgroundColor: '#fff', borderRadius: 18, padding: 12, ...Shadow.sm },
    typingText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },

    suggestedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    suggestionChip: {
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full,
        borderWidth: 1, backgroundColor: '#fff',
    },
    suggestionText: { fontSize: 12, fontWeight: '700' },

    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        padding: Spacing.md, backgroundColor: '#fff',
        borderTopWidth: 1, borderTopColor: Colors.border, gap: 10,
    },
    inputField: {
        flex: 1, backgroundColor: Colors.background, borderRadius: Radius.lg,
        paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
        color: Colors.textPrimary, maxHeight: 100,
    },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
