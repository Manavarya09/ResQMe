import { Platform } from 'react-native';

// Original ResQMe palette: soft neumorphic surfaces with an orange accent.
// Semantic aliases (stone, ink, signal, sos, ok…) point at the same values for new screens.
export const colors = {
  primary: '#f48c25',
  primaryLight: '#ffb673',
  primaryDark: '#d9730f',
  red: '#ef4444',
  redDark: '#dc2626',
  redLight: '#fca5a5',
  green: '#16a34a',
  greenLight: '#22c55e',
  blue: '#3b82f6',
  yellow: '#ca8a04',
  base: '#eef0f5',
  white: '#ffffff',
  text: '#374151',
  textStrong: '#1e293b',
  sub: '#6b7280',
  muted: '#94a3b8',
  line: '#e2e8f0',

  stone: '#eef0f5',
  stoneDeep: '#e4e8ef',
  ink: '#1e293b',
  ink2: '#475569',
  ink3: '#94a3b8',
  signal: '#f48c25',
  signalSoft: '#fff1e3',
  sos: '#ef4444',
  sosSoft: '#fee2e2',
  ok: '#16a34a',
  okSoft: '#dcfce7',
  info: '#3b82f6',
  warn: '#ca8a04',
};

export const severityColor = { low: '#16a34a', medium: '#ca8a04', high: '#f48c25', critical: '#ef4444' };

export const fonts = {
  body: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_500Medium',
};

// Neumorphic raised surface. Web gets a true dual (light + dark) shadow; native approximates with one.
export const raised = (depth = 1) =>
  Platform.OS === 'web'
    ? { boxShadow: `${6 * depth}px ${6 * depth}px ${14 * depth}px rgba(163,177,198,0.55), -${5 * depth}px -${5 * depth}px ${12 * depth}px rgba(255,255,255,0.9)` }
    : { shadowColor: '#a3b1c6', shadowOffset: { width: 5 * depth, height: 5 * depth }, shadowOpacity: 0.45, shadowRadius: 9 * depth, elevation: 4 * depth };

export const inset = () =>
  Platform.OS === 'web'
    ? { boxShadow: 'inset 4px 4px 8px rgba(163,177,198,0.45), inset -4px -4px 8px rgba(255,255,255,0.85)' }
    : { backgroundColor: '#e6e9f0', borderWidth: 1, borderColor: '#dde2ea' };

export const glow = (color = colors.primary) =>
  Platform.OS === 'web'
    ? { boxShadow: `0 10px 30px ${color}66` }
    : { shadowColor: color, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 };
