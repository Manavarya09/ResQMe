import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { useEmergency } from '../context/EmergencyContext';
import { startMotionStream } from '../lib/sensors';
import { createShakeDetector } from '../lib/shakeDetector';

// Shake the phone hard three times (within ~2 s) to start an SOS countdown.
// Mount once somewhere that is always rendered while signed in. Enabled by settings.shakeToSos
// (treated as on unless explicitly set to false). Returns { active } — true while listening.
export function useShakeSOS() {
  const { token, settings } = useAuth();
  const { requestEmergency } = useEmergency();
  const enabled = !!token && settings?.shakeToSos !== false;
  const [active, setActive] = useState(false);
  const requestRef = useRef(requestEmergency);
  requestRef.current = requestEmergency;

  useEffect(() => {
    if (!enabled) { setActive(false); return; }
    let stop = null;
    let cancelled = false;
    const detector = createShakeDetector({
      onShake: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        requestRef.current('sos', { note: 'Shake gesture' });
      },
    });
    startMotionStream((s) => detector.push(s)).then((unsub) => {
      if (cancelled) return unsub?.();
      stop = unsub;
      setActive(!!unsub);
    });
    return () => {
      cancelled = true;
      stop?.();
      setActive(false);
    };
  }, [enabled]);

  return { active };
}

export default useShakeSOS;
