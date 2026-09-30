import { palette, onPaletteChange, setupCanvas, rng, monoFont } from '../lib/kit.js';
import { analyzeWindow, mag, THRESHOLDS, SETTLE_MS, STILL_WINDOW_MS, CRASH_G, FREE_FALL_G } from '../lib/detector.js';

const PRESETS = {
  fall: { ff: 320, peak: 5.2, jit: 0.02 },
  drop: { ff: 300, peak: 4.5, jit: 0.35 },
  crash: { ff: 0, peak: 8.5, jit: 0.08 },
  collapse: { ff: 0, peak: 4.2, jit: 0.03 },
  stumble: { ff: 60, peak: 2.2, jit: 0.2 },
};
const IMPACT_MS = 1200;
const WINDOW_MS = 2900;

function synth({ ff, peak, jit }) {
  const r = rng(42);
  const out = [];
  for (let t = 0; t <= WINDOW_MS; t += 20) {
    let m;
    const s = (t - IMPACT_MS) / 1000;
    if (t < IMPACT_MS - ff - 20) m = 1 + 0.05 * Math.sin(2 * Math.PI * 0.8 * t / 1000) + r.gauss() * 0.025;
    else if (t < IMPACT_MS - 20) m = ff > 0 ? 0.12 + r.gauss() * 0.02 : 1 + r.gauss() * 0.025;
    else if (t === IMPACT_MS - 20) m = Math.max(0.5, 0.45 * peak);
    else if (t === IMPACT_MS) m = peak;
    else if (t === IMPACT_MS + 20) m = Math.max(0.5, 0.6 * peak);
    else {
      const ring = Math.min(1.6, 0.3 * peak) * Math.exp(-(s - 0.02) / 0.03) * Math.sin(2 * Math.PI * 20 * (s - 0.02));
      m = 1 + ring + r.gauss() * Math.max(0.006, jit);
    }
    out.push({ t, ax: 0, ay: 0, az: m, gx: 0.3 + 0.8 * Math.min(1, peak / 8), gy: 0.1, gz: 0 });
  }
  return out;
}

