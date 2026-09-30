import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { getJSON, setJSON } from '../lib/storage';
import { shareLocation } from '../lib/share';
import { pruneShares, shareIsLive, shouldPush, SHARE_PUSH_INTERVAL_MS, MAX_SHARE_MINUTES } from '../lib/liveShare';
import { useAuth } from '../context/AuthContext';
import { useLocation } from '../context/LocationContext';

// Live location shares live in one small module-level store so the Safety Tools screen, the
// emergency flow and the background push loop all see the same links. Each share keeps its raw
// token (needed to rebuild the link) in secure storage, so an active share survives a restart.
const STORAGE_KEY = 'resqme.liveShares';

let shares = [];
let currentUserId = null;
let lastPushAt = 0;
let pushing = false;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribeStore = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => shares;

function setShares(next, { persist = true } = {}) {
  shares = next;
  if (persist && currentUserId) setJSON(STORAGE_KEY, { userId: currentUserId, shares: next });
  emit();
}

const shareFromResponse = (res, extra) => ({
  id: res.id,
  token: res.token,
  url: res.url,
  absoluteUrl: res.absoluteUrl,
  expiresAt: res.expiresAt,
  incidentId: res.incidentId || extra.incidentId || null,
  untilStopped: !!extra.untilStopped,
  userId: currentUserId,
  createdAt: new Date().toISOString(),
});

/** Create a live share. Returns the stored share object (with absoluteUrl). Throws ApiError. */
export async function startLiveShare({ durationMinutes = 60, incidentId = null, location = null, untilStopped = false, timeoutMs } = {}) {
  const minutes = Math.min(MAX_SHARE_MINUTES, Math.max(15, Math.round(durationMinutes)));
  const body = { durationMinutes: minutes };
  if (incidentId) body.incidentId = incidentId;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng) && !location.isFallback) {
    body.lat = location.lat;
    body.lng = location.lng;
    if (Number.isFinite(location.accuracy)) body.accuracy = location.accuracy;
  }
  const res = await api.createLocationShare(body, timeoutMs ? { timeoutMs } : undefined);
  const share = shareFromResponse(res, { incidentId, untilStopped });
  lastPushAt = Date.now();
  setShares([share, ...pruneShares(shares)]);
  return share;
}

/** Revoke a share on the server (best effort) and forget it locally. */
export async function stopLiveShare(id) {
  setShares(shares.filter((s) => s.id !== id));
  try {
    await api.stopLocationShare(id);
  } catch (e) {
    if (e?.status !== 404) throw e;
  }
}

export async function stopSharesForIncident(incidentId) {
  const ids = shares.filter((s) => s.incidentId && s.incidentId === incidentId).map((s) => s.id);
  await Promise.all(ids.map((id) => stopLiveShare(id).catch(() => {})));
}

/**
 * Push a location to every active share, at most once per 15 s across all callers
 * (the location watch, the fallback timer and the incident live-location interval).
 */
export async function pushShareLocation(loc, { force = false } = {}) {
  const live = pruneShares(shares);
  if (live.length !== shares.length) setShares(live);
  if (!live.length || !loc || loc.isFallback || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return;
  if (pushing || (!force && !shouldPush(lastPushAt))) return;
  pushing = true;
  lastPushAt = Date.now();
  const body = { lat: loc.lat, lng: loc.lng };
  if (Number.isFinite(loc.accuracy)) body.accuracy = loc.accuracy;
  try {
    const gone = [];
    await Promise.all(live.map((s) => api.pushShareLocation(s.id, body).catch((e) => {
      // revoked elsewhere or expired on the server: stop pushing to it
      if (e?.status === 404 || e?.status === 410) gone.push(s.id);
    })));
    if (gone.length) setShares(shares.filter((s) => !gone.includes(s.id)));
  } finally {
    pushing = false;
  }
}

export const getActiveShares = () => pruneShares(shares);

/**
 * Background driver: mount exactly once for the signed-in session (EmergencyProvider does).
 * Restores persisted shares, reconciles them with the server, pushes location every 15 s and
 * drops shares as they expire.
 */
export function useLocationShareDriver() {
  const { user, token } = useAuth();
  const { location, subscribe } = useLocation();
  const locRef = useRef(location);
  locRef.current = location;
  const userId = token ? user?.id || null : null;

  // restore / switch account
  useEffect(() => {
    currentUserId = userId;
    lastPushAt = 0;
    if (!userId) { setShares([], { persist: false }); return undefined; }
    let cancelled = false;
    (async () => {
      const saved = await getJSON(STORAGE_KEY);
      if (cancelled) return;
      const restored = saved?.userId === userId ? pruneShares(saved.shares, { userId }) : [];
      setShares(restored);
      if (!restored.length) return;
      // the server is the source of truth for revocations made from another device
      try {
        const server = await api.locationShares();
        if (cancelled || !Array.isArray(server)) return;
        const ids = new Set(server.filter((s) => s.active !== false).map((s) => s.id));
        setShares(shares.filter((s) => ids.has(s.id)));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // push on every GPS fix (throttled) plus a timer for when the phone is standing still
  useEffect(() => {
    if (!userId) return undefined;
    const unsub = subscribe ? subscribe((loc) => { if (shares.length) pushShareLocation(loc); }) : null;
    const id = setInterval(() => { if (shares.length) pushShareLocation(locRef.current); }, SHARE_PUSH_INTERVAL_MS);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active' && shares.length) pushShareLocation(locRef.current, { force: true });
    });
    return () => {
      unsub?.();
      clearInterval(id);
      app.remove();
    };
  }, [userId, subscribe]);
}

/** UI hook: current shares + actions. Safe to use in any number of screens. */
export function useLocationShare() {
  const { user } = useAuth();
  const { location } = useLocation();
  const all = useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(null); // null | 'start' | 'stop' | 'share'
  const [error, setError] = useState(null);

  const active = all.filter((s) => shareIsLive(s, now));
  const hasActive = active.length > 0;

  // tick for "time left" and auto-expiry
  useEffect(() => {
    if (!hasActive) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (shares.some((s) => !shareIsLive(s, t))) setShares(pruneShares(shares, { now: t }));
    }, 1000);
    return () => clearInterval(id);
  }, [hasActive]);

  const openSheet = useCallback(async (share) => {
    setBusy('share');
    try {
      return await shareLocation(location, {
        name: user?.name?.split(' ')[0], liveUrl: share.absoluteUrl, expiresAt: share.expiresAt, untilStopped: share.untilStopped,
      });
    } catch {
      return false;
    } finally {
      setBusy(null);
    }
  }, [location, user?.name]);

  const start = useCallback(async ({ minutes, untilStopped }) => {
    setBusy('start');
    setError(null);
    try {
      const share = await startLiveShare({ durationMinutes: minutes, untilStopped, location });
      setNow(Date.now());
      setBusy(null);
      const result = await openSheet(share);
      return { share, result };
    } catch (e) {
      setError(e?.message || 'Could not start sharing.');
      setBusy(null);
      return null;
    }
  }, [location, openSheet]);

  const stop = useCallback(async (id) => {
    setBusy('stop');
    setError(null);
    try {
      await stopLiveShare(id);
    } catch (e) {
      setError(e?.message || 'Could not stop sharing.');
    } finally {
      setBusy(null);
    }
  }, []);

  return { shares: active, primary: active[0] || null, now, busy, error, start, stop, share: openSheet };
}
