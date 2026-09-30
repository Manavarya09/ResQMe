import { palette, onPaletteChange, setupCanvas, visibleLoop, reduced, rng, monoFont, serifFont } from '../lib/kit.js';
import { analyzeWindow, mag, THRESHOLDS, SETTLE_MS, STILL_WINDOW_MS } from '../lib/detector.js';

const DUR = 8.0;       // seconds of signal
const HOLD = 5.2;      // seconds to hold after the sweep
const Y_MAX = 6.4;

function buildScenario() {
  const r = rng(7);
  const out = [];
  for (let k = 0; k <= DUR * 50; k++) {
    const t = k * 0.02;
    let m;
    if (t < 3.30) {
      m = 1 + 0.28 * Math.sin(2 * Math.PI * 1.9 * t) + 0.12 * Math.sin(2 * Math.PI * 3.8 * t + 0.6) + r.gauss() * 0.03;
    } else if (t < 3.44) {
      m = 1.35 + r.gauss() * 0.04;               // trip
    } else if (t < 3.775) {
      m = 0.1 + r.gauss() * 0.025;               // free-fall
    } else if (t < 3.795) {
      m = 2.4;
    } else if (t < 3.815) {
      m = 5.2;                                   // impact
    } else if (t < 3.835) {
      m = 3.0;
    } else {
      const s = t - 3.835;
      m = 1 + 1.4 * Math.exp(-s / 0.035) * Math.sin(2 * Math.PI * 22 * s) + r.gauss() * 0.012;
    }
    out.push({ t: Math.round(t * 1000), ax: 0, ay: 0, az: m, gx: 0.2, gy: 0.1, gz: 0 });
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export default function hero(canvas) {
  const samples = buildScenario();
  const mags = samples.map(mag);
  let peakIdx = 0;
  mags.forEach((m, i) => { if (m > mags[peakIdx]) peakIdx = i; });
  const peakT = samples[peakIdx].t;
  // Streaming wrapper semantics: evaluate at peak + 1200 ms on the buffer from peak - 1500 ms.
  const decideT = peakT + SETTLE_MS + STILL_WINDOW_MS + 50;
  const windowS = samples.filter((s) => s.t >= peakT - 1500 && s.t <= decideT);
  const result = analyzeWindow(windowS, { threshold: THRESHOLDS.medium });
  const ff = result._ff; // [start, end] ms

  const chain = [...document.querySelectorAll('#heroChain .cn')];
  const stateEl = document.getElementById('heroState');
  const view = setupCanvas(canvas, () => draw());

  let clock = 0; // seconds into the loop
  let lastState = '';

  function stateAt(tc) {
    const ms = tc * 1000;
    if (ms >= decideT) return `Fall detected · score ${result.score.toFixed(2)}`;
    if (ms >= peakT + SETTLE_MS) return 'Checking for stillness';
    if (ms >= peakT) return `Impact · ${result.peakG.toFixed(1)} g`;
    if (ff && ms >= ff[0]) return `Free-fall · ${Math.round(Math.min(ms, ff[1]) - ff[0])} ms`;
    return 'Walking';
  }

  function draw() {
    const { ctx, w, h } = view;
    if (!w) return;
    const P = palette();
    const tc = Math.min(clock, DUR);
    const L = w < 500 ? 34 : 50, Rm = 18, T = 18, B = 26;
    const pw = w - L - Rm, ph = h - T - B;
    const X = (s) => L + (s / DUR) * pw;
    const Y = (g) => T + ph - (g / Y_MAX) * ph;
    ctx.clearRect(0, 0, w, h);

    // axes + ticks
    ctx.font = monoFont(10);
    ctx.fillStyle = P.ink3;
    ctx.strokeStyle = P.rule;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let g = 0; g <= 6; g++) {
      const y = Math.round(Y(g)) + 0.5;
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - Rm, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(`${g}`, L - 6, y);
    }
    ctx.save();
    ctx.translate(10, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center';
    if (w >= 500) ctx.fillText('acceleration (g)', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= DUR; s++) {
      if (w < 500 && s % 2) continue;
      ctx.fillText(`${s}s`, X(s), T + ph + 7);
    }

    // threshold lines
    const hline = (g, label, color, dash) => {
      const y = Math.round(Y(g)) + 0.5;
      ctx.save();
      ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - Rm, y); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, w - Rm - 4, y - 3);
    };
    hline(0.4, 'free-fall below 0.4 g', P.ink3, [3, 4]);
    hline(2.5, 'impact threshold 2.5 g', P.signalInk, [6, 5]);
    hline(6, 'crash 6 g', P.ink3, [3, 5]);

    const ms = tc * 1000;
    // free-fall band (as measured)
    if (ff && ms >= ff[0]) {
      const x0 = X(ff[0] / 1000), x1 = X(Math.min(ms, ff[1]) / 1000);
      ctx.fillStyle = P.wash; ctx.fillRect(x0, T, Math.max(1, x1 - x0), ph);
      if (ms >= ff[1]) label(`free-fall ${result.freeFallMs} ms`, x0 - 4, Y(0.4) + 16, 'right');
    }
    // stillness window (hatched)
    const w0 = peakT + SETTLE_MS, w1 = peakT + SETTLE_MS + STILL_WINDOW_MS;
    if (ms >= w0) {
      const x0 = X(w0 / 1000), x1 = X(Math.min(ms, w1) / 1000);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.13)';
      ctx.fillRect(x0, T, x1 - x0, ph);
      if (ms >= w1) label(`still: σ = ${result._std.toFixed(3)} g`, (x0 + x1) / 2, Y(2.05), 'center');
    }

    // trace
    const n = Math.min(samples.length, Math.floor(ms / 20) + 1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = P.ink;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = X(samples[i].t / 1000), y = Y(mags[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();

    // peak marker
    if (ms >= peakT) {
      const x = X(peakT / 1000), y = Y(mags[peakIdx]);
      ctx.strokeStyle = P.signal; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      label(`impact ${result.peakG.toFixed(1)} g`, x + 10, y + 2, 'left');
    }

    // cursor tip
    if (tc < DUR && n > 0) {
      const i = n - 1, x = X(samples[i].t / 1000), y = Y(mags[i]);
      ctx.strokeStyle = P.signal; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, T); ctx.lineTo(x + 0.5, T + ph); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.signal;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }

    // decision
    if (ms >= decideT) {
      const x = X(decideT / 1000);
      ctx.strokeStyle = P.signal; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 0.5, T); ctx.lineTo(x + 0.5, T + ph); ctx.stroke();
      ctx.fillStyle = P.signalInk; ctx.font = monoFont(10); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('decision', x + 6, T + 2);
      // result card
      const bx = Math.min(x + 12, w - Rm - 190), by = T + 20;
      if (w >= 420) {
        ctx.save();
        ctx.shadowColor = 'rgba(100, 116, 139, 0.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, bx, by, 180, 66, 12); ctx.fill();
        ctx.restore();
        ctx.fillStyle = P.alarm; ctx.font = serifFont(18, true); ctx.textBaseline = 'alphabetic';
        ctx.fillText('Fall detected', bx + 14, by + 26);
        ctx.fillStyle = P.ink2; ctx.font = monoFont(11);
        ctx.fillText(`score ${result.score.toFixed(2)} · stillness yes`, bx + 14, by + 43);
        ctx.fillText('next: "Are you OK?" 30 s', bx + 14, by + 58);
      }
    }
  }

  function label(text, x, y, align) {
    const { ctx } = view;
    const P = palette();
    ctx.font = monoFont(10);
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const x0 = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.92; roundRect(ctx, x0 - 5, y - 9, tw + 10, 18, 6); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = P.ink2;
    ctx.fillText(text, x, y);
  }

  function updateChain() {
    const ms = Math.min(clock, DUR) * 1000;
    const since = clock * 1000 - decideT; // ms since decision
    chain.forEach((c, i) => {
      let lit;
      if (i === 0) lit = true;
      else if (i === 1) lit = ms >= peakT;
      else lit = since >= (i - 1) * 520;
      c.classList.toggle('lit', lit);
    });
    const st = stateAt(Math.min(clock, DUR));
    if (st !== lastState) { stateEl.textContent = st; lastState = st; }
  }

  onPaletteChange(() => requestAnimationFrame(draw));

  if (reduced()) {
    clock = DUR + HOLD - 0.01;
    draw();
    updateChain();
    return;
  }

  visibleLoop(canvas, (dt) => {
    clock += dt;
    if (clock > DUR + HOLD) clock = 0;
    draw();
    updateChain();
  });
}
