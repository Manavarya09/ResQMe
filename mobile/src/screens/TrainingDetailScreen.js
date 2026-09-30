import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Phone, HeartPulse, Pause, Play, CheckCircle2 } from 'lucide-react-native';
import { Screen, Header, Card, Button, PressScale } from '../components/ui';
import YouTubeEmbed from '../components/video/YouTubeEmbed';
import { getTraining } from '../lib/training';
import { getCountry } from '../lib/dialCodes';
import { useAuth } from '../context/AuthContext';
import { colors, raised } from '../theme';

export default function TrainingDetailScreen({ navigation, route }) {
  const t = getTraining(route.params?.id);
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  if (!t) return null;
  const country = getCountry(user?.country);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={t.title} subtitle={`${t.source} · ${t.minutes} min`} onBack={() => navigation.goBack()} />
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <YouTubeEmbed videoId={t.youtubeId} />
        <Text className="text-sm text-slate-600 font-semibold mt-4 leading-5">{t.summary}</Text>

        {t.metronome && <CprMetronome />}

        <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mt-6 mb-3 px-1">Step by step</Text>
        {t.steps.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <PressScale key={s.title} onPress={() => setStep(i)}>
              <View
                className={`flex-row gap-4 p-4 mb-3 rounded-2xl border ${current ? 'bg-white border-orange-200' : 'bg-bg-base border-white'}`}
                style={raised(current ? 0.7 : 0.4)}
              >
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: done ? colors.green : current ? t.color : '#e2e8f0' }}>
                  {done ? <CheckCircle2 color="#fff" size={18} /> : <Text className={`font-black ${current ? 'text-white' : 'text-slate-500'}`}>{i + 1}</Text>}
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-extrabold text-slate-800">{s.title}</Text>
                  <Text className="text-[13px] text-slate-500 font-medium leading-5 mt-0.5">{s.body}</Text>
                </View>
              </View>
            </PressScale>
          );
        })}
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button title={step >= t.steps.length - 1 ? 'Done' : 'Next step'} onPress={() => (step >= t.steps.length - 1 ? navigation.goBack() : setStep(step + 1))} />
          </View>
          <View className="flex-1">
            <Button title={`Call ${country.primary}`} variant="danger" icon={Phone} onPress={() => Linking.openURL(`tel:${country.primary}`)} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

// 110 compressions/min pacing with a visual pulse and haptic tick — the rate lay rescuers most often get wrong.
function CprMetronome() {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      setCount((c) => (c % 30) + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 90, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 330, useNativeDriver: true }),
      ]).start();
    }, 60000 / 110);
    return () => clearInterval(id);
  }, [on, pulse]);

  return (
    <Card className="mt-5 items-center">
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">CPR compression pacer · 110 / min</Text>
      <Animated.View style={{ transform: [{ scale: pulse }] }} className="my-5">
        <View className="w-28 h-28 rounded-full bg-accent-red items-center justify-center">
          <HeartPulse color="#fff" size={36} />
          <Text className="text-white font-black text-2xl" style={{ fontVariant: ['tabular-nums'] }}>{on ? count : '—'}</Text>
        </View>
      </Animated.View>
      <Text className="text-xs text-slate-500 font-semibold mb-4 text-center">Push hard and fast with each beat. Count to 30, keep going.</Text>
      <View className="w-full">
        <Button title={on ? 'Pause pacer' : 'Start pacer'} icon={on ? Pause : Play} variant={on ? 'ghost' : 'primary'} onPress={() => { setOn((v) => !v); setCount(0); }} />
      </View>
    </Card>
  );
}
