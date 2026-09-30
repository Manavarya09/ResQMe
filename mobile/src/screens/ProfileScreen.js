import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Mail, Lock, Save, Check } from 'lucide-react-native';
import { Text } from '../components/Text';
import { Screen, Header, Card, Field, Button, SectionLabel, Inset } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { colors, raised } from '../theme';

const PHONE_RE = /^[+\d][\d\s-]{5,}$/;

export default function ProfileScreen({ navigation }) {
  const { user, refreshUser, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== (user?.name || '') || phone.trim() !== (user?.phone || '');

  const save = async () => {
    if (!name.trim()) return setErr('Name can’t be empty.');
    if (phone.trim() && !PHONE_RE.test(phone.trim())) return setErr('Enter a valid phone number, e.g. +91 98765 43210.');
    setErr(null);
    setBusy(true);
    const patch = { name: name.trim(), phone: phone.trim() || null };
    try {
      // Save straight to the server first so we can tell the user if it didn't stick…
      await api.updateMe(patch);
      await refreshUser();
      setSaved(true);
      setTimeout(() => navigation.goBack(), 600);
    } catch (e) {
      // …but never lose their edit: keep it locally and let it sync on the next change.
      await updateProfile(patch);
      setErr(e.status === 0 ? 'Saved on this device — it will sync when you’re back online.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const initial = (name || user?.name || '?').trim()[0]?.toUpperCase() || '?';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Your profile" subtitle="Shared with responders during an alert" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card className="items-center mb-2">
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-3" style={raised(0.5)}>
              <Text className="text-white text-3xl font-black">{initial}</Text>
            </View>
            <Text className="text-xl font-extrabold text-slate-800" numberOfLines={1}>{name.trim() || 'Your name'}</Text>
            <Text className="text-[11px] font-extrabold tracking-widest text-slate-400 mt-1 uppercase">ID: {String(user?.id || '').slice(0, 8)}</Text>
          </Card>

          <SectionLabel>Details</SectionLabel>
          {err ? (
            <View className={`rounded-2xl px-4 py-3 mb-4 border ${err.startsWith('Saved') ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
              <Text className={`text-xs font-bold ${err.startsWith('Saved') ? 'text-orange-800' : 'text-accent-red'}`}>{err}</Text>
            </View>
          ) : null}
          <Field label="Full name" value={name} onChangeText={(v) => { setName(v); setSaved(false); }} placeholder="Your name" autoComplete="name" textContentType="name" />
          <Field label="Mobile number" value={phone} onChangeText={(v) => { setPhone(v); setSaved(false); }} placeholder="+91 98765 43210" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />

          <SectionLabel>Sign-in email</SectionLabel>
          <Inset className="flex-row items-center gap-3">
            <Mail color={colors.muted} size={18} />
            <Text className="text-[15px] font-semibold text-slate-500 flex-1" numberOfLines={1}>{user?.email}</Text>
            <Lock color={colors.muted} size={14} />
          </Inset>
          <Text className="text-[11px] text-slate-400 font-medium mt-2 ml-1">Your email is used to sign in and can’t be changed here.</Text>

          <View className="mt-8">
            <Button
              title={saved ? 'Saved' : 'Save changes'}
              variant={saved ? 'success' : 'primary'}
              icon={saved ? Check : Save}
              loading={busy}
              disabled={!dirty && !saved}
              onPress={save}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
