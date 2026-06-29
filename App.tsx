import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Home, Camera, Package, User, Clock } from 'lucide-react-native';

import HomeScanScreen from './src/screens/HomeScanScreen';
import ScanScreen from './src/screens/ScanScreen';
import ResultScreen from './src/screens/ResultScreen';
import CompareScreen from './src/screens/CompareScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import IngredientsSnap from './src/screens/IngredientsSnap';
import OnboardingScreen from './src/screens/OnboardingScreen';
import PantryScreen from './src/screens/PantryScreen';
import ProfileScreen from './src/screens/ProfileScreen';

import { RootStackParamList } from './src/types';
import { Colors } from './src/theme';
import { isOnboardingDone } from './src/services/userProfileService';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootStackParamList>();

// ─── Bottom Tab Navigator ──────────────────────────────────────────────────

function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textMuted,
                tabBarStyle: {
                    backgroundColor: '#fff',
                    borderTopWidth: 1,
                    borderTopColor: Colors.border,
                    paddingBottom: 8,
                    paddingTop: 6,
                    height: 64,
                },
                tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScanScreen}
                options={{
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color }) => <Home color={color} size={22} />,
                }}
            />
            <Tab.Screen
                name="History"
                component={HistoryScreen}
                options={{
                    tabBarLabel: 'History',
                    tabBarIcon: ({ color }) => <Clock color={color} size={22} />,
                }}
            />
            <Tab.Screen
                name="Scan"
                component={ScanScreen}
                options={{
                    tabBarLabel: () => null,
                    tabBarIcon: () => (
                        <View
                            style={{
                                backgroundColor: Colors.primary,
                                width: 52,
                                height: 52,
                                borderRadius: 26,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: -16,
                                shadowColor: Colors.primary,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.4,
                                shadowRadius: 8,
                                elevation: 8,
                            }}
                        >
                            <Camera color="#fff" size={26} />
                        </View>
                    ),
                }}
            />
            <Tab.Screen
                name="Pantry"
                component={PantryScreen}
                options={{
                    tabBarLabel: 'Pantry',
                    tabBarIcon: ({ color }) => <Package color={color} size={22} />,
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarLabel: 'Profile',
                    tabBarIcon: ({ color }) => <User color={color} size={22} />,
                }}
            />
        </Tab.Navigator>
    );
}

// ─── Root Stack ──────────────────────────────────────────────────────────────

export default function App() {
    const [ready, setReady] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        isOnboardingDone().then(done => {
            setShowOnboarding(!done);
            setReady(true);
        });
    }, []);

    // Hold first render until we know whether onboarding is needed (avoids a flash).
    if (!ready) return null;

    return (
        <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator
                initialRouteName={showOnboarding ? 'Onboarding' : 'MainTabs'}
                screenOptions={{ headerShown: false }}
            >
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                <Stack.Screen name="MainTabs" component={MainTabs} />
                {/* Detail / modal screens */}
                <Stack.Screen name="Result" component={ResultScreen} />
                <Stack.Screen name="Compare" component={CompareScreen} />
                <Stack.Screen
                    name="IngredientsSnap"
                    component={IngredientsSnap}
                    options={{ animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{
                        headerShown: true,
                        title: 'Settings',
                        headerStyle: { backgroundColor: '#fff' },
                        headerTintColor: Colors.textPrimary,
                    }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
