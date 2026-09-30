import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, Platform } from 'react-native';
import Navigation from './Navigation';
import { AuthProvider } from './src/context/AuthContext';
import { LocationProvider } from './src/context/LocationContext';
import { EmergencyProvider } from './src/context/EmergencyContext';
import { TrackingProvider } from './src/context/TrackingContext';
import AppLock from './src/components/AppLock';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#dfe3eb' : undefined }}>
      {/* On desktop browsers, present the app in a phone-width column; on devices this is a no-op. */}
      <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', overflow: 'hidden', boxShadow: '0 0 40px rgba(15,23,42,0.18)' } : { flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <AppLock>
            <LocationProvider>
              <EmergencyProvider>
                <TrackingProvider>
                  <Navigation />
                </TrackingProvider>
              </EmergencyProvider>
            </LocationProvider>
          </AppLock>
        </AuthProvider>
      </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
