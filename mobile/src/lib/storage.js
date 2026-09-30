import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Secrets (session token, cached medical ID) go to the OS keychain on device; web has no
// keychain so it falls back to AsyncStorage (localStorage).
const secure = Platform.OS !== 'web';

export async function getItem(key) {
  try {
    return secure ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    if (value == null) return removeItem(key);
    return secure ? await SecureStore.setItemAsync(key, value) : await AsyncStorage.setItem(key, value);
  } catch {}
}

export async function removeItem(key) {
  try {
    return secure ? await SecureStore.deleteItemAsync(key) : await AsyncStorage.removeItem(key);
  } catch {}
}

export async function getJSON(key, fallback = null) {
  const raw = await getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const setJSON = (key, value) => setItem(key, JSON.stringify(value));
