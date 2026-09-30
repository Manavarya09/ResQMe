import { Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';

const INTERVAL_MS = 20; // 50 Hz

// Streams fused accelerometer (g) + latest gyroscope (rad/s) samples. Returns an unsubscribe fn,
// or null when the device has no accelerometer (web preview, some emulators).
export async function startMotionStream(onSample) {
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
    onSample({ t: Date.now(), ax: a.x, ay: a.y, az: a.z, gx: gyro.x, gy: gyro.y, gz: gyro.z });
  });
  return () => {
    accSub.remove();
    gyroSub?.remove();
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
