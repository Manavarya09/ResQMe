import React from 'react';
import { View, Pressable, TextInput, Switch, ActivityIndicator, Animated } from 'react-native';
import Text from './Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, raised, inset, fonts } from '../theme';

export function Screen({ children, className = '', edges = ['top'] }) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-bg-base ${className}`}>
      {children}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, onBack, right }) {
  return (
    <View className="flex-row items-center justify-between px-5 pt-2 pb-3">
      <View className="flex-row items-center gap-3 flex-1">
        {onBack && (
          <IconButton onPress={onBack} accessibilityLabel="Back">
            <ChevronLeft color={colors.sub} size={22} />
          </IconButton>
        )}
        <View className="flex-1">
          <Text className="text-2xl font-extrabold text-slate-800" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text className="text-xs font-semibold text-text-sub mt-0.5" numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function Card({ children, className = '', style, depth = 1, onPress }) {
  const pad = /(^|\s)p-/.test(className) ? '' : 'p-5';
  const body = (
    <View className={`bg-bg-base rounded-3xl ${pad} border border-white/60 ${className}`} style={[raised(depth), style]}>
      {children}
    </View>
  );
  return onPress ? <PressScale onPress={onPress}>{body}</PressScale> : body;
}

export function Inset({ children, className = '', style }) {
  return (
    <View className={`rounded-2xl p-4 ${className}`} style={[inset(), style]}>
      {children}
    </View>
  );
}

export function PressScale({ children, onPress, onLongPress, disabled, style, accessibilityLabel }) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => to(0.96)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>{children}</Animated.View>
    </Pressable>
  );
}

export function IconButton({ children, onPress, size = 40, className = '', accessibilityLabel }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={accessibilityLabel}>
      <View
        className={`rounded-full bg-bg-base items-center justify-center border border-white ${className}`}
        style={[{ width: size, height: size }, raised(0.6)]}
      >
        {children}
      </View>
    </PressScale>
  );
}

const BTN = {
  primary: { bg: 'bg-primary', text: 'text-white' },
  danger: { bg: 'bg-accent-red', text: 'text-white' },
  success: { bg: 'bg-green-600', text: 'text-white' },
  ghost: { bg: 'bg-bg-base border border-white', text: 'text-slate-700' },
};

export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled, className = '', size = 'md' }) {
  const v = BTN[variant];
  const h = size === 'lg' ? 'h-16' : size === 'sm' ? 'h-10' : 'h-13';
  return (
    <PressScale onPress={onPress} disabled={disabled || loading} accessibilityLabel={title}>
      <View
        className={`${v.bg} ${h} rounded-2xl flex-row items-center justify-center gap-2 px-5 ${className}`}
        style={[size === 'md' ? { height: 52 } : null, raised(variant === 'ghost' ? 0.7 : 0.5)]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? colors.primary : '#fff'} />
        ) : (
          <>
            {Icon ? <Icon color={variant === 'ghost' ? colors.primary : '#fff'} size={size === 'sm' ? 16 : 20} /> : null}
            <Text className={`${v.text} font-extrabold ${size === 'lg' ? 'text-lg' : 'text-sm'} uppercase tracking-wide`}>{title}</Text>
          </>
        )}
      </View>
    </PressScale>
  );
}

export function SectionLabel({ children, right, className = '' }) {
  return (
    <View className={`flex-row items-center justify-between mb-3 mt-6 px-1 ${className}`}>
      <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{children}</Text>
      {right}
    </View>
  );
}

export function Pill({ label, color = colors.primary, bg, className = '' }) {
  return (
    <View className={`flex-row items-center gap-1.5 px-2.5 py-1 rounded-full self-start ${className}`} style={{ backgroundColor: bg || `${color}1a` }}>
      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color }}>{label}</Text>
    </View>
  );
}

export function Field({ label, className = '', ...props }) {
  return (
    <View className={`mb-4 ${className}`}>
      {label ? <Text className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400 mb-2 ml-1">{label}</Text> : null}
      <View className="rounded-2xl px-4" style={inset()}>
        <TextInput
          placeholderTextColor={colors.muted}
          className="h-12 text-slate-700 font-semibold text-[15px]"
          style={{ outlineStyle: 'none', fontFamily: fonts.semibold }}
          {...props}
        />
      </View>
    </View>
  );
}

export function ToggleRow({ icon: Icon, title, subtitle, value, onValueChange, disabled, last, iconColor = colors.primary }) {
  return (
    <View className={`flex-row items-center justify-between py-3.5 px-3 ${last ? '' : 'border-b border-slate-200/70'}`}>
      <View className="flex-row items-center gap-3 flex-1 pr-3">
        {Icon ? (
          <View className="w-10 h-10 rounded-full bg-bg-base items-center justify-center border border-white" style={raised(0.4)}>
            <Icon color={iconColor} size={18} />
          </View>
        ) : null}
        <View className="flex-1">
          <Text className="text-sm font-bold text-slate-700">{title}</Text>
          {subtitle ? <Text className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</Text> : null}
        </View>
      </View>
      <Switch
        value={!!value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#d7dce5', true: colors.primary }}
        thumbColor="#ffffff"
        ios_backgroundColor="#d7dce5"
      />
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <View className="items-center py-10 px-6">
      {Icon ? (
        <View className="w-16 h-16 rounded-full bg-bg-base items-center justify-center border border-white mb-4" style={raised(0.6)}>
          <Icon color={colors.muted} size={28} />
        </View>
      ) : null}
      <Text className="text-base font-bold text-slate-700 text-center">{title}</Text>
      {body ? <Text className="text-xs text-slate-400 text-center mt-1 leading-5">{body}</Text> : null}
      {action ? <View className="mt-4">{action}</View> : null}
    </View>
  );
}
