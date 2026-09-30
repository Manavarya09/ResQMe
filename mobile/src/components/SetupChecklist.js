import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Smartphone, Users, HeartPulse, MapPin, Activity, Check, ChevronRight } from 'lucide-react-native';
import { Text } from './Text';
import { Card, PressScale } from './ui';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { useMedical } from '../hooks/useMedical';
import { api } from '../lib/api';
import { colors, raised, inset } from '../theme';

// "Finish your safety setup" card for the Home screen. Shows N/5 done with one-tap fixes and hides
// itself once everything is in place. `onNavigate(routeName)` opens the relevant screen.
export default function SetupChecklist({ onNavigate, className = 'mx-5 mt-4' }) {
  const { user, settings, updateSettings } = useAuth();
  const { permission, retry } = useLocation();
  const { medical, loading: medicalLoading } = useMedical();
  const [contacts, setContacts] = useState(undefined); // undefined = loading, null = unknown (offline)

  // Re-check contacts whenever the screen regains focus (e.g. back from the Contacts editor).
  useFocusEffect(
    useCallback(() => {
      let live = true;
      api.contacts()
        .then((l) => live && setContacts(l?.length || 0))
        .catch(() => live && setContacts((c) => (c === undefined ? null : c)));
      return () => { live = false; };
    }, [])
  );

  if (!user || contacts === undefined || medicalLoading) return null;

  const items = [
    { key: 'phone', icon: Smartphone, title: 'Add your phone number', hint: 'So responders can call you back', ok: !!user.phone, onPress: () => onNavigate?.('Profile') },
    { key: 'contacts', icon: Users, title: 'Add an emergency contact', hint: 'We text them your live location', ok: contacts == null ? null : contacts > 0, onPress: () => onNavigate?.('Contacts') },
    { key: 'medical', icon: HeartPulse, title: 'Create your medical ID', hint: 'Blood type, allergies, conditions', ok: !!medical, onPress: () => onNavigate?.('MedicalEdit') },
    {
      key: 'location', icon: MapPin, title: 'Allow location access', ok: permission === 'granted',
      hint: permission === 'denied' ? 'Blocked — enable it in system settings' : 'Pinpoints you for responders',
      onPress: () => (permission === 'denied' ? onNavigate?.('Settings') : retry?.()),
    },
    { key: 'crash', icon: Activity, title: 'Turn on crash detection', hint: 'Auto-alerts after a hard fall', ok: !!settings.impactDetection, onPress: () => updateSettings({ impactDetection: true }) },
  ].filter((i) => i.ok !== null);

  const done = items.filter((i) => i.ok).length;
  if (done === items.length) return null;

  return (
    <View className={className}>
      <Card className="p-4" depth={0.8}>
        <View className="flex-row items-center justify-between px-1">
          <View className="flex-1 pr-3">
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-primary">Safety setup</Text>
            <Text className="text-[17px] font-extrabold text-slate-800 mt-0.5">Finish protecting yourself</Text>
          </View>
          <Text className="text-2xl font-extrabold text-slate-800" style={{ fontVariant: ['tabular-nums'] }}>
            {done}<Text className="text-sm font-extrabold text-slate-400">{`/${items.length}`}</Text>
          </Text>
        </View>
        <View className="flex-row gap-1.5 mt-3 mb-2 px-1">
          {items.map((i) => (
            <View key={i.key} className="flex-1 h-1.5 rounded-full" style={i.ok ? { backgroundColor: colors.primary } : inset()} />
          ))}
        </View>
        {items.map((i, idx) => (
          <PressScale key={i.key} onPress={i.ok ? undefined : i.onPress} disabled={i.ok} accessibilityLabel={i.title}>
            <View className={`flex-row items-center gap-3 py-3 px-1 ${idx < items.length - 1 ? 'border-b border-slate-200/70' : ''}`}>
              <View className="w-9 h-9 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.35)}>
                <i.icon color={i.ok ? colors.muted : colors.primary} size={16} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-bold ${i.ok ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{i.title}</Text>
                {!i.ok ? <Text className="text-[11px] text-slate-400 font-medium mt-0.5">{i.hint}</Text> : null}
              </View>
              {i.ok ? (
                <View className="w-6 h-6 rounded-full bg-green-600 items-center justify-center"><Check color="#fff" size={13} /></View>
              ) : (
                <ChevronRight color={colors.muted} size={18} />
              )}
            </View>
          </PressScale>
        ))}
      </Card>
    </View>
  );
}
