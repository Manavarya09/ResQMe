import { createShakeDetector } from '../src/lib/shakeDetector';
import { createImpactDetector } from '../src/lib/impactDetector';

const DT = 20; // 50 Hz

// Builds a sample stream from segments of [durationMs, magnitudeG, jitter].
function build(segments) {
  const out = [];
  let t = 0;
  let seed = 11;
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

// n vigorous shakes (60 ms at `g`) separated by `gapMs` of normal handling.
const shakes = (n, gapMs, g = 3.5) => {
  const segs = [[500, 1]];
  for (let i = 0; i < n; i++) segs.push([60, g, 0.1], [gapMs, 1, 0.2]);
  segs.push([1000, 1]);
  return build(segs);
};

function run(samples, opts) {
  const events = [];
  const det = createShakeDetector({ onShake: (e) => events.push(e), ...opts });
  samples.forEach((s) => det.push(s));
  return events;
}

describe('createShakeDetector', () => {
  test('three vigorous shakes within 2 s trigger once', () => {
    const events = run(shakes(3, 400));
    expect(events).toHaveLength(1);
    expect(events[0].shakes).toHaveLength(3);
    expect(events[0].peakG).toBeGreaterThan(2.7);
  });

  test('two shakes are not enough', () => {
    expect(run(shakes(2, 400))).toHaveLength(0);
  });

  test('shakes spread over more than 2 s do not trigger', () => {
    expect(run(shakes(3, 1200))).toHaveLength(0);
  });

  test('rebounds closer than 250 ms count as one shake', () => {
    // Three spikes 100 ms apart: one physical jolt ringing, not three deliberate shakes.
    expect(run(shakes(3, 100))).toHaveLength(0);
  });

  test('a sustained high-g period counts as a single spike', () => {
    expect(run(build([[500, 1], [1500, 3.2, 0.05], [1000, 1]]))).toHaveLength(0);
  });

  test('moderate motion (walking / running ~1.5-2.2 g) never triggers', () => {
    const segs = [];
    for (let i = 0; i < 20; i++) segs.push([80, 2.2, 0.1], [220, 0.9, 0.1]);
    expect(run(build(segs))).toHaveLength(0);
  });

  test('cooldown prevents a second trigger from continued shaking', () => {
    expect(run(shakes(7, 350))).toHaveLength(1);
  });

  test('shaking again after the cooldown triggers again', () => {
    const samples = shakes(3, 400);
    const later = shakes(3, 400).map((s) => ({ ...s, t: s.t + 10000 }));
    expect(run([...samples, ...later])).toHaveLength(2);
  });

  test('the fall pattern alone (single impact spike) does not trigger', () => {
    const fall = build([[500, 1], [300, 0.1], [60, 4.5, 0.1], [1500, 1]]);
    expect(run(fall)).toHaveLength(0);
    // Sanity check: the same stream IS a fall for the impact detector.
    const impacts = [];
    const det = createImpactDetector({ onImpact: (e) => impacts.push(e) });
    fall.forEach((s) => det.push(s));
    expect(impacts).toHaveLength(1);
  });

  test('a vehicle-crash spike alone does not trigger', () => {
    expect(run(build([[800, 1, 0.3], [80, 7.5, 0.2], [1500, 1]]))).toHaveLength(0);
  });

  test('custom threshold is respected', () => {
    expect(run(shakes(3, 400, 2.5))).toHaveLength(0);
    expect(run(shakes(3, 400, 2.5), { thresholdG: 2.2 })).toHaveLength(1);
  });

  test('reset clears partial progress', () => {
    const events = [];
    const det = createShakeDetector({ onShake: (e) => events.push(e) });
    shakes(2, 400).forEach((s) => det.push(s));
    expect(det.spikeCount).toBe(2);
    det.reset();
    expect(det.spikeCount).toBe(0);
    expect(events).toHaveLength(0);
  });
});
