import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, ScrollView,
    TouchableOpacity, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Colors, Spacing, Radius, Shadow } from '../theme';
import { Send, ArrowLeft, Sparkles } from 'lucide-react-native';
import { sendMessageToAI, ChatMessage } from '../services/chatService';
import { getUserProfile, getHealthConstraints } from '../services/userProfileService';
import { UserProfile, HealthConstraints } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ route, navigation }: Props) {
    const product = route.params?.product ?? undefined;
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [constraints, setConstraints] = useState<HealthConstraints | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    useEffect(() => {
        getUserProfile().then(p => {
            setProfile(p);
            const greeting = p
                ? `Hi ${p.name}! 👋 I'm TIA, your Padho Label nutrition coach. ${product ? `I've analysed **${product.name}** for you.` : "I'm here to help you with your nutrition goals."} Ask me anything!`
                : `Hi! 👋 I'm TIA, your Padho Label nutrition coach. ${product ? `I've analysed **${product.name}**.` : "How can I help you today?"}`;
            setMessages([{ role: 'model', text: greeting }]);
        });
        getHealthConstraints().then(setConstraints);
    }, [product?.name]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || loading) return;
        const userText = input.trim();
        setInput('');
        const newMessages: ChatMessage[] = [...messages, { role: 'user', text: userText }];
        setMessages(newMessages);
        setLoading(true);
        const dummyProduct = { barcode: 'general', name: 'General Query', nutrition: {} as any, scannedAt: Date.now() };
        const response = await sendMessageToAI(userText, product || dummyProduct, newMessages.slice(1), profile, constraints);
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        setLoading(false);
    }, [input, loading, messages, product, profile, constraints]);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    const isBeauty = product?.category === 'beauty';
    const primaryColor = isBeauty ? '#E91E63' : Colors.primary;

    const suggestedQuestions = product
        ? [
            profile?.conditions?.includes('diabetes') ? 'Is this safe for a diabetic?' : 'Is this a healthy choice?',
            'What are the high-risk additives?',
            'How much should I eat per day?',
            profile?.goals?.includes('weight_loss') ? 'Will this help me lose weight?' : 'What nutrients does this provide?',
        ]
        : [
            'What should I look for on food labels?',
            'How much sugar is too much per day?',
            'What are the worst food additives?',
            profile?.goals?.includes('weight_loss') ? 'Best snacks for weight loss?' : 'How to read a Nutri-Score?',
        ];

    return (
        <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: primaryColor }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <View style={styles.avatarCircle}>
                    <Sparkles color="#fff" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerName}>TIA – Nutrition Coach</Text>
                    <Text style={styles.headerSub}>{product ? `Analysing: ${product.name}` : 'Your health assistant'}</Text>
                </View>
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
                                <Sparkles color="#fff" size={14} />
                            </View>
                        )}
                        <View style={[styles.bubble, msg.role === 'user' ? [styles.bubbleUser, { backgroundColor: primaryColor }] : styles.bubbleBot]}>
                            <Text style={[styles.msgText, msg.role === 'user' ? styles.msgTextUser : styles.msgTextBot]}>{msg.text}</Text>
                        </View>
                    </View>
                ))}

                {loading && (
                    <View style={[styles.msgRow, styles.rowBot]}>
                        <View style={[styles.avatar, { backgroundColor: primaryColor }]}><Sparkles color="#fff" size={14} /></View>
                        <View style={[styles.bubble, styles.bubbleBot]}>
                            <Text style={[styles.msgText, styles.msgTextBot]}>Thinking...</Text>
                        </View>
                    </View>
                )}

                {/* Suggested questions (shown only after first greeting) */}
                {messages.length === 1 && (
                    <View style={styles.suggestedRow}>
                        {suggestedQuestions.map((q, i) => (
                            <TouchableOpacity key={i} style={[styles.suggestionChip, { borderColor: primaryColor + '60' }]} onPress={() => { setInput(q); }}>
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
                    placeholder="Ask TIA anything…"
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
                    style={[styles.sendBtn, { backgroundColor: primaryColor }, (!input.trim() || loading) && { opacity: 0.4 }]}
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
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 44, paddingBottom: 14, paddingHorizontal: Spacing.md, gap: 10 },
    headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    headerName: { fontSize: 16, fontWeight: '800', color: '#fff' },
    headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 },

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
    suggestionChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, backgroundColor: '#fff' },
    suggestionText: { fontSize: 12, fontWeight: '700' },

    inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.md, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
    inputField: { flex: 1, backgroundColor: Colors.background, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: Colors.textPrimary, maxHeight: 100 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
