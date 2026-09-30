import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { ShieldPlus, Activity, HeartPulse, Radio } from 'lucide-react-native';
import { Screen, Field, Button, PressScale, Inset } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import { colors, raised, glow } from '../theme';

const FEATURES = [
  { icon: Activity, color: colors.red, text: 'Crash & fall detection' },
  { icon: HeartPulse, color: colors.primary, text: 'Medical ID to responders' },
  { icon: Radio, color: colors.blue, text: 'Live tracking & drones' },
];

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.email || !form.password || (mode === 'register' && !form.name)) {
      setError('Please fill in all required fields.');
      return;
    }
    if (mode === 'register' && form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register({ name: form.name.trim(), email: form.email, phone: form.phone.trim() || undefined, password: form.password });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const useDemo = async () => {
    setError(null);
    setLoading(true);
    try {
      await login('demo@resqme.app', 'Demo@1234');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View className="items-center mt-6 mb-8">
            <View className="w-24 h-24 rounded-[32px] bg-primary items-center justify-center mb-5" style={glow(colors.primary)}>
              <ShieldPlus color="#fff" size={48} />
            </View>
            <Text className="text-4xl font-black text-slate-800 tracking-tight">ResQMe</Text>
            <Text className="text-sm font-semibold text-text-sub mt-1 text-center">Intelligent emergency response, in your pocket.</Text>
          </View>

          <View className="flex-row gap-2 mb-8">
            {FEATURES.map((f) => (
              <View key={f.text} className="flex-1 items-center rounded-2xl bg-bg-base border border-white py-3 px-1" style={raised(0.5)}>
                <f.icon color={f.color} size={20} />
                <Text className="text-[10px] font-bold text-slate-500 text-center mt-1.5 leading-3">{f.text}</Text>
              </View>
            ))}
          </View>

          <Inset className="flex-row p-1.5 mb-6">
            {['login', 'register'].map((m) => (
              <PressScale key={m} onPress={() => { setMode(m); setError(null); }} style={{ flex: 1 }}>
                <View className={`h-11 rounded-xl items-center justify-center ${mode === m ? 'bg-bg-base' : ''}`} style={mode === m ? raised(0.5) : null}>
                  <Text className={`text-sm font-extrabold ${mode === m ? 'text-primary' : 'text-slate-400'}`}>{m === 'login' ? 'Sign in' : 'Create account'}</Text>
                </View>
              </PressScale>
            ))}
          </Inset>

          {mode === 'register' && <Field label="Full name" value={form.name} onChangeText={set('name')} placeholder="Your name" autoComplete="name" />}
          <Field label="Email" value={form.email} onChangeText={set('email')} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          {mode === 'register' && <Field label="Phone (optional)" value={form.phone} onChangeText={set('phone')} placeholder="+91 98xxxxxx" keyboardType="phone-pad" />}
          <Field label="Password" value={form.password} onChangeText={set('password')} placeholder="••••••••" secureTextEntry onSubmitEditing={submit} />

          {error ? (
            <View className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
              <Text className="text-red-600 text-xs font-bold">{error}</Text>
              {error.includes('reach') ? <Text className="text-red-400 text-[10px] mt-1">Server: {API_BASE}</Text> : null}
            </View>
          ) : null}

          <Button title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} loading={loading} />
          {mode === 'login' && (
            <PressScale onPress={useDemo} disabled={loading}>
              <Text className="text-center text-primary font-extrabold text-sm mt-5">Try the demo account →</Text>
            </PressScale>
          )}

          <Text className="text-[10px] text-slate-400 text-center mt-8 leading-4 px-4">
            Your medical data is encrypted (AES-256) and only shared with responders during an emergency you trigger.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
