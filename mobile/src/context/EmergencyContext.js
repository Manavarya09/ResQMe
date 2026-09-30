import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SMS from 'expo-sms';
import { api } from '../lib/api';
import { getJSON, setJSON, removeItem } from '../lib/storage';
import { createRetryQueue, isRetryableError } from '../lib/retryQueue';
import { onSocketEvent } from '../lib/socket';
import { mapsLink } from '../lib/geo';
import { analyzeWindow, createImpactDetector } from '../lib/impactDetector';
import { startMotionStream, syntheticFall } from '../lib/sensors';
import { ESCALATION_SECONDS, LIVE_LOCATION_INTERVAL_MS } from '../config';
import { EMERGENCY_SHARE_MINUTES } from '../lib/liveShare';
import { useLocationShareDriver, startLiveShare, pushShareLocation, stopSharesForIncident } from '../hooks/useLocationShare';
import { useAuth } from './AuthContext';
import { useLocation } from './LocationContext';
import { navigate } from '../navigation/ref';
import EmergencyOverlay from '../components/EmergencyOverlay';

export const TRIGGER_LABEL = {
  sos: 'SOS button',
  impact: 'Impact detected',
  route_deviation: 'Left safety route',
  timer_expired: 'Safety timer expired',
  manual: 'Manual alert',
};

const ACTIVE = ['open', 'acknowledged', 'dispatched'];
const PENDING_KEY = 'resqme.pendingIncident';

// Offline stand-in shown while the real incident is queued for delivery.
const offlineIncident = (payload, queuedAt) => ({
  id: null, offline: true, pendingSync: true, trigger: payload.trigger, status: 'open',
  lat: payload.lat, lng: payload.lng, createdAt: queuedAt, triage: null,
});
const EmergencyContext = createContext(null);

