import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { Home, Search, Camera, Package, User } from 'lucide-react-native';

import HomeScanScreen from './src/screens/HomeScanScreen';
import ScanScreen from './src/screens/ScanScreen';
import ResultScreen from './src/screens/ResultScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import IngredientsSnap from './src/screens/IngredientsSnap';
import ChatScreen from './src/screens/ChatScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import PantryScreen from './src/screens/PantryScreen';
import ChallengesScreen from './src/screens/ChallengesScreen';
import ProfileScreen from './src/screens/ProfileScreen';

import { RootStackParamList } from './src/types';
import { Colors } from './src/theme';
import { isOnboardingDone } from './src/services/userProfileService';

import { AuthScreen } from './src/screens/AuthScreen';
import AIAssistantsScreen from './src/screens/AIAssistantsScreen';
import { supabase } from './src/services/supabaseClient';
import { Session } from '@supabase/supabase-js';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// ─── Bottom Tab Navigator ──────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
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
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          if (route.name === 'Home') return <Home color={color} size={22} />;
          if (route.name === 'Discover') return <Search color={color} size={22} />;
          if (route.name === 'Scan') return <Camera color={color} size={22} />;
          if (route.name === 'Pantry') return <Package color={color} size={22} />;
          if (route.name === 'Profile') return <User color={color} size={22} />;
          return <View />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScanScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Discover" component={LeaderboardScreen} options={{ tabBarLabel: 'Discover' }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{
        tabBarIcon: ({ color }: { color: string }) => (
          <View style={{
            backgroundColor: Colors.primary,
            width: 52, height: 52, borderRadius: 26,
            alignItems: 'center', justifyContent: 'center',
            marginTop: -16,
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
          }}>
            <Camera color="#fff" size={26} />
          </View>
        ),
        tabBarLabel: () => null,
      }} />
      <Tab.Screen name="Pantry" component={PantryScreen} options={{ tabBarLabel: 'Pantry' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

// ─── Root Stack (Modals + Onboarding) ─────────────────────────────────────

export default function App() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    // 1. Check onboarding
    isOnboardingDone().then(done => {
      setShowOnboarding(!done);
      setOnboardingChecked(true);
    });

    // 2. Initial Session Check — must complete before first render to avoid Auth flash
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setSessionChecked(true);
    });

    // 3. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hold render until both onboarding and session are resolved to prevent Auth flash
  if (!onboardingChecked || !sessionChecked) return null;

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName={!session ? 'Auth' : (showOnboarding ? 'Onboarding' : 'MainTabs')}
        screenOptions={{ headerShown: false }}
      >
        {!session ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            {/* Modal stack screens */}
            <Stack.Screen name="Result" component={ResultScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="IngredientsSnap" component={IngredientsSnap} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ headerShown: true, title: 'Scan History', headerStyle: { backgroundColor: '#fff' }, headerTintColor: Colors.textPrimary }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Settings', headerStyle: { backgroundColor: '#fff' }, headerTintColor: Colors.textPrimary }} />
            <Stack.Screen name="Challenges" component={ChallengesScreen} />
            <Stack.Screen name="AIAssistants" component={AIAssistantsScreen} options={{ headerShown: false }} />
            {/* Aliases for tab screens that may be navigated to directly */}
            <Stack.Screen name="Home" component={HomeScanScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Scan" component={ScanScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Pantry" component={PantryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
