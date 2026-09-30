import { analyzeWindow, createImpactDetector } from '../src/lib/impactDetector';

const RATE = 50;
const DT = 1000 / RATE;

// Builds a synthetic accelerometer window from segments of [durationMs, magnitudeG, jitter].
function build(segments) {
  const out = [];
  let t = 0;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  for (const [ms, g, jitter = 0.02] of segments) {
    const n = Math.round(ms / DT);
    for (let i = 0; i < n; i++) {
      out.push({ t, ax: 0, ay: 0, az: g + rand() * jitter * 2, gx: 0, gy: 0, gz: 0 });
      t += DT;
    }
  }
  return out;
}

describe('analyzeWindow', () => {
  test('resting phone is not an impact', () => {
    const r = analyzeWindow(build([[3000, 1]]));
    expect(r.impactDetected).toBe(false);
    expect(r.classification).toBe('none');
  });

  test('free-fall then impact then stillness is a fall', () => {
    const r = analyzeWindow(build([[500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1]]));
    expect(r.impactDetected).toBe(true);
    expect(r.classification).toBe('fall');
    expect(r.freeFallMs).toBeGreaterThanOrEqual(150);
    expect(r.stillnessAfter).toBe(true);
    expect(r.peakG).toBeGreaterThan(4);
  });

  test('free-fall and impact but handled afterwards is a drop', () => {
    const r = analyzeWindow(build([[500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1.2, 1.2]]));
    expect(r.classification).toBe('drop');
    expect(r.stillnessAfter).toBe(false);
  });

  test('violent spike with no free-fall is a vehicle crash', () => {
    const r = analyzeWindow(build([[800, 1, 0.3], [80, 7.5, 0.2], [1500, 1]]));
    expect(r.classification).toBe('vehicle_crash');
    expect(r.score).toBeGreaterThan(0.7);
  });
});

describe('createImpactDetector (streaming)', () => {
  test('emits once for a fall and respects cooldown', () => {
    const events = [];
    const det = createImpactDetector({ onImpact: (e) => events.push(e), sensitivity: 'medium' });
    const samples = build([[500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1]]);
    samples.forEach((s) => det.push(s));
    expect(events).toHaveLength(1);
    expect(events[0].classification).toBe('fall');
  });

  test('ignores drops (phone picked back up)', () => {
    const events = [];
    const det = createImpactDetector({ onImpact: (e) => events.push(e) });
    build([[500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1.2, 1.2]]).forEach((s) => det.push(s));
    expect(events).toHaveLength(0);
  });

  test('low sensitivity ignores moderate impacts that high sensitivity catches', () => {
    const mk = (sensitivity) => {
      const events = [];
      const det = createImpactDetector({ onImpact: (e) => events.push(e), sensitivity });
      build([[500, 1], [300, 0.1], [60, 2.7, 0.05], [1500, 1]]).forEach((s) => det.push(s));
      return events.length;
    };
    expect(mk('low')).toBe(0);
    expect(mk('high')).toBe(1);
  });
});