export default function playground(canvas) {
  const $ = (id) => document.getElementById(id);
  const ff = $('pgFF'), pk = $('pgPeak'), jt = $('pgJit');
  const read = $('pgRead');
  const sensBtns = [...document.querySelectorAll('#pgSens button')];
  let sens = 'medium';
  let samples = [], result = null;

  const view = setupCanvas(canvas, () => draw());
  onPaletteChange(draw);

  function recompute() {
    const p = { ff: +ff.value, peak: +pk.value, jit: +jt.value };
    $('pgFFo').textContent = `${p.ff} ms`;
    $('pgPeako').textContent = `${p.peak.toFixed(1)} g`;
    $('pgJito').textContent = `${p.jit.toFixed(2)} g`;
    $('pgSenso').textContent = `threshold ${THRESHOLDS[sens].toFixed(1)} g`;
    samples = synth(p);
    result = analyzeWindow(samples, { threshold: THRESHOLDS[sens] });
    renderReadout();
    draw();
  }

  function renderReadout() {
    const r = result;
    const fires = r.classification === 'fall' || r.classification === 'vehicle_crash';
    let verdict;
    if (fires) verdict = '<b>Alert raised.</b> The phone shows "Are you OK?" with a 30 second countdown.';
    else if (r.classification === 'drop') verdict = 'No alert: a drop means the phone was picked back up.';
    else if (r.peakG < THRESHOLDS[sens]) verdict = 'No alert: the impact is below the threshold.';
    else verdict = 'No alert: an impact without free-fall or stillness.';
    read.innerHTML = `
      <div class="cls ${fires ? 'alarm' : ''}">${r.classification.replace('_', ' ')}</div>
      <dl>
        <dt>Peak</dt><dd>${Number(r.peakG).toFixed(2)} g</dd>
        <dt>Free-fall</dt><dd>${r.freeFallMs} ms</dd>
        <dt>Variation after</dt><dd>${r._std != null ? r._std.toFixed(3) + ' g' : '—'}</dd>
        <dt>Still afterwards</dt><dd>${r.stillnessAfter ? 'yes' : 'no'}</dd>
        <dt>Score</dt><dd>${Number(r.score).toFixed(2)}</dd>
      </dl>
      <div class="verdict ${fires ? 'fire' : ''}">${verdict}</div>`;
  }

  function draw() {
    const { ctx, w, h } = view;
    if (!w || !samples.length) return;
    const P = palette();
    const mags = samples.map(mag);
    const peakV = Math.max(...mags);
    const yMax = Math.max(4, Math.ceil((Math.max(peakV, CRASH_G) + 0.6) * 2) / 2);
    const L = 40, Rm = 12, T = 14, B = 24;
    const pw = w - L - Rm, ph = h - T - B;
    const X = (ms) => L + (ms / WINDOW_MS) * pw;
    const Y = (g) => T + ph - (g / yMax) * ph;
    ctx.clearRect(0, 0, w, h);

    ctx.font = monoFont(10);
    ctx.lineWidth = 1;
    ctx.fillStyle = P.ink3; ctx.strokeStyle = P.rule;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const step = yMax > 8 ? 2 : 1;
    for (let g = 0; g <= yMax; g += step) {
      const y = Math.round(Y(g)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - Rm, y); ctx.stroke();
      ctx.fillText(`${g}g`, L - 6, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let ms = 0; ms <= WINDOW_MS; ms += 500) ctx.fillText(`${(ms - IMPACT_MS) / 1000 >= 0 ? '+' : ''}${((ms - IMPACT_MS) / 1000).toFixed(1)}`, X(ms), T + ph + 7);

    const th = THRESHOLDS[sens];
    const hline = (g, text, color, dash) => {
      if (g > yMax) return;
      const y = Math.round(Y(g)) + 0.5;
      ctx.save(); ctx.strokeStyle = color; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - Rm, y); ctx.stroke(); ctx.restore();
      ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(text, w - Rm - 4, y - 2);
    };
    hline(FREE_FALL_G, 'free-fall 0.4 g', P.ink3, [3, 4]);
    hline(th, `threshold ${th.toFixed(1)} g`, P.signalInk, [6, 5]);
    hline(th + 1, 'collapse', P.ink3, [2, 5]);
    hline(CRASH_G, 'crash 6 g', P.ink3, [3, 5]);

    const r = result;
    const peakT = samples[r._peakIdx ?? 0]?.t ?? IMPACT_MS;
    // measured free-fall
    if (r._ff) {
      const x0 = X(r._ff[0]), x1 = X(r._ff[1]);
      ctx.fillStyle = P.wash; ctx.fillRect(x0, T, Math.max(2, x1 - x0), ph);
      ctx.fillStyle = P.signalInk; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${r.freeFallMs} ms`, (x0 + x1) / 2, T + 4);
    }
    // stillness window (only meaningful once the detector armed)
    if (r.peakG >= th) {
      const x0 = X(peakT + SETTLE_MS), x1 = X(peakT + SETTLE_MS + STILL_WINDOW_MS);
      ctx.fillStyle = r.stillnessAfter ? 'rgba(148, 163, 184, 0.14)' : 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(x0, T, x1 - x0, ph);
      ctx.fillStyle = r.stillnessAfter ? P.ink2 : P.alarm; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(r.stillnessAfter ? 'still' : 'moving', (x0 + x1) / 2, T + 4);
    }
    // trace
    ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    samples.forEach((s, i) => { const x = X(s.t), y = Y(mags[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // peak
    const px = X(peakT), py = Y(r.peakG);
    ctx.strokeStyle = P.signal; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = P.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Number(r.peakG).toFixed(2)} g`, px + 9, Math.max(T + 8, py));
  }

  [ff, pk, jt].forEach((i) => i.addEventListener('input', recompute));
  sensBtns.forEach((b) => b.addEventListener('click', () => {
    sens = b.dataset.s;
    sensBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    recompute();
  }));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const p = PRESETS[b.dataset.preset];
    ff.value = p.ff; pk.value = p.peak; jt.value = p.jit;
    recompute();
  }));
  recompute();
}
