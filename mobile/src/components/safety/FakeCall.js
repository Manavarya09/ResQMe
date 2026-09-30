import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, Animated, Easing, Platform, Vibration, StatusBar } from 'react-native';
import { Phone, PhoneOff, MicOff, Grid3x3, Volume2, UserPlus, Video, MessageSquare, Clock } from 'lucide-react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Text from '../Text';
import { playLoop, SOUNDS } from '../../lib/sound';

// Intentionally styled like the phone's own call screen (not the app) so it is believable.
const BG = '#0f1115';
const ACCEPT = '#34c759';
const DECLINE = '#ff3b30';
const KEEP_AWAKE_TAG = 'resqme-fake-call';
const RING_PATTERN = Platform.OS === 'android' ? [0, 1000, 1000] : 1000;

const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function FakeCall({ visible, caller = 'Mom', onEnd }) {
  const [phase, setPhase] = useState('ringing'); // ringing | active
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhase('ringing');
      setSeconds(0);
      setMuted(false);
      setSpeaker(false);
    }
  }, [visible]);

  // Ringtone + vibration while ringing.
  useEffect(() => {
    if (!visible || phase !== 'ringing') return;
    let cancelled = false;
    let stop = null;
    playLoop(SOUNDS.ringtone, { exclusive: false }).then((s) => (cancelled ? s() : (stop = s)));
    Vibration.vibrate(RING_PATTERN, true);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
      Vibration.cancel();
    };
  }, [visible, phase]);

  // Call timer once "answered".
  useEffect(() => {
    if (!visible || phase !== 'active') return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [visible, phase]);

  useEffect(() => () => deactivateKeepAwake(KEEP_AWAKE_TAG), []);

  const end = () => {
    Vibration.cancel();
    deactivateKeepAwake(KEEP_AWAKE_TAG);
    onEnd?.();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={end} statusBarTranslucent supportedOrientations={['portrait']}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: BG, paddingTop: 96, paddingBottom: 64, paddingHorizontal: 28 }}>
        <View style={{ alignItems: 'center' }}>
          <Text className="font-medium" style={{ color: '#9ca3af', fontSize: 15 }}>
            {phase === 'ringing' ? 'Incoming call' : clock(seconds)}
          </Text>
          <Text className="font-semibold" style={{ color: '#fff', fontSize: 38, marginTop: 8, textAlign: 'center' }} numberOfLines={2}>
            {caller}
          </Text>
          <Text className="font-medium" style={{ color: '#9ca3af', fontSize: 16, marginTop: 6 }}>mobile</Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar name={caller} ringing={phase === 'ringing'} />
        </View>

        {phase === 'ringing' ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 40 }}>
              <MiniAction icon={Clock} label="Remind me" />
              <MiniAction icon={MessageSquare} label="Message" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <CallButton color={DECLINE} icon={PhoneOff} label="Decline" onPress={end} />
              <CallButton color={ACCEPT} icon={Phone} label="Accept" onPress={() => setPhase('active')} pulse />
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 26, marginBottom: 44, paddingHorizontal: 6 }}>
              <GridAction icon={MicOff} label="mute" active={muted} onPress={() => setMuted((v) => !v)} />
              <GridAction icon={Grid3x3} label="keypad" />
              <GridAction icon={Volume2} label="speaker" active={speaker} onPress={() => setSpeaker((v) => !v)} />
              <GridAction icon={UserPlus} label="add call" />
              <GridAction icon={Video} label="video" />
              <GridAction icon={MessageSquare} label="message" />
            </View>
            <View style={{ alignItems: 'center' }}>
              <CallButton color={DECLINE} icon={PhoneOff} label="End" onPress={end} />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function Avatar({ name, ringing }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ringing) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [ringing, pulse]);
  const ring = (delay) => {
    const v = Animated.modulo(Animated.add(pulse, delay), 1);
    return {
      position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
    };
  };
  return (
    <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'center' }}>
      {ringing ? (
        <>
          <Animated.View style={ring(0)} />
          <Animated.View style={ring(0.5)} />
        </>
      ) : null}
      <View style={{ width: 140, height: 140, borderRadius: 70, backgroundColor: '#4b5563', alignItems: 'center', justifyContent: 'center' }}>
        <Text className="font-semibold" style={{ color: '#fff', fontSize: 52 }}>{initials(name)}</Text>
      </View>
    </View>
  );
}

function CallButton({ color, icon: Icon, label, onPress, pulse }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 450, useNativeDriver: true }),
      Animated.delay(500),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, bob]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
        <Animated.View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ translateY }] }}>
          <Icon color="#fff" size={32} fill={Icon === Phone ? '#fff' : 'none'} />
        </Animated.View>
      </Pressable>
      <Text className="font-medium" style={{ color: '#e5e7eb', fontSize: 14, marginTop: 10 }}>{label}</Text>
    </View>
  );
}

function MiniAction({ icon: Icon, label }) {
  return (
    <View style={{ alignItems: 'center', opacity: 0.85 }}>
      <Icon color="#e5e7eb" size={20} />
      <Text className="font-medium" style={{ color: '#e5e7eb', fontSize: 12, marginTop: 6 }}>{label}</Text>
    </View>
  );
}

function GridAction({ icon: Icon, label, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: '33%', alignItems: 'center' }}>
      <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon color={active ? BG : '#fff'} size={26} />
      </View>
      <Text className="font-medium" style={{ color: '#e5e7eb', fontSize: 12, marginTop: 8 }}>{label}</Text>
    </Pressable>
  );
}
