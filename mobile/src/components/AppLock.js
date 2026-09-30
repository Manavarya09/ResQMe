import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui';
import { colors } from '../theme';

// Biometric gate (opt-in in Settings). Emergency calling stays one tap away even while locked.
export default function AppLock({ children }) {
  const { settings, token, ready } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const needsLock = ready && token && settings.biometricLock && Platform.OS !== 'web';

  const unlock = useCallback(async () => {
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) return setUnlocked(true);
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock ResQMe' });
      if (res.success) setUnlocked(true);
    } catch {
      setUnlocked(true);
    }
  }, []);

  useEffect(() => {
    if (needsLock && !unlocked) unlock();
  }, [needsLock, unlocked, unlock]);

  if (!needsLock || unlocked) return children;
  return (
    <View style={{ flex: 1, backgroundColor: colors.base, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Fingerprint color={colors.primary} size={64} />
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textStrong, marginTop: 16 }}>ResQMe is locked</Text>
      <Text style={{ color: colors.sub, marginTop: 6, marginBottom: 24, textAlign: 'center' }}>Unlock with biometrics to continue.</Text>
      <Button title="Unlock" onPress={unlock} />
    </View>
  );
}
