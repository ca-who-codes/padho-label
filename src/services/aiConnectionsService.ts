import AsyncStorage from '@react-native-async-storage/async-storage';

export type AIAssistantId = 'claude' | 'zomato' | 'zepto';

export type ClaudeConnection = {
    type: 'claude';
    apiKey: string;
    connectedAt: number;
};

export type ZomatoConnection = {
    type: 'zomato';
    phoneNumber: string;
    connectedAt: number;
};

export type ZeptoConnection = {
    type: 'zepto';
    phoneNumber: string;
    connectedAt: number;
};

export type AIConnection = ClaudeConnection | ZomatoConnection | ZeptoConnection;

export type AIConnectionsMap = {
    claude?: ClaudeConnection;
    zomato?: ZomatoConnection;
    zepto?: ZeptoConnection;
};

const CONNECTIONS_KEY = '@padho_ai_connections';

export const getAIConnections = async (): Promise<AIConnectionsMap> => {
    try {
        const json = await AsyncStorage.getItem(CONNECTIONS_KEY);
        return json ? JSON.parse(json) : {};
    } catch {
        return {};
    }
};

export const connectAI = async (connection: AIConnection): Promise<void> => {
    const connections = await getAIConnections();
    (connections as any)[connection.type] = connection;
    await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
};

export const disconnectAI = async (type: AIAssistantId): Promise<void> => {
    const connections = await getAIConnections();
    delete (connections as any)[type];
    await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
};

export const isAIConnected = async (type: AIAssistantId): Promise<boolean> => {
    const connections = await getAIConnections();
    return !!(connections as any)[type];
};

export const getConnectionCount = async (): Promise<number> => {
    const connections = await getAIConnections();
    return Object.keys(connections).length;
};
