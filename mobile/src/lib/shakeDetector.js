// Shake-to-SOS gesture detector (pure, no React / sensor imports so it is unit-testable).
//
// A "shake" is a rising-edge spike of total acceleration above `thresholdG`. The gesture fires
// when `count` shakes, each at least `minGapMs` apart, all land inside a `windowMs` window.
// The magnitude must drop back below the threshold between spikes, so one long jolt counts
// once — a fall or crash (a single impact spike) can never trigger it on its own.
//
// Samples: { t (ms), ax, ay, az (g) } — the same shape the motion stream / impact detector use.

export const SHAKE_DEFAULTS = {
  thresholdG: 2.7,
  minGapMs: 250,
  windowMs: 2000,
  count: 3,
  cooldownMs: 5000,
};

const mag = (s) => Math.sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);

export function createShakeDetector({ onShake, ...opts } = {}) {
  const cfg = { ...SHAKE_DEFAULTS, ...opts };
  let spikes = []; // timestamps of counted spikes
  let armed = true; // true once the signal has dropped back below the threshold
  let cooldownUntil = -Infinity;

  return {
    push(sample) {
      const m = mag(sample);
      const t = sample.t;
      if (m < cfg.thresholdG) {
        armed = true;
        return false;
      }
      if (!armed) return false; // still the same spike
      armed = false;
      if (t < cooldownUntil) return false;

      const last = spikes[spikes.length - 1];
      if (last !== undefined && t - last < cfg.minGapMs) return false; // rebound of the same shake

      spikes = spikes.filter((s) => t - s <= cfg.windowMs);
      spikes.push(t);
      if (spikes.length >= cfg.count && t - spikes[spikes.length - cfg.count] <= cfg.windowMs) {
        const shakes = spikes.slice(-cfg.count);
        spikes = [];
        cooldownUntil = t + cfg.cooldownMs;
        onShake?.({ at: t, shakes, peakG: Number(m.toFixed(2)) });
        return true;
      }
      return false;
    },
    reset() {
      spikes = [];
      armed = true;
      cooldownUntil = -Infinity;
    },
    get spikeCount() {
      return spikes.length;
    },
  };
}
