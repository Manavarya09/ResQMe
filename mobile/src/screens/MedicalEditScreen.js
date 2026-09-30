import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Plus, X, Save } from 'lucide-react-native';
import { Screen, Header, Card, Field, Button, PressScale, SectionLabel, ToggleRow, Inset } from '../components/ui';
import { useMedical } from '../hooks/useMedical';
import { colors, raised, inset } from '../theme';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const COMMON_ALLERGIES = ['Penicillin', 'Peanuts', 'Latex', 'Aspirin', 'Sulfa', 'Shellfish'];
const COMMON_CONDITIONS = ['Diabetes', 'Asthma', 'Epilepsy', 'Heart disease', 'Hypertension', 'Pregnancy'];

export default function MedicalEditScreen({ navigation }) {
  const { medical, save } = useMedical();
  const [form, setForm] = useState(() => ({
    bloodType: medical?.bloodType || 'Unknown',
    allergies: medical?.allergies || [],
    conditions: medical?.conditions || [],
    medications: medical?.medications || [],
    organDonor: !!medical?.organDonor,
    dateOfBirth: medical?.dateOfBirth || '',
    heightCm: medical?.heightCm ? String(medical.heightCm) : '',
    weightKg: medical?.weightKg ? String(medical.weightKg) : '',
    notes: medical?.notes || '',
  }));
  const [med, setMed] = useState({ name: '', dosage: '', frequency: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) {
      setErr('Date of birth must be YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await save({
        ...form,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        notes: form.notes.trim() || undefined,
      });
      navigation.goBack();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addMed = () => {
    if (!med.name.trim()) return;
    set('medications')([...form.medications, { name: med.name.trim(), dosage: med.dosage.trim() || undefined, frequency: med.frequency.trim() || undefined }]);
    setMed({ name: '', dosage: '', frequency: '' });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Edit Medical ID" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <SectionLabel>Blood type</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {BLOOD.map((b) => (
              <Chip key={b} label={b} active={form.bloodType === b} onPress={() => set('bloodType')(b)} color={colors.red} />
            ))}
          </View>

          <TagEditor label="Allergies" values={form.allergies} onChange={set('allergies')} suggestions={COMMON_ALLERGIES} color={colors.red} />
          <TagEditor label="Medical conditions" values={form.conditions} onChange={set('conditions')} suggestions={COMMON_CONDITIONS} color={colors.primary} />

          <SectionLabel>Medications</SectionLabel>
          <Card className="p-4">
            {form.medications.map((m, i) => (
              <View key={`${m.name}${i}`} className="flex-row items-center justify-between py-2 border-b border-slate-200">
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-700">{m.name}</Text>
                  <Text className="text-[11px] text-slate-400">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</Text>
                </View>
                <PressScale onPress={() => set('medications')(form.medications.filter((_, j) => j !== i))}><X color={colors.muted} size={18} /></PressScale>
              </View>
            ))}
            <View className="flex-row gap-2 mt-3">
              <MiniInput placeholder="Name" value={med.name} onChangeText={(v) => setMed((x) => ({ ...x, name: v }))} flex={2} />
              <MiniInput placeholder="Dose" value={med.dosage} onChangeText={(v) => setMed((x) => ({ ...x, dosage: v }))} />
              <MiniInput placeholder="When" value={med.frequency} onChangeText={(v) => setMed((x) => ({ ...x, frequency: v }))} />
              <PressScale onPress={addMed} accessibilityLabel="Add medication">
                <View className="w-11 h-11 rounded-xl bg-primary items-center justify-center"><Plus color="#fff" size={20} /></View>
              </PressScale>
            </View>
          </Card>

          <SectionLabel>About you</SectionLabel>
          <Field label="Date of birth" value={form.dateOfBirth} onChangeText={set('dateOfBirth')} placeholder="YYYY-MM-DD" />
          <View className="flex-row gap-3">
            <Field className="flex-1" label="Height (cm)" value={form.heightCm} onChangeText={set('heightCm')} keyboardType="numeric" placeholder="170" />
            <Field className="flex-1" label="Weight (kg)" value={form.weightKg} onChangeText={set('weightKg')} keyboardType="numeric" placeholder="65" />
          </View>
          <Inset className="p-0 mb-4">
            <ToggleRow title="Organ donor" subtitle="Shown to responders" value={form.organDonor} onValueChange={set('organDonor')} last />
          </Inset>
          <Field label="Notes for responders" value={form.notes} onChangeText={set('notes')} placeholder="e.g. Insulin pen in left pocket" multiline />

          {err ? <Text className="text-red-500 text-xs font-bold mb-3">{err}</Text> : null}
          <Button title="Save medical ID" icon={Save} onPress={submit} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Chip({ label, active, onPress, color = colors.primary }) {
  return (
    <PressScale onPress={onPress}>
      <View className="px-3.5 h-10 rounded-xl items-center justify-center border border-white" style={[{ backgroundColor: active ? color : colors.base }, raised(0.4)]}>
        <Text className={`text-sm font-extrabold ${active ? 'text-white' : 'text-slate-500'}`}>{label}</Text>
      </View>
    </PressScale>
  );
}

function MiniInput({ flex = 1, ...props }) {
  return (
    <View className="rounded-xl px-3 justify-center" style={[{ flex, height: 44 }, inset()]}>
      <TextInput placeholderTextColor={colors.muted} className="text-sm font-semibold text-slate-700" style={{ outlineStyle: 'none' }} {...props} />
    </View>
  );
}

function TagEditor({ label, values, onChange, suggestions, color }) {
  const [text, setText] = useState('');
  const add = (v) => {
    const t = (v ?? text).trim();
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...values, t]);
    setText('');
  };
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {values.map((v) => (
          <PressScale key={v} onPress={() => onChange(values.filter((x) => x !== v))}>
            <View className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl" style={{ backgroundColor: `${color}1a` }}>
              <Text className="text-xs font-extrabold" style={{ color }}>{v}</Text>
              <X color={color} size={12} />
            </View>
          </PressScale>
        ))}
        {suggestions.filter((s) => !values.includes(s)).map((s) => (
          <PressScale key={s} onPress={() => add(s)}>
            <View className="flex-row items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-slate-300">
              <Plus color={colors.muted} size={12} />
              <Text className="text-xs font-bold text-slate-400">{s}</Text>
            </View>
          </PressScale>
        ))}
      </View>
      <View className="flex-row gap-2">
        <MiniInput placeholder={`Add ${label.toLowerCase()}`} value={text} onChangeText={setText} onSubmitEditing={() => add()} />
        <PressScale onPress={() => add()}>
          <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: color }}><Plus color="#fff" size={20} /></View>
        </PressScale>
      </View>
    </>
  );
}
