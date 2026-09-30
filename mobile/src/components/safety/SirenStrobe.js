import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, Platform, Vibration, StatusBar } from 'react-native';
import * as Brightness from 'expo-brightness';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Siren } from 'lucide-react-native';
import Text from '../Text';
import { playLoop, SOUNDS } from '../../lib/sound';

const KEEP_AWAKE_TAG = 'resqme-siren';
const STROBE_MS = 110;

// Full-screen loud siren + red/white strobe at max brightness. Everything is restored on stop.
export default function SirenStrobe({ visible, onStop }) {
  const [flash, setFlash] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let stopSound = null;
    const startedAt = Date.now();

    playLoop(SOUNDS.siren).then((stop) => {
      if (cancelled) stop();
      else stopSound = stop;
    });
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    Vibration.vibrate(Platform.OS === 'android' ? [0, 500, 250] : 1000, true);
    maxBrightness().then((restore) => {
      if (cancelled) restore();
      else restoreRef.current = restore;
    });

    const strobe = setInterval(() => setFlash((f) => !f), STROBE_MS);
    const clock = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    return () => {
      cancelled = true;
      clearInterval(strobe);
      clearInterval(clock);
      stopSound?.();
      Vibration.cancel();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      restoreRef.current?.();
      restoreRef.current = null;
      setElapsed(0);
    };
  }, [visible]);

  const bg = flash ? '#ffffff' : '#ef4444';
  const fg = flash ? '#ef4444' : '#ffffff';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onStop} statusBarTranslucent supportedOrientations={['portrait']}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'space-between', paddingTop: 90, paddingBottom: 70, paddingHorizontal: 24 }}>
        <View style={{ alignItems: 'center' }}>
          <Siren color={fg} size={72} />
          <Text className="font-extrabold" style={{ color: fg, fontSize: 44, marginTop: 18, letterSpacing: 2 }}>HELP</Text>
          <Text className="font-bold" style={{ color: fg, fontSize: 16, marginTop: 6, textAlign: 'center' }}>
            I need assistance. Please call emergency services.
          </Text>
          <Text className="font-mono" style={{ color: fg, fontSize: 13, marginTop: 14, opacity: 0.85 }}>
            {`${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`}
          </Text>
        </View>

        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Stop siren"
          style={({ pressed }) => ({
            width: 200, height: 200, borderRadius: 100, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center',
            borderWidth: 6, borderColor: '#ffffff', transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <Text className="font-extrabold" style={{ color: '#fff', fontSize: 40, letterSpacing: 3 }}>STOP</Text>
          <Text className="font-semibold" style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Tap to silence</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// Sets screen brightness to 100% and returns a function that restores the previous level.
async function maxBrightness() {
  if (Platform.OS === 'web') return () => {};
  try {
    if (!(await Brightness.isAvailableAsync())) return () => {};
    const prev = await Brightness.getBrightnessAsync();
    await Brightness.setBrightnessAsync(1);
    return () => {
      // Android: drop the per-window override so the system level (and auto-brightness) applies again.
      const restore = Platform.OS === 'android' ? Brightness.restoreSystemBrightnessAsync() : Brightness.setBrightnessAsync(prev);
      restore.catch(() => {});
    };
  } catch {
    return () => {};
  }
}