export function EmergencyProvider({ children }) {
  const { user, settings, token } = useAuth();
  const { location } = useLocation();
  // background push loop for live location links (one per signed-in session)
  useLocationShareDriver();
  const locationRef = useRef(location);
  locationRef.current = location;

  const [pending, setPending] = useState(null); // { trigger, extra, seconds }
  const [sending, setSending] = useState(false);
  const [incident, setIncident] = useState(null);
  const [drone, setDrone] = useState(null);
  const [error, setError] = useState(null);
  const [sensorsActive, setSensorsActive] = useState(false);
  const [lastImpact, setLastImpact] = useState(null);
  // Offline SOS queue: the payload that failed to reach the server, retried until it lands.
  const [queued, setQueued] = useState(null); // { payload, queuedAt, userId }
  const incidentRef = useRef(null);
  incidentRef.current = incident;

  // ---------- escalation ----------
  // liveUrl: the /t/<token> live-location page; falls back to a static maps link when the
  // server could not create one (offline, consent off).
  const notifyContacts = useCallback(async (trigger, created, liveUrl) => {
    if (Platform.OS === 'web') return;
    try {
      if (!(await SMS.isAvailableAsync())) return;
      const contacts = created?.contactsSnapshot?.length ? created.contactsSnapshot : await api.contacts().catch(() => []);
      const phones = contacts.map((c) => c.phone).filter(Boolean);
      if (!phones.length) return;
      const loc = locationRef.current;
      const where = liveUrl ? `Live location (updates for 4 h): ${liveUrl}` : `Location: ${mapsLink(loc)}`;
      const msg = `EMERGENCY: ${user?.name || 'A ResQMe user'} may need help (${TRIGGER_LABEL[trigger]}). ` +
        `${where} . Emergency services have been alerted via ResQMe.`;
      await SMS.sendSMSAsync(phones, msg);
    } catch {}
  }, [user]);

  const escalate = useCallback(async (trigger, extra = {}) => {
    Vibration.cancel();
    setPending(null);
    setSending(true);
    setError(null);
    const loc = locationRef.current;
    let created = null;
    const payload = {
      trigger,
      lat: loc.lat,
      lng: loc.lng,
      accuracy: loc.accuracy ?? undefined,
      note: extra.note,
      impact: extra.impact,
      sensorWindow: extra.samples?.slice(-250),
      shareMedical: settings.shareMedical,
    };
    try {
      created = await api.createIncident(payload);
      setIncident(created);
    } catch (e) {
      // Server unreachable: keep an offline incident so the user still gets dial + SMS + guidance,
      // and queue the alert so it reaches responders as soon as the connection is back.
      setError(e.message);
      const queuedAt = new Date().toISOString();
      if (isRetryableError(e)) {
        const entry = { payload, queuedAt, userId: user?.id ?? null };
        setQueued(entry);
        // The raw sensor window can be large; persist without it (the in-memory retry keeps it).
        setJSON(PENDING_KEY, { ...entry, payload: { ...payload, sensorWindow: undefined } });
        created = offlineIncident(payload, queuedAt);
      } else {
        created = { ...offlineIncident(payload, queuedAt), pendingSync: false };
      }
      setIncident(created);
    } finally {
      setSending(false);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    navigate('Incident');
    // A 4-hour live link tied to the incident replaces the static maps link in the SMS. Consent-gated
    // like the incident location stream; short timeout so the SMS composer is never held up for long.
    let liveUrl = null;
    if (created?.id && !created.offline && settings.shareLocation) {
      try {
        const share = await startLiveShare({ durationMinutes: EMERGENCY_SHARE_MINUTES, incidentId: created.id, location: loc, timeoutMs: 6000 });
        liveUrl = share.absoluteUrl;
      } catch {}
    }
    notifyContacts(trigger, created, liveUrl);
  }, [settings.shareMedical, settings.shareLocation, notifyContacts, user?.id]);

  const requestEmergency = useCallback((trigger, extra = {}) => {
    if (incidentRef.current && ACTIVE.includes(incidentRef.current.status)) {
      navigate('Incident');
      return;
    }
    const seconds = extra.immediate ? 0 : ESCALATION_SECONDS[trigger] ?? 10;
    if (seconds === 0) return escalate(trigger, extra);
    Vibration.vibrate(Platform.OS === 'android' ? [0, 600, 400] : 1000, true);
    setPending({ trigger, extra, seconds });
  }, [escalate]);

  const cancelPending = useCallback(() => {
    Vibration.cancel();
    setPending(null);
  }, []);

  // ---------- active incident actions ----------
  const refreshIncident = useCallback(async () => {
    const cur = incidentRef.current;
    if (!cur?.id) return;
    try {
      const fresh = await api.incident(cur.id);
      setIncident(fresh);
    } catch {}
  }, []);

  const cancelIncident = useCallback(async () => {
    const cur = incidentRef.current;
    if (cur?.id) {
      try {
        setIncident(await api.cancelIncident(cur.id));
        // false alarm: stop the emergency live link too
        stopSharesForIncident(cur.id);
      } catch (e) { setError(e.message); }
    } else {
      // Offline incident: the user is safe, so drop the queued alert instead of delivering it later.
      setIncident(null);
      setQueued(null);
      removeItem(PENDING_KEY);
    }
    setDrone(null);
  }, []);

  const requestDrone = useCallback(async () => {
    const cur = incidentRef.current;
    if (!cur?.id) throw new Error('Drone dispatch needs a connection to ResQMe.');
    const d = await api.requestDrone(cur.id);
    setDrone(d);
    refreshIncident();
    return d;
  }, [refreshIncident]);

  const dismissIncident = useCallback(() => {
    if (incidentRef.current?.pendingSync) {
      setQueued(null);
      removeItem(PENDING_KEY);
    }
    setIncident(null);
    setDrone(null);
  }, []);

  // Restore a queued offline SOS after an app restart (only for the account that raised it).
  useEffect(() => {
    if (!token || !user?.id) return;
    let cancelled = false;
    getJSON(PENDING_KEY).then((entry) => {
      if (cancelled || !entry?.payload) return;
      if (entry.userId && entry.userId !== user.id) return;
      const cur = incidentRef.current;
      if (cur && !cur.offline && ACTIVE.includes(cur.status)) { removeItem(PENDING_KEY); return; }
      setQueued((q) => q || entry);
      setIncident((cur) => cur || offlineIncident(entry.payload, entry.queuedAt));
    });
    return () => { cancelled = true; };
  }, [token, user?.id]);

  // Deliver the queued SOS: retry every 10 s and immediately whenever the app returns to the
  // foreground. On success the offline stand-in is swapped for the real server incident in place,
  // so the Incident screen stays open and simply goes live.
  useEffect(() => {
    if (!token || !queued) return;
    const queue = createRetryQueue({
      task: () => api.createIncident(queued.payload),
      onSuccess: (created) => {
        removeItem(PENDING_KEY);
        setQueued(null);
        setError(null);
        setIncident((cur) => (!cur || cur.offline ? created : cur));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
      onFatal: (e) => {
        // The server rejected the payload itself — stop retrying and leave the offline guidance up.
        removeItem(PENDING_KEY);
        setQueued(null);
        setError(e.message);
        setIncident((cur) => (cur?.offline ? { ...cur, pendingSync: false } : cur));
      },
    });
    queue.start();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') queue.trigger(); });
    return () => {
      queue.stop();
      sub.remove();
    };
  }, [token, queued]);

  // Restore an in-progress incident after an app restart.
  useEffect(() => {
    if (!token) { setIncident(null); return; }
    api.incidents()
      .then((list) => {
        // responders receive every incident here — only restore the signed-in user's own
        const active = list?.find((i) => ACTIVE.includes(i.status) && (!user?.id || i.userId === user.id));
        if (!active) return;
        // A live server incident supersedes any queued offline alert (it most likely got through).
        setQueued(null);
        removeItem(PENDING_KEY);
        setIncident((cur) => (cur && !cur.offline ? cur : active));
      })
      .catch(() => {});
  }, [token, user?.id]);

  // Real-time updates from responders and the drone simulator.
  useEffect(() => {
    const onUpdate = (inc) => {
      if (incidentRef.current?.id === inc.id) {
        setIncident(inc);
        if (['acknowledged', 'resolved'].includes(inc.status)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    };
    const onDrone = (d) => {
      if (d.incidentId && d.incidentId === incidentRef.current?.id) setDrone(d);
    };
    const offUpdate = onSocketEvent('incident:updated', onUpdate);
    const offDrone = onSocketEvent('drone:update', onDrone);
    return () => {
      offUpdate();
      offDrone();
    };
  }, []);

  // Recover the assigned drone after a restart (the socket only pushes changes), and keep a slow
  // poll as a backup in case the socket drops mid-incident.
  useEffect(() => {
    const droneId = incident?.droneId;
    if (!droneId || !ACTIVE.includes(incident?.status)) return;
    const pull = () => api.drones().then((list) => {
      const d = list?.find((x) => x.id === droneId);
      if (d) setDrone(d);
    }).catch(() => {});
    pull();
    const id = setInterval(pull, 5000);
    return () => clearInterval(id);
  }, [incident?.droneId, incident?.status]);

  // Stream live location to responders while an incident is active (consent-gated).
  useEffect(() => {
    if (!incident?.id || !ACTIVE.includes(incident.status) || !settings.shareLocation) return;
    const send = () => {
      const l = locationRef.current;
      api.sendLocation(incident.id, { lat: l.lat, lng: l.lng }).catch(() => {});
      // keep the linked live-location page in step (throttled; no-op without an active share)
      pushShareLocation(l);
    };
    send();
    const id = setInterval(send, LIVE_LOCATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [incident?.id, incident?.status, settings.shareLocation]);

  // ---------- impact detection ----------
  useEffect(() => {
    if (!token || !settings.impactDetection) { setSensorsActive(false); return; }
    let stop = null;
    let cancelled = false;
    const detector = createImpactDetector({
      sensitivity: settings.sensitivity,
      onImpact: (result) => {
        setLastImpact({ ...result, samples: undefined, at: Date.now() });
        requestEmergency('impact', { impact: { peakG: result.peakG, freeFallMs: result.freeFallMs, classification: result.classification }, samples: result.samples });
      },
    });
    startMotionStream((s) => detector.push(s)).then((unsub) => {
      if (cancelled) return unsub?.();
      stop = unsub;
      setSensorsActive(!!unsub);
    });
    return () => {
      cancelled = true;
      stop?.();
      setSensorsActive(false);
    };
  }, [token, settings.impactDetection, settings.sensitivity, requestEmergency]);

  const simulateImpact = useCallback(() => {
    const samples = syntheticFall();
    const result = analyzeWindow(samples);
    setLastImpact({ ...result, at: Date.now(), simulated: true });
    requestEmergency('impact', { impact: { peakG: result.peakG, freeFallMs: result.freeFallMs, classification: result.classification }, samples });
  }, [requestEmergency]);

  const value = useMemo(() => ({
    pending, sending, incident, drone, error, sensorsActive, lastImpact,
    pendingSync: !!queued,
    isActive: !!incident && ACTIVE.includes(incident.status),
    requestEmergency, cancelPending, escalate, cancelIncident, requestDrone, refreshIncident, dismissIncident, simulateImpact,
  }), [pending, sending, incident, drone, error, sensorsActive, lastImpact, queued, requestEmergency, cancelPending, escalate, cancelIncident, requestDrone, refreshIncident, dismissIncident, simulateImpact]);

  return (
    <EmergencyContext.Provider value={value}>
      {children}
      <EmergencyOverlay />
    </EmergencyContext.Provider>
  );
}

export const useEmergency = () => useContext(EmergencyContext);
