import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../lib/api';
import { onSocketEvent } from '../lib/socket';
import { haversineM } from '../lib/geo';
import { useLocation } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';

const REFRESH_MS = 5 * 60 * 1000;
const ALERT_RADIUS_M = 3000;
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const notified = new Set();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function notifyHazard(h) {
  if (Platform.OS === 'web' || notified.has(h.id)) return;
  notified.add(h.id);
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }
    await Notifications.scheduleNotificationAsync({
      content: { title: `⚠️ ${h.title}`, body: h.description || 'Hazard reported near you. Stay alert.' },
      trigger: null,
    });
  } catch {}
}

// Nearby crime + climate hazards, sorted by severity then distance, with local alerts for serious ones.
export function useHazards({ radiusKm = 10 } = {}) {
  const { location, hasFix } = useLocation();
  const { settings, token } = useAuth();
  const [hazards, setHazards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const locRef = useRef(location);
  locRef.current = location;
  // Refetch when the user moves ~1 km, not on every GPS tick.
  const cell = `${location.lat.toFixed(2)},${location.lng.toFixed(2)}`;

  const withDistance = useCallback((list) => {
    const l = locRef.current;
    return list
      .map((h) => ({ ...h, distanceM: haversineM(l, h) }))
      .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) || a.distanceM - b.distanceM);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await api.hazards({ lat: locRef.current.lat, lng: locRef.current.lng, radiusKm });
      const sorted = withDistance(list || []);
      setHazards(sorted);
      setError(null);
      if (settings.hazardAlerts) {
        sorted.filter((h) => SEVERITY_RANK[h.severity] >= 2 && h.distanceM <= ALERT_RADIUS_M).slice(0, 2).forEach(notifyHazard);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, radiusKm, withDistance, settings.hazardAlerts]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, cell, hasFix]);

  useEffect(() => {
    const onNew = (h) => {
      setHazards((prev) => withDistance([h, ...prev.filter((p) => p.id !== h.id)]));
      if (settings.hazardAlerts && haversineM(locRef.current, h) <= ALERT_RADIUS_M) notifyHazard(h);
    };
    return onSocketEvent('hazard:new', onNew);
  }, [withDistance, settings.hazardAlerts]);

  return { hazards, loading, error, refresh };
}
