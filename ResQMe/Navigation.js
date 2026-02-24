import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { Home, HeartPulse, Map, Settings, ShieldAlert, User } from 'lucide-react-native';
import { View } from 'react-native';

import CrisisSupportScreen from './screens/CrisisSupportScreen';
import MedicalIDScreen from './screens/MedicalIDScreen';
import TactileTrackingScreen from './screens/TactileTrackingScreen';
import SafetySettingsScreen from './screens/SafetySettingsScreen';

const Tab = createBottomTabNavigator();

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#eef0f5', // bg-base
            borderTopWidth: 0,
            elevation: 0,
            height: 60,
            paddingBottom: 10,
          },
          tabBarActiveTintColor: '#f48c25', // primary
          tabBarInactiveTintColor: '#6b7280', // text-sub
        }}
      >
        <Tab.Screen
          name="CrisisSupport"
          component={CrisisSupportScreen}
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Home color={color} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="MedicalID"
          component={MedicalIDScreen}
          options={{
            tabBarLabel: 'Medical ID',
            tabBarIcon: ({ color, size }) => (
              <HeartPulse color={color} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="TactileTracking"
          component={TactileTrackingScreen}
          options={{
            tabBarLabel: 'Tracking',
            tabBarIcon: ({ color, size }) => (
              <Map color={color} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="SafetySettings"
          component={SafetySettingsScreen}
          options={{
            tabBarLabel: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <User color={color} size={size} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
