import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { Siren, PhoneIncoming, Share2, ChevronRight, Vibrate, X, Radio, Square } from 'lucide-react-native';
import Text from '../components/Text';
import { Screen, Header, Card, Inset, Field, Button, SectionLabel, PressScale, Pill } from '../components/ui';
import SirenStrobe from '../components/safety/SirenStrobe';
import FakeCall from '../components/safety/FakeCall';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';
import { useLocationShare } from '../hooks/useLocationShare';
import { SHARE_DURATIONS, formatTimeLeft, formatUntil } from '../lib/liveShare';
import { colors, raised } from '../theme';

const DELAYS = [
  { s: 0, label: 'Now' },
  { s: 10, label: '10 s' },
  { s: 30, label: '30 s' },
  { s: 60, label: '1 min' },
];

export default function SafetyToolsScreen({ navigation }) {
  const { settings } = useAuth();
  const { hasFix } = useLocation();
  const [sirenOn, setSirenOn] = useState(false);
  const [callerName, setCallerName] = useState('Mom');
  const [delay, setDelay] = useState(10);
  const [callAt, setCallAt] = useState(null); // timestamp when the fake call rings
  const [ringing, setRinging] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [shareState, setShareState] = useState(null); // null | 'shared' | 'copied' | 'error'
  const [duration, setDuration] = useState('1h');
  const live = useLocationShare();
  const callerRef = useRef('Mom');

  // Countdown until the scheduled fake call.
  useEffect(() => {
    if (!callAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= callAt) {
        setCallAt(null);
        setRinging(true);
      }
    }, 250);
    return () => clearInterval(id);
  }, [callAt]);

  const scheduleCall = () => {
    callerRef.current = callerName.trim() || 'Mom';
    if (delay === 0) {
      setRinging(true);
      return;
    }
    setNow(Date.now());
    setCallAt(Date.now() + delay * 1000);
  };

  const startSharing = async () => {
    setShareState(null);
    const choice = SHARE_DURATIONS.find((d) => d.key === duration) || SHARE_DURATIONS[1];
    const res = await live.start({ minutes: choice.minutes, untilStopped: !!choice.untilStopped });
    if (res) setShareState(res.result === 'copied' ? 'copied' : res.result ? 'shared' : null);
  };

  const shareAgain = async (s) => {
    const res = await live.share(s);
    setShareState(res === 'copied' ? 'copied' : res ? 'shared' : null);
  };

  const callIn = callAt ? Math.max(0, Math.ceil((callAt - now) / 1000)) : 0;

  return (
    <Screen>
      <Header
        title="Safety tools"
        subtitle="Attract attention, excuse yourself, or share where you are"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {/* Siren */}
        <PressScale onPress={() => setSirenOn(true)} accessibilityLabel="Start siren and strobe">
          <View className="rounded-3xl bg-accent-red p-5 flex-row items-center gap-4 mt-2" style={raised(0.8)}>
            <View className="w-14 h-14 rounded-2xl bg-white/20 items-center justify-center">
              <Siren color="#fff" size={28} />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-extrabold text-white">Loud siren & strobe</Text>
              <Text className="text-xs font-semibold text-red-100 mt-0.5">
                Full volume alarm with a flashing screen to draw attention
              </Text>
            </View>
            <ChevronRight color="#fff" size={20} />
          </View>
        </PressScale>
        <Text className="text-[11px] text-slate-400 font-medium mt-2 px-1">
          Plays even in silent mode. Contains flashing lights.
        </Text>

        {/* Fake call */}
        <SectionLabel>Fake incoming call</SectionLabel>
        <Card>
          <View className="flex-row items-center gap-3 mb-4">
            <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${colors.primary}1a` }}>
              <PhoneIncoming color={colors.primary} size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-extrabold text-slate-700">Get a call to leave</Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">A realistic ringing call gives you a reason to step away.</Text>
            </View>
          </View>

          <Field label="Caller name" value={callerName} onChangeText={setCallerName} placeholder="Mom" maxLength={32} autoCorrect={false} />

          <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 ml-1">Ring in</Text>
          <View className="flex-row gap-2 mb-5">
            {DELAYS.map((d) => (
              <PressScale key={d.s} onPress={() => setDelay(d.s)} style={{ flex: 1 }} accessibilityLabel={`Ring ${d.label}`}>
                <View className={`h-10 rounded-xl items-center justify-center ${delay === d.s ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                  <Text className={`text-sm font-extrabold ${delay === d.s ? 'text-white' : 'text-slate-500'}`}>{d.label}</Text>
                </View>
              </PressScale>
            ))}
          </View>

          {callAt ? (
            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-[52px] rounded-2xl bg-bg-base border border-white flex-row items-center justify-center gap-2" style={raised(0.5)}>
                <Vibrate color={colors.primary} size={18} />
                <Text className="text-sm font-extrabold text-slate-700" style={{ fontVariant: ['tabular-nums'] }}>
                  {callerRef.current} calls in {callIn}s
                </Text>
              </View>
              <PressScale onPress={() => setCallAt(null)} accessibilityLabel="Cancel fake call">
                <View className="w-[52px] h-[52px] rounded-2xl bg-bg-base border border-white items-center justify-center" style={raised(0.5)}>
                  <X color={colors.sub} size={20} />
                </View>
              </PressScale>
            </View>
          ) : (
            <Button title={delay === 0 ? 'Ring now' : 'Schedule call'} icon={PhoneIncoming} onPress={scheduleCall} />
          )}
          {callAt ? (
            <Text className="text-[11px] text-slate-400 font-medium mt-3 px-1">Keep ResQMe open — the call rings on this screen.</Text>
          ) : null}
        </Card>

        {/* Live location */}
        <SectionLabel right={live.primary ? <Pill label="Live" color={colors.primary} /> : !hasFix ? <Pill label="Approx." color={colors.primary} /> : null}>
          Share live location
        </SectionLabel>
        <Card>
          <View className="flex-row items-center gap-3 mb-4">
            <View className="w-12 h-12 rounded-2xl items-center justify-center" style={{ backgroundColor: `${colors.primary}1a` }}>
              <Radio color={colors.primary} size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-extrabold text-slate-700">
                {live.primary ? 'You are sharing your location' : 'Send a live map link'}
              </Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">
                {live.primary
                  ? 'Anyone with the link sees where you are, updated every 15 seconds.'
                  : 'Friends open the link in any browser and follow you on a map until it ends.'}
              </Text>
            </View>
          </View>

          {live.shares.length ? (
            live.shares.map((s, i) => (
              <View key={s.id} className={i ? 'mt-4 pt-4 border-t border-slate-200/70' : ''}>
                <Inset className="flex-row items-center gap-3 py-3">
                  <View className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold text-slate-700" style={{ fontVariant: ['tabular-nums'] }}>
                      {s.untilStopped ? 'Until you stop' : formatTimeLeft(s.expiresAt, live.now)}
                    </Text>
                    <Text className="text-[11px] font-semibold text-slate-400 mt-0.5">
                      {s.incidentId ? 'Emergency link' : 'Personal link'} · ends {formatUntil(s.expiresAt)}
                    </Text>
                  </View>
                </Inset>
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <Button title="Share" variant="ghost" icon={Share2} onPress={() => shareAgain(s)} loading={live.busy === 'share'} />
                  </View>
                  <View className="flex-1">
                    <Button title="Stop" variant="danger" icon={Square} onPress={() => live.stop(s.id)} loading={live.busy === 'stop'} />
                  </View>
                </View>
              </View>
            ))
          ) : (
            <>
              <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 ml-1">Share for</Text>
              <View className="flex-row gap-2 mb-5">
                {SHARE_DURATIONS.map((d) => (
                  <PressScale key={d.key} onPress={() => setDuration(d.key)} style={{ flex: d.untilStopped ? 1.6 : 1 }} accessibilityLabel={`Share for ${d.label}`}>
                    <View className={`h-10 rounded-xl items-center justify-center px-1 ${duration === d.key ? 'bg-primary' : 'bg-bg-base border border-white'}`} style={raised(0.4)}>
                      <Text className={`text-[13px] font-extrabold ${duration === d.key ? 'text-white' : 'text-slate-500'}`} numberOfLines={1}>{d.label}</Text>
                    </View>
                  </PressScale>
                ))}
              </View>
              <Button title="Share live location" icon={Share2} onPress={startSharing} loading={live.busy === 'start' || live.busy === 'share'} />
              {duration === 'stop' ? (
                <Text className="text-[11px] text-slate-400 font-medium mt-3 px-1">For your safety the link still ends after 24 hours.</Text>
              ) : null}
            </>
          )}

          {live.error ? (
            <Text className="text-[11px] font-bold mt-3 px-1 text-red-500">{live.error}</Text>
          ) : shareState === 'copied' || shareState === 'shared' ? (
            <Text className="text-[11px] font-bold mt-3 px-1 text-green-600">
              {shareState === 'copied' ? 'Link copied to clipboard.' : 'Link shared.'}
            </Text>
          ) : null}
        </Card>

        <View className="flex-row items-center gap-2 mt-6 px-1">
          <Vibrate color={colors.muted} size={14} />
          <Text className="text-[11px] text-slate-400 font-medium flex-1">
            {Platform.OS === 'web'
              ? 'Shake-to-SOS works on phones: shake hard three times to start an SOS countdown.'
              : settings.shakeToSos === false
                ? 'Shake-to-SOS is off. Turn it on in Settings.'
                : 'Shake-to-SOS is on: shake your phone hard three times to start an SOS countdown.'}
          </Text>
        </View>
      </ScrollView>

      <SirenStrobe visible={sirenOn} onStop={() => setSirenOn(false)} />
      <FakeCall visible={ringing} caller={callerRef.current} onEnd={() => setRinging(false)} />
    </Screen>
  );
}
