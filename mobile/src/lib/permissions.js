import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Accelerometer } from 'expo-sensors';

// Normalised permission status: 'granted' | 'denied' | 'undetermined' | 'unavailable'.
const norm = (res) => {
  if (!res) return 'undetermined';
  if (res.granted || res.status === 'granted') return 'granted';
  if (res.status === 'denied') return 'denied';
  return 'undetermined';
};

const HANDLERS = {
  location: {
    check: () => Location.getForegroundPermissionsAsync(),
    request: () => Location.requestForegroundPermissionsAsync(),
  },
  notifications: {
    check: () => Notifications.getPermissionsAsync(),
    request: () => Notifications.requestPermissionsAsync(),
  },
  motion: {
    // Android grants motion sensors implicitly; iOS (and iOS Safari) asks the user once.
    available: () => (Platform.OS === 'web' && typeof window !== 'undefined' && !('DeviceMotionEvent' in window)
      ? Promise.resolve(false)
      : Accelerometer.isAvailableAsync()),
    check: () => (Accelerometer.getPermissionsAsync ? Accelerometer.getPermissionsAsync() : Promise.resolve({ status: 'granted' })),
    request: () => (Accelerometer.requestPermissionsAsync ? Accelerometer.requestPermissionsAsync() : Promise.resolve({ status: 'granted' })),
  },
};

export const PERMISSION_KINDS = Object.keys(HANDLERS);

export async function checkPermission(kind) {
  const h = HANDLERS[kind];
  try {
    if (h.available && !(await h.available().catch(() => false))) return 'unavailable';
    return norm(await h.check());
  } catch {
    return 'unavailable';
  }
}

export async function requestPermission(kind) {
  const h = HANDLERS[kind];
  try {
    if (h.available && !(await h.available().catch(() => false))) return 'unavailable';
    return norm(await h.request());
  } catch {
    return 'unavailable';
  }
}

export async function checkAllPermissions() {
  const entries = await Promise.all(PERMISSION_KINDS.map(async (k) => [k, await checkPermission(k)]));
  return Object.fromEntries(entries);
}
