// Small shared toolkit: theme-aware palette, HiDPI canvases, visibility-gated animation loops, SVG helpers.

const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mqReduce.matches;

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let pal = null;
const palListeners = new Set();
export function palette() {
  if (!pal) {
    pal = {
      paper: cssVar('--paper'), plate: cssVar('--plate'), ink: cssVar('--ink'), ink2: cssVar('--ink-2'), ink3: cssVar('--ink-3'),
      rule: cssVar('--rule'), rule2: cssVar('--rule-2'), grid: cssVar('--grid-line'), signal: cssVar('--signal'),
      signalInk: cssVar('--signal-ink'), wash: cssVar('--signal-wash'), ok: cssVar('--ok'), alarm: cssVar('--alarm'),
      mono: cssVar('--mono'), serif: cssVar('--serif'),
    };
  }
  return pal;
}
export function onPaletteChange(fn) { palListeners.add(fn); }
export function refreshPalette() {
  pal = null;
  palListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshPalette);

/** HiDPI canvas that tracks its CSS size. onResize(w, h) fires after each resize. */
export function setupCanvas(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const state = { ctx, w: 0, h: 0, dpr: 1 };
  const apply = (initial) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width === state.w && r.height === state.h && dpr === state.dpr) return;
    state.w = r.width; state.h = r.height; state.dpr = dpr;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // defer on the first pass so callers can finish initialising before their draw runs
    if (initial === true) queueMicrotask(() => onResize?.(state.w, state.h));
    else onResize?.(state.w, state.h);
  };
  new ResizeObserver(() => apply(false)).observe(canvas);
  apply(true);
  return state;
}

/**
 * requestAnimationFrame loop that only runs while `el` is on screen and the tab is visible.
 * frame(dt [s], now [ms]). Returns { start, stop, visible }.
 */
export function visibleLoop(el, frame, { onShow, onHide } = {}) {
  let raf = 0, last = 0, running = false, visible = false;
  const tick = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    frame(dt, now);
    if (running) raf = requestAnimationFrame(tick);
  };
  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { onShow?.(); if (!document.hidden) start(); } else { stop(); onHide?.(); }
  }, { rootMargin: '80px' }).observe(el);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else if (visible) start();
  });
  return { start, stop, get visible() { return visible; } };
}

/** Fire once when an element first scrolls into view. */
export function whenVisible(el, fn, rootMargin = '0px 0px -15% 0px') {
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { io.disconnect(); fn(); }
  }, { rootMargin });
  io.observe(el);
}

export const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export function el(tag, attrs = {}, parent) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}

/** Deterministic PRNG (mulberry32) + gaussian helper. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return next;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** Build a "photon" (sinusoidal) path between two points, Feynman-diagram style. */
export function wavePath(x1, y1, x2, y2, { amp = 4, wl = 12 } = {}) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const n = Math.max(2, Math.round(len / wl));
  const steps = n * 8;
  let d = `M${x1.toFixed(1)},${y1.toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const env = Math.min(1, s * 6, (1 - s) * 6);
    const o = Math.sin(s * n * Math.PI * 2) * amp * env;
    d += ` L${(x1 + dx * s + nx * o).toFixed(1)},${(y1 + dy * s + ny * o).toFixed(1)}`;
  }
  return d;
}

/** Mono label drawing helper for canvases. */
const SANS = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';
/** Canvas label font (the site uses one sans-serif everywhere). */
export function monoFont(px, weight = 600) {
  return `${weight} ${px}px ${SANS}`;
}
export function serifFont(px, italic = false) {
  return `${italic ? 800 : 700} ${px}px ${SANS}`;
}
