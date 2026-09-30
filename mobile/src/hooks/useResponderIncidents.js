import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api } from '../lib/api';
import { onSocketEvent } from '../lib/socket';
import { useAuth } from '../context/AuthContext';
import { sortIncidents, upsertIncident, splitQueue, severityCounts } from '../lib/responderQueue';

// Live responder queue. One provider per responder session keeps a single socket subscription,
// so the new-incident vibration + banner fire once no matter how many screens read the queue.
const ResponderContext = createContext(null);
const BANNER_MS = 8000;

function useResponderIncidentsState() {
  const { token } = useAuth();
  const [incidents, setIncidents] = useState(null); // null = first load
  const [drones, setDrones] = useState([]);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState(null); // Incident | null
  const bannerTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const list = await api.incidentsQueue({ limit: 100 });
      setIncidents(sortIncidents(Array.isArray(list) ? list : []));
      setError(null);
    } catch (e) {
      setError(e.message);
      setIncidents((cur) => cur || []);
    }
  }, []);

  const loadDrones = useCallback(() => api.drones().then((d) => setDrones(Array.isArray(d) ? d : [])).catch(() => {}), []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadDrones()]);
    setRefreshing(false);
  }, [load, loadDrones]);

  const dismissBanner = useCallback(() => {
    clearTimeout(bannerTimer.current);
    setBanner(null);
  }, []);

  const merge = useCallback((inc) => setIncidents((cur) => upsertIncident(cur || [], inc)), []);

  useEffect(() => {
    if (!token) return undefined;
    load();
    loadDrones();
  }, [token, load, loadDrones]);

  useEffect(() => {
    if (!token) return undefined;
    const onNew = (inc) => {
      merge(inc);
      setBanner(inc);
      clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
      if (Platform.OS !== 'web') Vibration.vibrate(Platform.OS === 'android' ? [0, 400, 200, 400] : [0, 400]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    };
    const onUpdated = (inc) => merge(inc);
    const onLocation = ({ incidentId, lat, lng }) =>
      setIncidents((cur) => (cur || []).map((i) => (i.id === incidentId ? { ...i, lat, lng } : i)));
    const onDrone = (d) => setDrones((cur) => {
      const i = cur.findIndex((x) => x.id === d.id);
      if (i === -1) return [...cur, d];
      const next = [...cur];
      next[i] = d;
      return next;
    });
    // Reload on every (re)connect to pick up anything missed while the socket was down.
    const offs = [
      onSocketEvent('connect', load),
      onSocketEvent('incident:new', onNew),
      onSocketEvent('incident:updated', onUpdated),
      onSocketEvent('incident:location', onLocation),
      onSocketEvent('drone:update', onDrone),
    ];
    return () => {
      offs.forEach((off) => off());
      clearTimeout(bannerTimer.current);
    };
  }, [token, load, merge]);

  const { active, closed } = useMemo(() => splitQueue(incidents || []), [incidents]);
  const counts = useMemo(() => severityCounts(incidents || []), [incidents]);

  return {
    incidents, active, closed, counts, drones, error, refreshing, loading: incidents === null,
    refresh, reload: load, loadDrones, merge, banner, dismissBanner,
  };
}

export function ResponderIncidentsProvider({ children }) {
  const value = useResponderIncidentsState();
  return React.createElement(ResponderContext.Provider, { value }, children);
}

/** Responder queue state: { incidents, active, closed, counts, drones, banner, refresh, merge, … }. */
export function useResponderIncidents() {
  const ctx = useContext(ResponderContext);
  if (!ctx) throw new Error('useResponderIncidents must be used inside ResponderIncidentsProvider');
  return ctx;
}
