import { Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';

const INTERVAL_MS = 20; // 50 Hz

// Streams fused accelerometer (g) + latest gyroscope (rad/s) samples. Returns an unsubscribe fn,
// or null when the device has no accelerometer (web preview, some emulators).
// One underlying sensor subscription is shared by every consumer (impact detection, shake-to-SOS…).
const consumers = new Set();
let hardware = null; // Promise<stopFn | null> while at least one consumer is attached

async function startHardware() {
  if (Platform.OS === 'web') return null;
  const available = await Accelerometer.isAvailableAsync().catch(() => false);
  if (!available) return null;

  let gyro = { x: 0, y: 0, z: 0 };
  Accelerometer.setUpdateInterval(INTERVAL_MS);
  const hasGyro = await Gyroscope.isAvailableAsync().catch(() => false);
  let gyroSub = null;
  if (hasGyro) {
    Gyroscope.setUpdateInterval(INTERVAL_MS);
    gyroSub = Gyroscope.addListener((g) => { gyro = g; });
  }
  const accSub = Accelerometer.addListener((a) => {
    const sample = { t: Date.now(), ax: a.x, ay: a.y, az: a.z, gx: gyro.x, gy: gyro.y, gz: gyro.z };
    consumers.forEach((fn) => {
      try { fn(sample); } catch {}
    });
  });
  return () => {
    accSub.remove();
    gyroSub?.remove();
  };
}

export async function startMotionStream(onSample) {
  let stopHardware;
  // Re-check after awaiting: the last consumer may have torn the stream down in the meantime.
  for (;;) {
    if (!hardware) hardware = startHardware();
    const pending = hardware;
    stopHardware = await pending;
    if (!stopHardware) {
      if (hardware === pending && !consumers.size) hardware = null; // allow a retry later
      return null;
    }
    if (hardware === pending) break;
  }
  consumers.add(onSample);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    consumers.delete(onSample);
    if (!consumers.size && hardware) {
      hardware = null;
      stopHardware();
    }
  };
}

// Synthetic fall used by the "Simulate impact" control (web preview / demos).
export function syntheticFall() {
  const out = [];
  let t = Date.now() - 3000;
  const push = (ms, g) => {
    for (let i = 0; i < ms / INTERVAL_MS; i++) {
      out.push({ t, ax: 0, ay: 0, az: g + (Math.random() - 0.5) * 0.04, gx: 0.2, gy: 0.1, gz: 0 });
      t += INTERVAL_MS;
    }
  };
  push(600, 1);
  push(320, 0.12);
  push(60, 5.2);
  push(1500, 1);
  return out;
}
