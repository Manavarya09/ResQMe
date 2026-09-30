import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, Platform } from 'react-native';
import Text from './Text';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { colors, glow } from '../theme';

const HOLD_MS = 1500;
const SIZE = 220;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Press-and-hold SOS: the hold (with a progress ring and haptic ticks) prevents pocket-dials
// while staying one gesture away in a real emergency.
export default function SOSButton({ onTrigger, active }) {
  const progress = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const [holding, setHolding] = useState(false);
  const anim = useRef(null);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const start = () => {
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    anim.current = Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      if (finished) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        progress.setValue(0);
        setHolding(false);
        onTrigger?.();
      }
    });
  };
  const stop = () => {
    anim.current?.stop();
    setHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const dashoffset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });
  const halo = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const haloOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.08] });

  return (
    <View className="items-center justify-center" style={{ width: SIZE + 60, height: SIZE + 60 }}>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', width: SIZE + 50, height: SIZE + 50, borderRadius: (SIZE + 50) / 2, backgroundColor: colors.red, opacity: haloOpacity, transform: [{ scale: halo }] }}
      />
      <Pressable
        onPressIn={start}
        onPressOut={stop}
        accessibilityRole="button"
        accessibilityLabel="Hold for SOS"
        style={Platform.OS === 'web' ? { userSelect: 'none', cursor: 'pointer' } : null}
      >
        <View style={[{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }, glow(colors.red)]} className="items-center justify-center bg-accent-red">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: SIZE - 34, height: SIZE - 34, backgroundColor: holding ? '#b91c1c' : '#dc2626', borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)' }}
          >
            <Text className="text-white font-black tracking-widest" style={{ fontSize: 52, lineHeight: 58 }}>SOS</Text>
            <Text className="text-red-100 text-[11px] font-extrabold uppercase tracking-widest mt-1">
              {active ? 'Help is active' : holding ? 'Keep holding…' : 'Hold 1.5 sec'}
            </Text>
          </View>
          <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }} pointerEvents="none">
            <AnimatedCircle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke="#fff"
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
        </View>
      </Pressable>
    </View>
  );
}
