import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { Phone, Star, Trash2, UserPlus, Users } from 'lucide-react-native';
import { Screen, Header, Card, Field, Button, PressScale, SectionLabel, EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { colors, raised } from '../theme';

const RELATIONS = ['Family', 'Partner', 'Friend', 'Doctor', 'Colleague'];

export default function ContactsScreen({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', relation: 'Family' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setContacts(await api.contacts());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim() || !/^[+\d][\d\s-]{5,}$/.test(form.phone.trim())) {
      setErr('Enter a name and a valid phone number.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.addContact({ name: form.name.trim(), phone: form.phone.trim(), relation: form.relation, isPrimary: contacts.length === 0 });
      setForm({ name: '', phone: '', relation: 'Family' });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (c) => { await api.updateContact(c.id, { isPrimary: true }).catch(() => {}); load(); };
  const remove = async (c) => { await api.deleteContact(c.id).catch(() => {}); load(); };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Emergency contacts" subtitle="Texted with your live location when you need help" onBack={() => navigation.goBack()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={colors.primary} className="mt-8" />
        ) : contacts.length === 0 ? (
          <Card><EmptyState icon={Users} title="No contacts yet" body="Add at least one person we should alert in an emergency." /></Card>
        ) : (
          contacts.map((c) => (
            <Card key={c.id} className="p-3.5 mb-3 flex-row items-center gap-3">
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: c.isPrimary ? colors.primary : '#e2e8f0' }}>
                <Text className={`font-black ${c.isPrimary ? 'text-white' : 'text-slate-500'}`}>{c.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-extrabold text-slate-700">{c.name}</Text>
                <Text className="text-[11px] font-semibold text-slate-400">{c.relation || 'Contact'} · {c.phone}{c.isPrimary ? ' · Primary' : ''}</Text>
              </View>
              <PressScale onPress={() => Linking.openURL(`tel:${c.phone}`)} accessibilityLabel={`Call ${c.name}`}>
                <View className="w-9 h-9 rounded-full bg-green-50 items-center justify-center"><Phone color={colors.green} size={16} /></View>
              </PressScale>
              {!c.isPrimary && (
                <PressScale onPress={() => makePrimary(c)} accessibilityLabel="Make primary">
                  <View className="w-9 h-9 rounded-full bg-orange-50 items-center justify-center"><Star color={colors.primary} size={16} /></View>
                </PressScale>
              )}
              <PressScale onPress={() => remove(c)} accessibilityLabel={`Remove ${c.name}`}>
                <View className="w-9 h-9 rounded-full bg-red-50 items-center justify-center"><Trash2 color={colors.red} size={16} /></View>
              </PressScale>
            </Card>
          ))
        )}

        <SectionLabel>Add contact</SectionLabel>
        <Card>
          <Field label="Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Priya Sharma" />
          <Field label="Phone" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+91 98765 43210" keyboardType="phone-pad" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {RELATIONS.map((r) => (
              <PressScale key={r} onPress={() => setForm((f) => ({ ...f, relation: r }))}>
                <View className={`px-3 h-9 rounded-xl items-center justify-center ${form.relation === r ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                  <Text className={`text-xs font-extrabold ${form.relation === r ? 'text-white' : 'text-slate-500'}`}>{r}</Text>
                </View>
              </PressScale>
            ))}
          </View>
          {err ? <Text className="text-red-500 text-xs font-bold mb-3">{err}</Text> : null}
          <Button title="Add contact" icon={UserPlus} onPress={add} loading={busy} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
