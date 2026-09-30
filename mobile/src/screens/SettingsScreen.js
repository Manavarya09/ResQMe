import React, { useEffect, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import Text from '../components/Text';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  ShieldCheck, Mail, Smartphone, Lock, Satellite, Fingerprint, LogOut, Activity, MapPin, Bell, HeartPulse, Users,
  ChevronRight, Globe, Server, GraduationCap, Volume2, Zap, UserRound, History,
} from 'lucide-react-native';
import { Screen, Header, Card, Inset, ToggleRow, SectionLabel, PressScale, Pill, Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useEmergency } from '../context/EmergencyContext';
import { api } from '../lib/api';
import { COUNTRIES } from '../lib/dialCodes';
import { API_BASE } from '../config';
import { colors, raised } from '../theme';

const SENS = [
  { key: 'low', label: 'Low', hint: 'Severe crashes only' },
  { key: 'medium', label: 'Balanced', hint: 'Recommended' },
  { key: 'high', label: 'High', hint: 'Catches softer falls' },
];

export default function SettingsScreen({ navigation }) {
  const { user, settings, updateSettings, updateProfile, logout } = useAuth();
  const { sensorsActive, simulateImpact } = useEmergency();
  const [health, setHealth] = useState(null);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
    if (Platform.OS !== 'web') LocalAuthentication.hasHardwareAsync().then(setBioAvailable).catch(() => {});
  }, []);

  return (
    <Screen>
      <Header title="Safety settings" subtitle="Detection, privacy and contacts" />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Profile */}
        <Card className="items-center mb-2">
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-3">
            <Text className="text-white text-3xl font-black">{(user?.name || '?')[0].toUpperCase()}</Text>
          </View>
          <Text className="text-2xl font-extrabold text-slate-800">{user?.name}</Text>
          <Text className="text-[11px] font-extrabold tracking-widest text-slate-400 mt-1 uppercase">ID: {String(user?.id || '').slice(0, 8)}</Text>
          <View className="mt-3"><Pill label={user?.role === 'responder' ? 'Verified responder' : 'Protected'} color={colors.green} /></View>
        </Card>

        <SectionLabel>Account & security</SectionLabel>
        <Inset className="p-0">
          <LinkRow icon={UserRound} title="Edit profile" onPress={() => navigation.navigate('Profile')} />
          <Row icon={Mail} title="Email" value={user?.email} />
          <Row icon={Smartphone} title="Phone" value={user?.phone || 'Not set'} />
          <Row icon={Lock} title="Data encryption" value="AES-256-GCM active" valueColor={colors.green} />
          <LinkRow icon={ShieldCheck} title={`Security & privacy · 2FA ${user?.mfaEnabled ? 'on' : 'off'}`} onPress={() => navigation.navigate('Security')} last />
        </Inset>

        <SectionLabel>Crash & fall detection</SectionLabel>
        <Inset className="p-0">
          <ToggleRow
            icon={Activity}
            title="Impact detection"
            subtitle={sensorsActive ? 'Armed — monitoring motion sensors' : Platform.OS === 'web' ? 'Sensors unavailable in browser' : 'Off'}
            value={settings.impactDetection}
            onValueChange={(v) => updateSettings({ impactDetection: v })}
          />
          <View className="px-3 py-3">
            <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">Sensitivity</Text>
            <View className="flex-row gap-2">
              {SENS.map((s) => (
                <PressScale key={s.key} onPress={() => updateSettings({ sensitivity: s.key })} style={{ flex: 1 }}>
                  <View className={`rounded-xl py-2.5 items-center ${settings.sensitivity === s.key ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                    <Text className={`text-xs font-extrabold ${settings.sensitivity === s.key ? 'text-white' : 'text-slate-600'}`}>{s.label}</Text>
                    <Text className={`text-[9px] font-semibold ${settings.sensitivity === s.key ? 'text-orange-100' : 'text-slate-400'}`}>{s.hint}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          </View>
          <PressScale onPress={simulateImpact}>
            <View className="flex-row items-center gap-3 px-3 py-3.5 border-t border-slate-200/70">
              <Zap color={colors.primary} size={18} />
              <Text className="text-sm font-bold text-primary flex-1">Test: simulate a fall</Text>
              <ChevronRight color={colors.muted} size={18} />
            </View>
          </PressScale>
        </Inset>

        <SectionLabel>Privacy & alerts</SectionLabel>
        <Inset className="p-0">
          <ToggleRow icon={MapPin} title="Share live location" subtitle="With responders only during an active emergency" value={settings.shareLocation} onValueChange={(v) => updateSettings({ shareLocation: v })} />
          <ToggleRow icon={HeartPulse} title="Auto-transmit medical ID" subtitle="Attach to alerts for pre-arrival treatment" value={settings.shareMedical} onValueChange={(v) => updateSettings({ shareMedical: v })} />
          <ToggleRow icon={Bell} title="Crime & climate alerts" subtitle="Notify me about nearby hazards" value={settings.hazardAlerts} onValueChange={(v) => updateSettings({ hazardAlerts: v })} />
          <ToggleRow icon={Volume2} title="Read AI replies aloud" subtitle="Hands-free guidance" value={settings.speakReplies} onValueChange={(v) => updateSettings({ speakReplies: v })} last />
        </Inset>

        <SectionLabel>Emergency setup</SectionLabel>
        <Inset className="p-0">
          <LinkRow icon={Users} title="Emergency contacts" onPress={() => navigation.navigate('Contacts')} />
          <LinkRow icon={HeartPulse} title="Medical ID" onPress={() => navigation.navigate('Medical')} />
          <LinkRow icon={History} title="Incident history" onPress={() => navigation.navigate('History')} />
          <LinkRow icon={GraduationCap} title="First-aid training" onPress={() => navigation.navigate('Training')} last />
        </Inset>

        <SectionLabel>Quick-dial region</SectionLabel>
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(COUNTRIES).map(([code, c]) => (
            <PressScale key={code} onPress={() => updateProfile({ country: code })}>
              <View className={`flex-row items-center gap-1.5 px-3 h-10 rounded-xl ${user?.country === code ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                <Text>{c.flag}</Text>
                <Text className={`text-xs font-extrabold ${user?.country === code ? 'text-white' : 'text-slate-600'}`}>{c.name} · {c.primary}</Text>
              </View>
            </PressScale>
          ))}
        </View>

        <SectionLabel>Advanced connectivity</SectionLabel>
        <Inset className="p-0">
          <ToggleRow icon={Satellite} title="Satellite fallback" subtitle="Future phase — Starlink / satellite SOS" value={settings.satelliteFallback} onValueChange={(v) => updateSettings({ satelliteFallback: v })} />
          <ToggleRow
            icon={Fingerprint}
            title="Biometric app lock"
            subtitle={Platform.OS === 'web' ? 'Available on the mobile app' : bioAvailable ? 'Face ID / fingerprint on open' : 'No biometric hardware found'}
            value={settings.biometricLock}
            disabled={Platform.OS === 'web' || !bioAvailable}
            onValueChange={(v) => updateSettings({ biometricLock: v })}
            last
          />
        </Inset>

        <SectionLabel>System</SectionLabel>
        <Inset className="p-0">
          <Row icon={Server} title="ResQMe cloud" value={health == null ? 'Checking…' : health.ok ? `Online${health.ai ? ' · AI ready' : ' · AI offline'}` : 'Unreachable'} valueColor={health?.ok ? colors.green : colors.red} />
          <Row icon={Globe} title="Server" value={API_BASE.replace(/^https?:\/\//, '')} last />
        </Inset>

        <View className="mt-8">
          <Button title="Sign out" variant="ghost" icon={LogOut} onPress={logout} />
        </View>
        <View className="flex-row items-center justify-center gap-1.5 mt-5">
          <ShieldCheck color={colors.muted} size={12} />
          <Text className="text-[10px] text-slate-400 font-semibold">ResQMe v1.0 · AI supports, never replaces, emergency services</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({ icon: Icon, title, value, valueColor, last }) {
  return (
    <View className={`flex-row items-center gap-3 py-3.5 px-3 ${last ? '' : 'border-b border-slate-200/70'}`}>
      <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
        <Icon color={colors.primary} size={18} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-slate-700">{title}</Text>
        <Text className="text-[11px] font-semibold mt-0.5" style={{ color: valueColor || colors.muted }} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function LinkRow({ icon: Icon, title, onPress, last }) {
  return (
    <PressScale onPress={onPress}>
      <View className={`flex-row items-center gap-3 py-3.5 px-3 ${last ? '' : 'border-b border-slate-200/70'}`}>
        <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
          <Icon color={colors.primary} size={18} />
        </View>
        <Text className="text-sm font-bold text-slate-700 flex-1">{title}</Text>
        <ChevronRight color={colors.muted} size={18} />
      </View>
    </PressScale>
  );
}
