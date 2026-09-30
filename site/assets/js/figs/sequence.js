import { svg, reduced, whenVisible } from '../lib/kit.js';

const LANES = [
  ['phone', 'Phone', 'Phone'], ['api', 'API', 'API'], ['ai', 'AI service', 'AI'],
  ['db', 'Database', 'DB'], ['drone', 'Drone sim', 'Drone'], ['console', 'Responders', 'Resp.'],
];
// [from, to, label, kind]  kind: http | ret | sql | ws
const MSGS = [
  ['phone', 'api', 'POST /api/incidents {trigger, lat, lng, sensorWindow}', 'http'],
  ['api', 'db', 'SELECT medical_ids, contacts · decrypt', 'sql'],
  ['api', 'ai', 'POST /motion/score', 'http'],
  ['ai', 'api', '{ classification, score }', 'ret'],
  ['api', 'ai', 'POST /triage', 'http'],
  ['ai', 'api', '{ severity, summary, actions }', 'ret'],
  ['api', 'db', 'BEGIN · INSERT incident + 2 events · COMMIT', 'sql'],
  ['api', 'console', 'incident:new → responders', 'ws'],
  ['api', 'phone', '201 Incident', 'ret'],
  ['phone', 'api', 'POST …/location (every 15 s)', 'http'],
  ['api', 'console', 'incident:location', 'ws'],
  ['console', 'api', 'POST …/ack {etaMinutes}', 'http'],
  ['api', 'phone', 'incident:updated → user:<id>', 'ws'],
  ['console', 'api', 'POST …/drone', 'http'],
  ['api', 'drone', 'assignDrone() · SELECT … FOR UPDATE', 'sql'],
  ['drone', 'console', 'drone:update · 1 Hz', 'ws'],
  ['drone', 'phone', 'drone:update · 1 Hz → user:<id>', 'ws'],
  ['console', 'api', 'POST …/resolve', 'http'],
  ['api', 'drone', 'releaseForIncident() → returning', 'sql'],
  ['api', 'phone', 'incident:updated (resolved)', 'ws'],
];

export default function sequence(host) {
  let mode = null, rows = [], packet = null, timers = [], raf = 0;

  function build(name) {
    mode = name;
    const wide = name === 'wide';
    const W = wide ? 900 : 420;
    const col = wide ? 150 : 68, x0 = wide ? 75 : 36;
    const top = wide ? 64 : 58, step = wide ? 30 : 40;
    const H = top + MSGS.length * step + 14;
    const X = {};
    LANES.forEach(([id], i) => { X[id] = x0 + i * col; });
    host.innerHTML = '';
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', class: wide ? 'seq-wide' : 'seq-tall' }, host);
    const defs = svg('defs', {}, root);
    const mk = (id, fill, open) => {
      const m = svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      svg('path', open ? { d: 'M0,1 L10,5 L0,9', fill: 'none', stroke: fill, 'stroke-width': 1.4 } : { d: 'M0,1 L10,5 L0,9 z', fill }, m);
    };
    mk('sq-a', '#94a3b8'); mk('sq-r', '#94a3b8', true); mk('sq-w', '#f48c25');
    LANES.forEach(([id, full, short]) => {
      svg('line', { class: 'lifeline', x1: X[id], y1: 40, x2: X[id], y2: H - 4 }, root);
      const g = svg('g', { class: 'lh' }, root);
      const bw = wide ? 104 : 54;
      svg('rect', { x: X[id] - bw / 2, y: 10, width: bw, height: 30, rx: 10 }, g);
      const t = svg('text', { x: X[id], y: 25.5 }, g); t.textContent = wide ? full : short;
    });
    rows = MSGS.map(([a, b, label, kind], i) => {
      const y = top + i * step + (wide ? 8 : 14);
      const g = svg('g', { class: `msg ${kind === 'ws' ? 'ws' : ''} ${reduced() ? '' : 'pending'}` }, root);
      const dir = X[b] > X[a] ? 1 : -1;
      const line = svg('line', {
        x1: X[a] + dir * 2, y1: y, x2: X[b] - dir * 3, y2: y,
        'marker-end': `url(#sq-${kind === 'ws' ? 'w' : kind === 'ret' ? 'r' : 'a'})`,
      }, g);
      if (kind === 'ret') { line.style.stroke = '#cbd5e1'; line.style.strokeDasharray = '2 4'; }
      if (kind === 'ws') line.style.stroke = '#f48c25';
      let t;
      if (wide) {
        const idx = svg('text', { class: 'idx', x: 6, y: y + 3.5 }, g); idx.textContent = String(i + 1).padStart(2, '0');
        t = svg('text', { x: (X[a] + X[b]) / 2, y: y - 6, 'text-anchor': 'middle' }, g);
      } else {
        const lx = Math.min(X[a], X[b]);
        const room = W - 6 - lx;
        const cw = 7.1;
        const anchorEnd = label.length * cw > room;
        t = svg('text', { x: anchorEnd ? Math.max(X[a], X[b]) : lx, y: y - 7, 'text-anchor': anchorEnd ? 'end' : 'start' }, g);
        if (anchorEnd && label.length * cw > Math.max(X[a], X[b]) - 4) { t.setAttribute('x', 4); t.setAttribute('text-anchor', 'start'); }
      }
      t.textContent = label;
      return { g, line, x1: X[a], x2: X[b], y };
    });
    packet = svg('circle', { r: 3.2, fill: 'var(--signal)', opacity: 0 }, root);
  }

  function play() {
    timers.forEach(clearTimeout); timers = [];
    cancelAnimationFrame(raf);
    if (reduced()) { rows.forEach((r) => r.g.classList.remove('pending', 'cur')); return; }
    rows.forEach((r) => { r.g.classList.add('pending'); r.g.classList.remove('cur'); });
    rows.forEach((r, i) => {
      timers.push(setTimeout(() => {
        rows.forEach((o) => o.g.classList.remove('cur'));
        r.g.classList.remove('pending');
        r.g.classList.add('cur');
        const t0 = performance.now();
        const anim = (now) => {
          const k = Math.min(1, (now - t0) / 330);
          packet.setAttribute('cx', r.x1 + (r.x2 - r.x1) * k);
          packet.setAttribute('cy', r.y);
          packet.setAttribute('opacity', k < 1 ? 1 : 0);
          if (k < 1) raf = requestAnimationFrame(anim);
        };
        raf = requestAnimationFrame(anim);
        if (i === rows.length - 1) timers.push(setTimeout(() => r.g.classList.remove('cur'), 900));
      }, 250 + i * 420));
    });
  }

  const pick = () => (host.clientWidth < 620 ? 'tall' : 'wide');
  build(pick());
  new ResizeObserver(() => { const n = pick(); if (n !== mode) { build(n); rows.forEach((r) => r.g.classList.remove('pending')); } }).observe(host);
  whenVisible(host, play, '0px 0px -25% 0px');
  document.getElementById('seqReplay')?.addEventListener('click', play);
}
