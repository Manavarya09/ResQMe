import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { checkCorridor, haversineM } from '../lib/geo';
import { ROUTE_CORRIDOR_M, ROUTE_DEVIATION_GRACE_S, ARRIVAL_RADIUS_M } from '../config';
import { useLocation } from './LocationContext';
import { useEmergency } from './EmergencyContext';

const TrackingContext = createContext(null);

// "Walk with me": the user draws a route + time limit. While tracking we trace the real path and
// escalate if they stay outside the safety corridor too long or haven't arrived by the deadline.
export function TrackingProvider({ children }) {
  const { location, subscribe } = useLocation();
  const { requestEmergency } = useEmergency();

  const [status, setStatus] = useState('idle'); // idle | planning | tracking | arrived
  const [waypoints, setWaypoints] = useState([]);
  const [durationMin, setDurationMin] = useState(25);
  const [startedAt, setStartedAt] = useState(null);
  const [trail, setTrail] = useState([]);
  const [deviation, setDeviation] = useState({ inside: true, distanceM: 0, since: null });
  const [now, setNow] = useState(Date.now());
  const firedRef = useRef(false);

  const route = useMemo(() => (waypoints.length ? [waypointsOrigin(trail, location, startedAt, waypoints), ...waypoints] : []), [waypoints, trail, location, startedAt]);

  const addWaypoint = useCallback((p) => {
    setWaypoints((w) => [...w, { lat: p.lat, lng: p.lng }]);
    setStatus((s) => (s === 'idle' || s === 'arrived' ? 'planning' : s));
  }, []);
  const undoWaypoint = useCallback(() => setWaypoints((w) => w.slice(0, -1)), []);
  const clear = useCallback(() => {
    setWaypoints([]);
    setTrail([]);
    setStartedAt(null);
    setStatus('idle');
    setDeviation({ inside: true, distanceM: 0, since: null });
  }, []);

  const start = useCallback(() => {
    if (!waypoints.length) return;
    firedRef.current = false;
    setTrail([{ lat: location.lat, lng: location.lng }]);
    setStartedAt(Date.now());
    setDeviation({ inside: true, distanceM: 0, since: null });
    setStatus('tracking');
  }, [waypoints.length, location]);

  const stop = useCallback(() => {
    setStatus(waypoints.length ? 'planning' : 'idle');
    setStartedAt(null);
  }, [waypoints.length]);

  // Trace the actual path while tracking.
  useEffect(() => {
    if (status !== 'tracking') return;
    return subscribe((loc) => setTrail((t) => {
      const last = t[t.length - 1];
      return !last || haversineM(last, loc) > 4 ? [...t, { lat: loc.lat, lng: loc.lng }] : t;
    }));
  }, [status, subscribe]);

  // 1 Hz safety check: corridor, arrival, deadline.
  useEffect(() => {
    if (status !== 'tracking') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status !== 'tracking' || !route.length) return;
    const dest = waypoints[waypoints.length - 1];
    if (haversineM(location, dest) <= ARRIVAL_RADIUS_M) {
      setStatus('arrived');
      setStartedAt(null);
      return;
    }
    const c = checkCorridor(location, route, ROUTE_CORRIDOR_M);
    setDeviation((d) => ({ inside: c.inside, distanceM: c.distanceM, since: c.inside ? null : d.since ?? Date.now() }));

    if (firedRef.current) return;
    const offFor = !c.inside && deviation.since ? (now - deviation.since) / 1000 : 0;
    if (offFor >= ROUTE_DEVIATION_GRACE_S) {
      firedRef.current = true;
      requestEmergency('route_deviation', { note: `Off planned route by ${Math.round(c.distanceM)} m for ${Math.round(offFor)} s` });
    } else if (startedAt && now - startedAt > durationMin * 60000) {
      firedRef.current = true;
      requestEmergency('timer_expired', { note: `Did not arrive within ${durationMin} min` });
    }
  }, [now, location, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsedS = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const remainingS = startedAt ? Math.max(0, durationMin * 60 - elapsedS) : durationMin * 60;

  const value = {
    status, waypoints, route, trail, durationMin, setDurationMin, elapsedS, remainingS, deviation,
    addWaypoint, undoWaypoint, clear, start, stop,
  };
  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

// The route starts where the user was when tracking began (or where they are now while planning).
function waypointsOrigin(trail, location, startedAt) {
  if (startedAt && trail.length) return trail[0];
  return { lat: location.lat, lng: location.lng };
}

export const useTracking = () => useContext(TrackingContext);
