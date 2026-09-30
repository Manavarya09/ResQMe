import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Text } from '../components/Text';
import * as Speech from 'expo-speech';
import { Bot, Send, Volume2, VolumeX, PlayCircle, Video, Droplet, HeartPulse, Frown, Brain, Car, ShieldAlert, Siren, Phone, Trash2 } from 'lucide-react-native';
import { Screen, IconButton, PressScale, Pill } from '../components/ui';
import { api } from '../lib/api';
import { getJSON, setJSON, removeItem } from '../lib/storage';
import { getTraining } from '../lib/training';
import { getCountry } from '../lib/dialCodes';
import { useAuth } from '../context/AuthContext';
import { useEmergency, TRIGGER_LABEL } from '../context/EmergencyContext';
import { useLocation } from '../context/LocationContext';
import { colors, raised, severityColor } from '../theme';
import { Linking } from 'react-native';

const QUICK = [
  { icon: Droplet, label: 'Severe bleeding', color: colors.red },
  { icon: HeartPulse, label: 'Not breathing', color: colors.primary },
  { icon: Frown, label: 'Someone is choking', color: colors.yellow },
  { icon: Car, label: 'Road accident', color: colors.blue },
  { icon: ShieldAlert, label: "I'm being followed", color: '#db2777' },
  { icon: Brain, label: "I'm having a panic attack", color: '#8b5cf6' },
];

const MAX_STORED = 50;
const chatKey = (userId) => `resqme.chat.${userId || 'anon'}`;

const GREETING = {
  greeting: true,
  role: 'assistant',
  content: "I'm ResQMe, your crisis guide. Tell me what's happening, or tap an option below. If someone isn't breathing or is bleeding heavily, call emergency services first.",
  suggestions: [],
};

