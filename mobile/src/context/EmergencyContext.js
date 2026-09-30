import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SMS from 'expo-sms';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { mapsLink } from '../lib/geo';
import { analyzeWindow, createImpactDetector } from '../lib/impactDetector';
import { startMotionStream, syntheticFall } from '../lib/sensors';
import { ESCALATION_SECONDS, LIVE_LOCATION_INTERVAL_MS } from '../config';
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
const EmergencyContext = createContext(null);

export function EmergencyProvider({ children }) {
  const { user, settings, token } = useAuth();
  const { location } = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  const [pending, setPending] = useState(null); // { trigger, extra, seconds }
  const [sending, setSending] = useState(false);
  const [incident, setIncident] = useState(null);
  const [drone, setDrone] = useState(null);
  const [error, setError] = useState(null);
  const [sensorsActive, setSensorsActive] = useState(false);
  const [lastImpact, setLastImpact] = useState(null);
  const incidentRef = useRef(null);
  incidentRef.current = incident;

  // ---------- escalation ----------
  const notifyContacts = useCallback(async (trigger, created) => {
    if (Platform.OS === 'web') return;
    try {
      if (!(await SMS.isAvailableAsync())) return;
      const contacts = created?.contactsSnapshot?.length ? created.contactsSnapshot : await api.contacts().catch(() => []);
      const phones = contacts.map((c) => c.phone).filter(Boolean);
      if (!phones.length) return;
      const loc = locationRef.current;
      const msg = `🚨 EMERGENCY — ${user?.name || 'A ResQMe user'} may need help (${TRIGGER_LABEL[trigger]}). ` +
        `Live location: ${mapsLink(loc)} . Emergency services have been alerted via ResQMe.`;
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
    try {
      created = await api.createIncident({
        trigger,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy ?? undefined,
        note: extra.note,
        impact: extra.impact,
        sensorWindow: extra.samples?.slice(-250),
        shareMedical: settings.shareMedical,
      });
      setIncident(created);
    } catch (e) {
      // Server unreachable: keep an offline incident so the user still gets dial + SMS + guidance.
      setError(e.message);
      created = { id: null, offline: true, trigger, status: 'open', lat: loc.lat, lng: loc.lng, createdAt: new Date().toISOString(), triage: null };
      setIncident(created);
    } finally {
      setSending(false);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    navigate('Incident');
    notifyContacts(trigger, created);
  }, [settings.shareMedical, notifyContacts]);

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
      try { setIncident(await api.cancelIncident(cur.id)); } catch (e) { setError(e.message); }
    } else {
      setIncident(null);
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
    setIncident(null);
    setDrone(null);
  }, []);

  // Restore an in-progress incident after an app restart.
  useEffect(() => {
    if (!token) { setIncident(null); return; }
    api.incidents()
      .then((list) => {
        const active = list?.find((i) => ACTIVE.includes(i.status));
        if (active) setIncident(active);
      })
      .catch(() => {});
  }, [token]);

  // Real-time updates from responders and the drone simulator.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (inc) => {
      if (incidentRef.current?.id === inc.id) {
        setIncident(inc);
        if (['acknowledged', 'resolved'].includes(inc.status)) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    };
    const onDrone = (d) => {
      if (d.incidentId && d.incidentId === incidentRef.current?.id) setDrone(d);
    };
    socket.on('incident:updated', onUpdate);
    socket.on('drone:update', onDrone);
    return () => {
      socket.off('incident:updated', onUpdate);
      socket.off('drone:update', onDrone);
    };
  }, [token]);

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
    isActive: !!incident && ACTIVE.includes(incident.status),
    requestEmergency, cancelPending, escalate, cancelIncident, requestDrone, refreshIncident, dismissIncident, simulateImpact,
  }), [pending, sending, incident, drone, error, sensorsActive, lastImpact, requestEmergency, cancelPending, escalate, cancelIncident, requestDrone, refreshIncident, dismissIncident, simulateImpact]);

  return (
    <EmergencyContext.Provider value={value}>
      {children}
      <EmergencyOverlay />
    </EmergencyContext.Provider>
  );
}

export const useEmergency = () => useContext(EmergencyContext);
