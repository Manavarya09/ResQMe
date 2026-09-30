// Verbatim port of mobile/src/lib/impactDetector.js (analyzeWindow + constants).
// Keep in sync with the app: the playground on this page runs exactly this code.

export const THRESHOLDS = { low: 3.0, medium: 2.5, high: 2.0 };
export const FREE_FALL_G = 0.4;
export const MIN_FREE_FALL_MS = 150;
export const CRASH_G = 6;
export const STILL_STD_G = 0.15;
export const STILL_WINDOW_MS = 1000;
export const SETTLE_MS = 150; // skip the ringing right after the peak
export const COOLDOWN_MS = 10000;

export const mag = (s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
const gyroMag = (s) => Math.sqrt((s.gx || 0) ** 2 + (s.gy || 0) ** 2 + (s.gz || 0) ** 2);

export function std(values) {
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
    // extras for the visualisation (not part of the app's return value)
    _peakIdx: peakIdx,
    _ff: ffEnd > ffStart ? [samples[ffStart + 1].t, samples[ffEnd].t] : null,
    _std: after.length ? std(after) : null,
  };
}
