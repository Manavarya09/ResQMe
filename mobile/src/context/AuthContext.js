import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { getItem, setItem, removeItem, getJSON, setJSON } from '../lib/storage';

export const DEFAULT_SETTINGS = {
  impactDetection: true,
  sensitivity: 'medium',
  shareLocation: true,
  shareMedical: true,
  hazardAlerts: true,
  biometricLock: false,
  satelliteFallback: false,
  speakReplies: false,
};

const AuthContext = createContext(null);
const TOKEN_KEY = 'resqme.token';
const USER_KEY = 'resqme.user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback(async (nextToken, nextUser) => {
    setAuthToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    if (nextToken) {
      await setItem(TOKEN_KEY, nextToken);
      await setJSON(USER_KEY, nextUser);
      connectSocket(nextToken);
    } else {
      await removeItem(TOKEN_KEY);
      await removeItem(USER_KEY);
      disconnectSocket();
    }
  }, []);

  const logout = useCallback(() => applySession(null, null), [applySession]);

  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    (async () => {
      const saved = await getItem(TOKEN_KEY);
      const cachedUser = await getJSON(USER_KEY);
      if (saved) {
        // Restore immediately from cache so the app works offline, then refresh in the background.
        await applySession(saved, cachedUser);
        api.me().then((u) => { setUser(u); setJSON(USER_KEY, u); }).catch(() => {});
      }
      setReady(true);
    })();
  }, [applySession, logout]);

  // Returns { mfaRequired, mfaToken } when the account has two-factor auth; the caller then
  // collects a code and finishes with verifyMfa().
  const login = useCallback(async (email, password) => {
    const res = await api.login({ email: email.trim().toLowerCase(), password });
    if (res.mfaRequired) return { mfaRequired: true, mfaToken: res.mfaToken };
    await applySession(res.token, res.user);
    return { mfaRequired: false };
  }, [applySession]);

  const verifyMfa = useCallback(async (mfaToken, code) => {
    const { token: t, user: u } = await api.verifyMfa({ mfaToken, code: code.trim() });
    await applySession(t, u);
  }, [applySession]);

  // Replace the session token (e.g. after a password change bumps the token version).
  const replaceSession = useCallback((t, u) => applySession(t, u), [applySession]);
  const refreshUser = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
      await setJSON(USER_KEY, u);
    } catch {}
  }, []);

  const register = useCallback(async (payload) => {
    const { token: t, user: u } = await api.register({ ...payload, email: payload.email.trim().toLowerCase() });
    await applySession(t, u);
  }, [applySession]);

  const updateProfile = useCallback(async (patch) => {
    const optimistic = { ...user, ...patch, settings: { ...(user?.settings || {}), ...(patch.settings || {}) } };
    setUser(optimistic);
    await setJSON(USER_KEY, optimistic);
    try {
      const saved = await api.updateMe(patch);
      setUser(saved);
      await setJSON(USER_KEY, saved);
    } catch {
      // Keep the optimistic local copy; it syncs on the next successful change.
    }
  }, [user]);

  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(user?.settings || {}) }), [user]);
  const updateSettings = useCallback((patch) => updateProfile({ settings: patch }), [updateProfile]);
  // First-run setup is shown once per account until the user finishes (or skips) onboarding.
  const needsOnboarding = !!token && !!user && settings.onboarded !== true;

  const value = useMemo(
    () => ({ token, user, ready, settings, needsOnboarding, login, verifyMfa, register, logout, replaceSession, refreshUser, updateProfile, updateSettings }),
    [token, user, ready, settings, needsOnboarding, login, verifyMfa, register, logout, replaceSession, refreshUser, updateProfile, updateSettings]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
