import React from 'react';
import { View, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { Text } from '../../components/Text';
import { PressScale } from '../../components/ui';
import { colors, raised, inset } from '../../theme';

// Thin segmented progress bar: filled segments for completed/current steps.
export function ProgressBar({ total, index }) {
  return (
    <View className="flex-row gap-1.5 flex-1" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: index + 1 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} className="flex-1 h-1.5 rounded-full" style={i <= index ? { backgroundColor: colors.primary } : inset()} />
      ))}
    </View>
  );
}

// Big friendly heading used at the top of every step.
export function StepTitle({ icon: Icon, eyebrow, title, body }) {
  return (
    <View className="mb-6">
      {Icon ? (
        <View className="w-16 h-16 rounded-3xl bg-bg-base items-center justify-center border border-white mb-5" style={raised(0.7)}>
          <Icon color={colors.primary} size={30} />
        </View>
      ) : null}
      {eyebrow ? <Text className="text-[11px] font-extrabold uppercase tracking-widest text-primary mb-2">{eyebrow}</Text> : null}
      <Text className="text-[30px] leading-9 font-extrabold text-slate-800">{title}</Text>
      {body ? <Text className="text-[15px] leading-6 text-slate-500 font-medium mt-3">{body}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, color = colors.primary }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label}>
      <View
        className={`px-3.5 h-10 rounded-xl items-center justify-center flex-row gap-1.5 ${active ? '' : 'bg-bg-base border border-white'}`}
        style={[raised(0.4), active ? { backgroundColor: color } : null]}
      >
        {active ? <Check color="#fff" size={13} /> : null}
        <Text className={`text-xs font-extrabold ${active ? 'text-white' : 'text-slate-600'}`}>{label}</Text>
      </View>
    </PressScale>
  );
}

// Toggleable suggestions plus a free-text "add" well; values are an array of strings.
export function TagPicker({ label, values, onChange, suggestions, placeholder }) {
  const [draft, setDraft] = React.useState('');
  const toggle = (v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft('');
  };
  const all = [...suggestions, ...values.filter((v) => !suggestions.includes(v))];
  return (
    <View className="mb-6">
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 ml-1">{label}</Text>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {all.map((s) => <Chip key={s} label={s} active={values.includes(s)} onPress={() => toggle(s)} />)}
      </View>
      <View className="flex-row items-center rounded-2xl pl-4 pr-1.5" style={inset()}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          className="flex-1 h-12 text-slate-700 font-semibold text-[15px]"
          style={{ outlineStyle: 'none' }}
        />
        <PressScale onPress={add} disabled={!draft.trim()} accessibilityLabel={`Add ${label}`}>
          <View className="w-9 h-9 rounded-xl bg-primary items-center justify-center"><Plus color="#fff" size={18} /></View>
        </PressScale>
      </View>
    </View>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <View className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
      <Text className="text-xs font-bold text-accent-red">{children}</Text>
    </View>
  );
}

export function DoneNote({ children }) {
  return (
    <View className="flex-row items-center gap-2.5 rounded-2xl bg-green-50 border border-green-200 px-4 py-3 mb-4">
      <View className="w-6 h-6 rounded-full bg-green-600 items-center justify-center"><Check color="#fff" size={14} /></View>
      <Text className="text-xs font-bold text-green-700 flex-1">{children}</Text>
    </View>
  );
}

// Scrollable step body with a pinned footer (primary action + optional secondary link).
export function StepLayout({ children, footer }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer ? <View className="px-6 pb-4 pt-3">{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function TextLink({ title, onPress }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={title}>
      <View className="h-11 items-center justify-center mt-1">
        <Text className="text-xs font-extrabold uppercase tracking-widest text-slate-400">{title}</Text>
      </View>
    </PressScale>
  );
}
