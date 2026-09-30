import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { DEFAULT_LOCATION } from '../config';

const LocationContext = createContext(null);

// One shared GPS watch for the whole app (SOS, map, tracking, hazards) instead of one per screen.
export function LocationProvider({ children }) {
  const [location, setLocation] = useState(null);
  const [permission, setPermission] = useState('undetermined');
  const listeners = useRef(new Set());
  const subRef = useRef(null);

  const start = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status);
      if (status !== 'granted') {
        setLocation((l) => l || DEFAULT_LOCATION);
        return;
      }
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last) setLocation(toLoc(last));
      subRef.current?.remove?.();
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (pos) => {
          const loc = toLoc(pos);
          setLocation(loc);
          listeners.current.forEach((fn) => fn(loc));
        }
      );
      // Some browsers never fire the watch without movement — do one explicit fix too.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((pos) => setLocation(toLoc(pos)))
        .catch(() => setLocation((l) => l || DEFAULT_LOCATION));
    } catch {
      setPermission('unavailable');
      setLocation((l) => l || DEFAULT_LOCATION);
    }
  }, []);

  useEffect(() => {
    start();
    return () => subRef.current?.remove?.();
  }, [start]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  return (
    <LocationContext.Provider value={{ location: location || DEFAULT_LOCATION, hasFix: !!location && !location.isFallback, permission, retry: start, subscribe }}>
      {children}
    </LocationContext.Provider>
  );
}

function toLoc(pos) {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: pos.coords.heading, speed: pos.coords.speed, t: pos.timestamp };
}

export const useLocation = () => useContext(LocationContext);