export default function ChatScreen({ navigation }) {
  const { user, settings, updateSettings } = useAuth();
  const { incident, isActive } = useEmergency();
  const { location } = useLocation();
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const medicalRef = useRef(null);
  const scrollRef = useRef(null);
  const country = getCountry(user?.country);

  useEffect(() => {
    api.getMedical().then((m) => (medicalRef.current = m)).catch(() => {});
  }, []);

  // Restore the last conversation for this account. Anything said before the restore finishes
  // (e.g. the incident-mode prompt) is kept after the restored history.
  const userId = user?.id;
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    getJSON(chatKey(userId), []).then((saved) => {
      if (cancelled) return;
      const history = Array.isArray(saved) ? saved.filter((m) => m && m.role && typeof m.content === 'string' && !m.greeting) : [];
      if (history.length) setMessages((cur) => [GREETING, ...history, ...cur.filter((m) => !m.greeting)]);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Persist the last 50 messages (the greeting is rebuilt on load, never stored).
  useEffect(() => {
    if (!hydrated) return;
    const toStore = messages.filter((m) => !m.greeting).slice(-MAX_STORED);
    if (toStore.length) setJSON(chatKey(userId), toStore);
    else removeItem(chatKey(userId));
  }, [messages, hydrated, userId]);

  const clearChat = useCallback(() => {
    const go = () => {
      Speech.stop();
      setMessages([GREETING]);
      removeItem(chatKey(userId));
    };
    if (Platform.OS === 'web') return go();
    Alert.alert('Clear conversation?', 'This removes the chat history saved on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: go },
    ]);
  }, [userId]);

  // Switch into incident mode when an emergency starts (once per incident, even across restarts).
  const incidentId = isActive ? incident?.id : null;
  useEffect(() => {
    if (!incidentId) return;
    setMessages((m) => m.some((x) => x.incidentId === incidentId) ? m : [
      ...m,
      {
        incidentId,
        role: 'assistant',
        content: `Help has been alerted (${TRIGGER_LABEL[incident.trigger]}). Responders can see your location${incident.medicalSnapshot ? ' and medical ID' : ''}. I'll stay with you — are you or anyone else injured?`,
        suggestions: ["I'm injured", 'Someone else is hurt', "I'm safe but scared"],
      },
    ]);
  }, [incidentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await api.chat({
        messages: next.filter((m) => !m.greeting && !m.error).map(({ role, content: c }) => ({ role, content: c })).slice(-12),
        incidentId: incidentId || undefined,
        context: {
          incidentActive: !!incidentId,
          trigger: incidentId ? incident.trigger : undefined,
          medical: medicalRef.current || undefined,
          location: { lat: location.lat, lng: location.lng },
          country: user?.country || 'IN',
        },
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply, suggestions: res.suggestions || [], videoIds: res.videoIds || [], severity: res.severity, source: res.source }]);
      if (settings.speakReplies) Speech.speak(res.reply, { rate: 0.95 });
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `I can't reach the ResQMe server right now (${e.message}). If this is life-threatening, call ${country.primary} immediately.`, suggestions: [], error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, incidentId, incident, location, user, settings.speakReplies, country.primary]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, busy]);

  const last = messages[messages.length - 1];

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1" keyboardVerticalOffset={80}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
          <View className="flex-row items-center gap-3">
            <View className="w-12 h-12 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.6)}>
              <Bot color={colors.primary} size={24} />
              <View className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-bg-base" />
            </View>
            <View>
              <Text className="text-lg font-extrabold text-slate-800">ResQMe AI Guide</Text>
              <Text className="text-xs font-semibold text-text-sub">{incidentId ? 'Incident mode · stay with me' : 'Online · ready to assist'}</Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            {messages.length > 1 && (
              <IconButton onPress={clearChat} accessibilityLabel="Clear chat">
                <Trash2 color={colors.muted} size={17} />
              </IconButton>
            )}
            <IconButton onPress={() => { Speech.stop(); updateSettings({ speakReplies: !settings.speakReplies }); }} accessibilityLabel="Read replies aloud">
              {settings.speakReplies ? <Volume2 color={colors.primary} size={18} /> : <VolumeX color={colors.muted} size={18} />}
            </IconButton>
            <IconButton onPress={() => Linking.openURL(`tel:${country.primary}`)} accessibilityLabel="Call emergency">
              <Phone color={colors.red} size={18} />
            </IconButton>
          </View>
        </View>

        {/* Video support */}
        <View className="px-5 pb-2">
          <PressScale onPress={() => navigation.navigate('Training')}>
            <View className="h-12 rounded-2xl bg-bg-base border border-white flex-row items-center justify-center gap-3" style={raised(0.5)}>
              <View className="w-7 h-7 rounded-full bg-red-50 items-center justify-center"><Video color={colors.red} size={15} /></View>
              <Text className="text-accent-red text-xs font-extrabold uppercase tracking-widest">Guided video first aid</Text>
            </View>
          </PressScale>
        </View>

        <ScrollView ref={scrollRef} className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 12 }} keyboardShouldPersistTaps="handled">
          {messages.map((m, i) => (
            <Bubble key={i} m={m} onVideo={(id) => navigation.navigate('TrainingDetail', { id })} />
          ))}
          {messages.length === 1 && !busy && (
            <View className="flex-row flex-wrap gap-2 mt-1 ml-12">
              {QUICK.map((q) => (
                <PressScale key={q.label} onPress={() => send(q.label)}>
                  <View className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl bg-bg-base border border-white" style={raised(0.4)}>
                    <q.icon color={q.color} size={16} />
                    <Text className="text-xs font-bold text-slate-600">{q.label}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          )}
          {busy && (
            <View className="flex-row items-center gap-2 ml-12 mt-1 mb-4">
              <ActivityIndicator color={colors.primary} size="small" />
              <Text className="text-xs font-semibold text-slate-400">ResQMe is thinking…</Text>
            </View>
          )}
          {!busy && last?.role === 'assistant' && last.suggestions?.length > 0 && (
            <View className="flex-row flex-wrap gap-2 ml-12 mb-2">
              {last.suggestions.map((s) => (
                <PressScale key={s} onPress={() => send(s)}>
                  <View className="px-3.5 py-2 rounded-full border-2 border-primary/40 bg-orange-50">
                    <Text className="text-xs font-bold text-primary-dark">{s}</Text>
                  </View>
                </PressScale>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View className="px-4 pb-3 pt-2">
          <View className="flex-row items-center gap-2 bg-bg-base p-1.5 pl-4 rounded-full border border-white" style={raised(0.5)}>
            <TextInput
              className="flex-1 text-slate-700 text-sm font-semibold h-11"
              style={{ outlineStyle: 'none' }}
              placeholder="Describe the emergency…"
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send()}
              returnKeyType="send"
            />
            <PressScale onPress={() => send()} disabled={!input.trim() || busy} accessibilityLabel="Send">
              <View className="w-11 h-11 rounded-full bg-primary items-center justify-center">
                <Send color="#fff" size={18} />
              </View>
            </PressScale>
          </View>
          <Text className="text-[9px] text-slate-400 text-center mt-1.5">AI guidance supports — never replaces — emergency services.</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ m, onVideo }) {
  const isUser = m.role === 'user';
  return (
    <View className={`flex-row items-end gap-2 mb-4 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <View className="w-9 h-9 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
          {m.severity === 'critical' ? <Siren color={colors.red} size={18} /> : <Bot color={colors.primary} size={18} />}
        </View>
      )}
      <View className={`max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>
        <View
          className={`px-4 py-3 rounded-2xl ${isUser ? 'bg-primary rounded-br-md' : m.error ? 'bg-red-50 border border-red-200 rounded-bl-md' : 'bg-bg-base border border-white rounded-bl-md'}`}
          style={raised(0.45)}
        >
          {m.severity && !isUser ? <Pill label={`${m.severity} priority`} color={severityColor[m.severity]} className="mb-2" /> : null}
          <Text className={`text-[14px] leading-5 font-medium ${isUser ? 'text-white' : 'text-slate-700'}`}>{m.content}</Text>
        </View>
        {m.videoIds?.length > 0 &&
          m.videoIds.map((id) => {
            const t = getTraining(id);
            if (!t) return null;
            return (
              <PressScale key={id} onPress={() => onVideo(id)}>
                <View className="flex-row items-center gap-3 mt-2 px-3 py-2.5 rounded-2xl bg-bg-base border border-white" style={raised(0.4)}>
                  <PlayCircle color={t.color} size={22} />
                  <View>
                    <Text className="text-xs font-extrabold text-slate-700">{t.title}</Text>
                    <Text className="text-[10px] font-semibold text-slate-400">{t.minutes} min guided video · {t.source}</Text>
                  </View>
                </View>
              </PressScale>
            );
          })}
      </View>
    </View>
  );
}
