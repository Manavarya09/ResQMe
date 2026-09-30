import React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Siren, Map, Bot, HeartPulse, Settings, ListChecks } from 'lucide-react-native';

import { navigationRef } from './src/navigation/ref';
import { useAuth } from './src/context/AuthContext';
import { colors } from './src/theme';

import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import ChatScreen from './src/screens/ChatScreen';
import MedicalIDScreen from './src/screens/MedicalIDScreen';
import MedicalEditScreen from './src/screens/MedicalEditScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import SecurityScreen from './src/screens/SecurityScreen';
import IncidentScreen from './src/screens/IncidentScreen';
import TrainingScreen from './src/screens/TrainingScreen';
import TrainingDetailScreen from './src/screens/TrainingDetailScreen';
import OnboardingScreen from './src/screens/onboarding';
import ProfileScreen from './src/screens/ProfileScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import IncidentDetailScreen from './src/screens/IncidentDetailScreen';
import SafetyToolsScreen from './src/screens/SafetyToolsScreen';
import { useShakeSOS } from './src/hooks/useShakeSOS';
import { ResponderIncidentsProvider } from './src/hooks/useResponderIncidents';
import QueueScreen from './src/screens/responder/QueueScreen';
import ResponderMapScreen from './src/screens/responder/ResponderMapScreen';
import ResponderIncidentScreen from './src/screens/responder/ResponderIncidentScreen';
import NewIncidentBanner from './src/screens/responder/NewIncidentBanner';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.base, primary: colors.primary } };

const TABS = [
  { name: 'Home', component: HomeScreen, label: 'SOS', icon: Siren },
  { name: 'Map', component: MapScreen, label: 'Map', icon: Map },
  { name: 'Chat', component: ChatScreen, label: 'AI Guide', icon: Bot },
  { name: 'Medical', component: MedicalIDScreen, label: 'Medical ID', icon: HeartPulse },
  { name: 'Settings', component: SettingsScreen, label: 'Settings', icon: Settings },
];

// Responders get an operations console instead of the personal-safety tabs.
const RESPONDER_TABS = [
  { name: 'Queue', component: QueueScreen, label: 'Queue', icon: ListChecks },
  { name: 'ResponderMap', component: ResponderMapScreen, label: 'Map', icon: Map },
  { name: 'Settings', component: SettingsScreen, label: 'Settings', icon: Settings },
];

function ShakeListener() {
  // Mounted with the user tabs for the whole signed-in session, so shake-to-SOS is always listening.
  useShakeSOS();
  return null;
}

function Tabs() {
  return (
    <>
      <ShakeListener />
      <TabBar tabs={TABS} />
    </>
  );
}

function ResponderTabs() {
  return <TabBar tabs={RESPONDER_TABS} />;
}

function TabBar({ tabs }) {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'Manrope_800ExtraBold' },
        tabBarStyle: {
          backgroundColor: colors.base,
          borderTopWidth: 1,
          borderTopColor: '#ffffff',
          height: 62 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
          ...(Platform.OS === 'web' ? { boxShadow: '0 -6px 20px rgba(163,177,198,0.35)' } : { elevation: 16 }),
        },
      }}
    >
      {tabs.map(({ name, component, label, icon: Icon }) => (
        <Tab.Screen
          key={name}
          name={name}
          component={component}
          options={{ tabBarLabel: label, tabBarIcon: ({ color, size }) => <Icon color={color} size={size - 2} /> }}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, ready, needsOnboarding, user } = useAuth();
  const isResponder = !!token && user?.role === 'responder';
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.base }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  const tree = (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }}>
        {!token ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : needsOnboarding && !isResponder ? (
          <>
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
            {/* An SOS or crash during onboarding must still open the incident screen. */}
            <Stack.Screen name="Incident" component={IncidentScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
          </>
        ) : (
          <>
            {isResponder ? (
              <>
                <Stack.Screen name="ResponderTabs" component={ResponderTabs} />
                <Stack.Screen name="ResponderIncident" component={ResponderIncidentScreen} options={{ animation: 'slide_from_right' }} />
                {/* Settings links to the Medical ID, which is a tab for regular users */}
                <Stack.Screen name="Medical" component={MedicalIDScreen} options={{ animation: 'slide_from_right' }} />
              </>
            ) : (
              <Stack.Screen name="Tabs" component={Tabs} />
            )}
            <Stack.Screen name="Incident" component={IncidentScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="Training" component={TrainingScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="TrainingDetail" component={TrainingDetailScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="MedicalEdit" component={MedicalEditScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Contacts" component={ContactsScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Security" component={SecurityScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="SafetyTools" component={SafetyToolsScreen} options={{ animation: 'slide_from_right' }} />
          </>
        )}
      </Stack.Navigator>
      {isResponder ? <NewIncidentBanner /> : null}
    </NavigationContainer>
  );
  // one live queue (and socket subscription) for the whole responder session
  return isResponder ? <ResponderIncidentsProvider key={user.id}>{tree}</ResponderIncidentsProvider> : tree;
}
