import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Animated, Easing, ActivityIndicator } from 'react-native';
import { ShieldCheck, Siren } from 'lucide-react-native';
import { useEmergency, TRIGGER_LABEL } from '../context/EmergencyContext';
import { PressScale } from './ui';

const COPY = {
  impact: 'We detected a hard impact. Are you okay?',
  route_deviation: 'You left your safety route. Are you okay?',
  timer_expired: "You haven't reached your destination in time. Are you okay?",
  sos: 'Sending an SOS to responders and your contacts.',
  manual: 'Sending an alert to responders.',
};

// Full-screen "Are you OK?" confirmation. If nobody answers, help is sent automatically —
// this is the false-alarm filter from the proposal's road-accident workflow.
export default function EmergencyOverlay() {
  const { pending, sending, cancelPending, escalate } = useEmergency();
  const [left, setLeft] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pending) return;
    setLeft(pending.seconds);
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = pending.seconds - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(id);
        escalate(pending.trigger, pending.extra);
      }
    }, 250);
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => { clearInterval(id); loop.stop(); pulse.setValue(0); };
  }, [pending, escalate, pulse]);

  const visible = !!pending || sending;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(127, 29, 29, 0.94)' }}>
        {sending ? (
          <View className="items-center">
            <ActivityIndicator color="#fff" size="large" />
            <Text className="text-white text-xl font-extrabold mt-6">Alerting responders…</Text>
            <Text className="text-red-100 text-sm mt-2 text-center">Sharing your location and medical ID</Text>
          </View>
        ) : pending ? (
          <>
            <View className="flex-row items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 mb-8">
              <Siren color="#fff" size={16} />
              <Text className="text-white text-xs font-extrabold uppercase tracking-widest">{TRIGGER_LABEL[pending.trigger]}</Text>
            </View>
            <Text className="text-white text-2xl font-extrabold text-center leading-8 mb-10">{COPY[pending.trigger]}</Text>

            <View className="items-center justify-center mb-10" style={{ width: 200, height: 200 }}>
              <Animated.View style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#fff', opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
              <View className="w-48 h-48 rounded-full bg-white items-center justify-center">
                <Text className="text-red-600 font-black" style={{ fontSize: 72, lineHeight: 80 }}>{left}</Text>
                <Text className="text-red-400 text-[11px] font-extrabold uppercase tracking-widest">seconds</Text>
              </View>
            </View>

            <Text className="text-red-100 text-sm text-center mb-8">Help will be sent automatically when the timer ends.</Text>

            <PressScale onPress={cancelPending} accessibilityLabel="I'm OK, cancel alert" style={{ width: '100%' }}>
              <View className="h-16 rounded-2xl bg-white flex-row items-center justify-center gap-3 mb-4">
                <ShieldCheck color="#16a34a" size={24} />
                <Text className="text-green-700 text-lg font-extrabold uppercase tracking-wide">I'm OK</Text>
              </View>
            </PressScale>
            <PressScale onPress={() => escalate(pending.trigger, pending.extra)} accessibilityLabel="Send help now" style={{ width: '100%' }}>
              <View className="h-14 rounded-2xl border-2 border-white/70 items-center justify-center">
                <Text className="text-white text-base font-extrabold uppercase tracking-wide">Send help now</Text>
              </View>
            </PressScale>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
