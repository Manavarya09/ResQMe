import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4100;

// On a phone running Expo Go, the dev server's host (hostUri) is the PC's LAN IP — the backend
// runs on the same PC, so we reuse that host. EXPO_PUBLIC_API_URL overrides for deployed backends.
function resolveApiBase() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  if (Platform.OS === 'web') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${host}:${API_PORT}`;
  }
  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];
  return `http://${host || 'localhost'}:${API_PORT}`;
}

export const API_BASE = resolveApiBase();

// Used when GPS is unavailable (web preview without permission, emulator) so the map still renders.
export const DEFAULT_LOCATION = { lat: 28.6139, lng: 77.209, accuracy: null, isFallback: true };

export const ESCALATION_SECONDS = { impact: 30, route_deviation: 30, timer_expired: 30, sos: 5, manual: 5 };
export const ROUTE_CORRIDOR_M = 150;
export const ROUTE_DEVIATION_GRACE_S = 60;
export const ARRIVAL_RADIUS_M = 80;
export const LIVE_LOCATION_INTERVAL_MS = 15000;
