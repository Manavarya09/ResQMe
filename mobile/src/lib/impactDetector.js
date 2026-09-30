// On-device crash/fall detection. Mirrors the AI service's /motion/score algorithm so the phone
// can escalate with no connectivity; the server score only adds confidence for responders.
//
// Samples: { t (ms), ax, ay, az (g), gx, gy, gz (rad/s) }

export const THRESHOLDS = { low: 3.0, medium: 2.5, high: 2.0 };
const FREE_FALL_G = 0.4;
const MIN_FREE_FALL_MS = 150;
const CRASH_G = 6;
const STILL_STD_G = 0.15;
const STILL_WINDOW_MS = 1000;
const SETTLE_MS = 150; // skip the ringing right after the peak
const COOLDOWN_MS = 10000;

const mag = (s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
const gyroMag = (s) => Math.sqrt((s.gx || 0) ** 2 + (s.gy || 0) ** 2 + (s.gz || 0) ** 2);

function std(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

export function analyzeWindow(samples, { threshold = THRESHOLDS.medium } = {}) {
  const none = { impactDetected: false, score: 0, peakG: 0, freeFallMs: 0, stillnessAfter: false, rotationPeak: 0, classification: 'none' };
  if (!samples?.length) return none;

  const mags = samples.map(mag);
  let peakIdx = 0;
  mags.forEach((m, i) => { if (m > mags[peakIdx]) peakIdx = i; });
  const peakG = mags[peakIdx];
  const rotationPeak = Math.max(...samples.map(gyroMag));
  if (peakG < threshold) return { ...none, peakG, rotationPeak };

  // Free-fall: contiguous low-g run ending just before the impact (allow ~100 ms of ramp-up).
  const peakT = samples[peakIdx].t;
  let i = peakIdx - 1;
  while (i >= 0 && mags[i] >= FREE_FALL_G && peakT - samples[i].t <= 100) i--;
  let ffEnd = i, ffStart = i;
  while (ffStart >= 0 && mags[ffStart] < FREE_FALL_G) ffStart--;
  const freeFallMs = ffEnd > ffStart ? samples[ffEnd].t - samples[ffStart + 1].t : 0;

  const after = samples
    .map((s, k) => ({ s, m: mags[k] }))
    .filter(({ s }) => s.t >= peakT + SETTLE_MS && s.t <= peakT + SETTLE_MS + STILL_WINDOW_MS)
    .map(({ m }) => m);
  const covered = after.length >= 2 && after.length * ((samples[1]?.t ?? 20) - samples[0].t) >= STILL_WINDOW_MS * 0.8;
  const stillnessAfter = covered && std(after) < STILL_STD_G;

  const hadFreeFall = freeFallMs >= MIN_FREE_FALL_MS;
  let classification;
  if (peakG >= CRASH_G && !hadFreeFall) classification = 'vehicle_crash';
  else if (hadFreeFall) classification = stillnessAfter ? 'fall' : 'drop';
  else classification = stillnessAfter && peakG >= threshold + 1 ? 'fall' : 'none';

  const score = classification === 'none' ? 0 :
    Math.min(1, 0.5 * Math.min(1, peakG / 8) + (hadFreeFall ? 0.2 : 0) + (stillnessAfter ? 0.3 : 0) + (classification === 'vehicle_crash' ? 0.1 : 0));

  return {
    impactDetected: classification !== 'none',
    score: Number(score.toFixed(3)),
    peakG: Number(peakG.toFixed(2)),
    freeFallMs: Math.round(freeFallMs),
    stillnessAfter,
    rotationPeak: Number(rotationPeak.toFixed(2)),
    classification,
  };
}

// Streaming wrapper: feed sensor samples one at a time; calls onImpact for falls and crashes
// (drops — where the phone is picked back up — are ignored to keep false alarms down).
export function createImpactDetector({ onImpact, sensitivity = 'medium', bufferMs = 5000 } = {}) {
  const threshold = THRESHOLDS[sensitivity] ?? THRESHOLDS.medium;
  let buffer = [];
  let pendingPeakT = null;
  let cooldownUntil = -Infinity;

  return {
    push(sample) {
      buffer.push(sample);
      const cutoff = sample.t - bufferMs;
      while (buffer.length && buffer[0].t < cutoff) buffer.shift();

      if (pendingPeakT === null && sample.t >= cooldownUntil && mag(sample) >= threshold) {
        pendingPeakT = sample.t;
      }
      if (pendingPeakT !== null && sample.t >= pendingPeakT + SETTLE_MS + STILL_WINDOW_MS + 50) {
        const window = buffer.filter((s) => s.t >= pendingPeakT - 1500);
        const result = analyzeWindow(window, { threshold });
        pendingPeakT = null;
        if (result.classification === 'fall' || result.classification === 'vehicle_crash') {
          cooldownUntil = sample.t + COOLDOWN_MS;
          onImpact?.({ ...result, samples: window });
        }
      }
    },
    reset() {
      buffer = [];
      pendingPeakT = null;
    },
  };
}
