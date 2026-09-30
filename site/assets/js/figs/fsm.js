import { svg, reduced } from '../lib/kit.js';

const STATES = {
  idle: { label: 'idle' },
  countdown: { label: 'countdown' },
  escalating: { label: 'escalating' },
  offline: { label: 'offline', sub: 'queued' },
  open: { label: 'open' },
  acknowledged: { label: 'acked' },
  dispatched: { label: 'dispatched' },
  resolved: { label: 'resolved', term: true },
  cancelled: { label: 'cancelled', term: true },
};

// [id, from, to, wideLabel, tallLabel, bend]
const TRANS = [
  ['t1', 'idle', 'countdown', 'trigger', 'trigger', 0],
  ['t2', 'countdown', 'idle', '“I’m OK”', '“I’m OK”', -46, 'lt'],
  ['t3', 'countdown', 'escalating', 't = 0 | send', 't = 0', 0],
  ['t4', 'escalating', 'open', '201 Created', '201', 0],
  ['t5', 'escalating', 'offline', 'network error', 'net error', 0, 'l'],
  ['t6', 'offline', 'open', 'retry 10 s', 'retry', 0, 'l'],
  ['t7', 'open', 'acknowledged', 'ack(eta)', 'ack', -10],
  ['t8', 'open', 'dispatched', 'drone', 'drone', 10],
  ['t9', 'acknowledged', 'dispatched', 'drone', 'drone', 0],
  ['t10', 'acknowledged', 'resolved', 'resolve', 'resolve', -10],
  ['t11', 'dispatched', 'resolved', 'resolve', 'resolve', 10],
  ['t12', 'open', 'cancelled', 'cancel', 'cancel', 0],
];

const LAYOUT = {
  wide: { vb: [1000, 430], r: 36, pos: {
    idle: [48, 180], countdown: [205, 180], escalating: [362, 180], offline: [362, 345], open: [545, 180],
    acknowledged: [725, 88], dispatched: [725, 272], resolved: [925, 180], cancelled: [545, 355],
  } },
  tall: { vb: [400, 780], r: 38, pos: {
    idle: [200, 50], countdown: [200, 160], escalating: [200, 275], offline: [345, 300], open: [200, 410],
    acknowledged: [85, 530], dispatched: [275, 530], resolved: [175, 690], cancelled: [355, 420],
  } },
};

const STEPS = [
  { k: 'Step 1 · physical', h: 'Sense', clock: 'T+0.00 s', state: 'idle', tr: [],
    p: 'The IMU streams 50 Hz samples into a 5 s ring buffer. A sample reaches 2.5 g outside the cooldown, so a pending peak is armed.' },
  { k: 'Step 2 · cyber', h: 'Classify and ask', clock: 'T+1.20 s', state: 'countdown', tr: ['t1'],
    p: 'At peak + 1.2 s analyzeWindow returns fall (free-fall 300 ms, stillness). requestEmergency(\'impact\') opens the full-screen “Are you OK?” modal and starts vibrating.' },
  { k: 'Step 3 · human filter', h: 'Confirmation window', clock: 'count', state: 'countdown', tr: ['t1'], countdown: true,
    p: 'Thirty seconds for the person to answer. “I’m OK” returns to idle and nothing is sent. Here, nobody answers.' },
  { k: 'Step 4 · cyber', h: 'Escalate', clock: 'T+31.2 s', state: 'open', via: 'escalating', tr: ['t3', 't4'],
    p: 'POST /api/incidents with location and the last 250 samples. The API snapshots the medical ID and contacts, calls /motion/score and /triage (4 s timeouts, rules fallback), commits the incident and emits incident:new to room responders.' },
  { k: 'Step 5 · actuation', h: 'Notify', clock: 'T+31.6 s', state: 'open', tr: [],
    p: 'The phone navigates to the Incident screen, opens the SMS composer pre-filled for every contact with a maps link, and streams its position every 15 s as incident:location.' },
  { k: 'Step 6 · actuation', h: 'Acknowledge', clock: 'On ack', state: 'acknowledged', tr: ['t7'],
    p: 'A responder acknowledges with an ETA on the console. incident:updated reaches user:<id>; the phone confirms with a success haptic and shows the ETA.' },
  { k: 'Step 7 · actuation', h: 'Dispatch drone', clock: 'Drone ETA', state: 'dispatched', tr: ['t9'],
    p: 'The nearest idle drone is locked and assigned. Each 1 s tick advances it 15 m and emits drone:update until it is within 30 m: drone_on_scene joins the timeline.' },
  { k: 'Step 8 · closure', h: 'Resolve', clock: 'Resolved', state: 'resolved', tr: ['t11'],
    p: 'The responder resolves the incident. The drone is released to returning, lands at base and has its battery swapped to 100 %. The audit log records who resolved it.' },
];

export default function fsm(host) {
  const $ = (id) => document.getElementById(id);
  const clockEl = $('fsmClock'), clockLbl = $('fsmClockLbl'), log = $('fsmLog');
  const playBtn = $('fsmPlay'), stepBtn = $('fsmStep'), resetBtn = $('fsmReset');
  const stepsBar = $('fsmSteps');
  stepsBar.innerHTML = STEPS.map(() => '<i></i>').join('');
  const ticks = [...stepsBar.children];

  let layoutName = null, stEls = {}, trEls = {};
  let idx = -1, timer = 0, playing = false, cdRaf = 0;
  const visited = new Set();

  function build(name) {
    layoutName = name;
    const L = LAYOUT[name];
    host.innerHTML = '';
    const root = svg('svg', { viewBox: `0 0 ${L.vb[0]} ${L.vb[1]}`, 'aria-hidden': 'true' }, host);
    const defs = svg('defs', {}, root);
    ['a', 'b'].forEach((k) => {
      const m = svg('marker', { id: `fsm-arrow-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      svg('path', { d: 'M0,1 L10,5 L0,9 z', fill: k === 'a' ? '#cbd5e1' : '#f48c25' }, m);
    });
    const gT = svg('g', {}, root), gS = svg('g', {}, root);
    trEls = {};
    TRANS.forEach(([id, a, b, wl, tl, bend, side]) => {
      const [x1, y1] = L.pos[a], [x2, y2] = L.pos[b];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const r = L.r + 2;
      const bendPx = bend * (name === 'tall' ? 0.8 : 1);
      // start/end on circle boundary, nudged toward the bend
      const ang = Math.atan2(bendPx, len / 2) * 0.9;
      const rot = (vx, vy, a2) => [vx * Math.cos(a2) - vy * Math.sin(a2), vx * Math.sin(a2) + vy * Math.cos(a2)];
      const [sx, sy] = rot(ux, uy, ang), [ex, ey] = rot(-ux, -uy, -ang);
      const p1 = [x1 + sx * r, y1 + sy * r], p2 = [x2 + ex * (r + 1), y2 + ey * (r + 1)];
      const cx = (p1[0] + p2[0]) / 2 + nx * bendPx, cy = (p1[1] + p2[1]) / 2 + ny * bendPx;
      const g = svg('g', { class: 'tr' }, gT);
      const path = svg('path', { d: `M${p1[0]},${p1[1]} Q${cx},${cy} ${p2[0]},${p2[1]}`, 'marker-end': 'url(#fsm-arrow-a)' }, g);
      const mx = 0.25 * p1[0] + 0.5 * cx + 0.25 * p2[0], my = 0.25 * p1[1] + 0.5 * cy + 0.25 * p2[1];
      const horizontal = Math.abs(dx) > Math.abs(dy);
      let tx = mx, ty = my, anchor = 'middle';
      if (side === 'l' || (side === 'lt' && name === 'tall')) { tx = mx - 8; ty = my + 3; anchor = 'end'; }
      else if (side === 'b') { tx = mx + 10; ty = my + 14; anchor = 'start'; }
      else if (horizontal) ty = my + (bend > 0 ? 14 : -7);
      else { tx = mx + 8; ty = my + 3; anchor = 'start'; }
      const t = svg('text', { x: tx, y: ty, 'text-anchor': anchor }, g);
      t.textContent = name === 'tall' ? tl : wl;
      trEls[id] = { g, path };
    });
    // self-loop on dispatched: ack keeps status dispatched
    {
      const [x, y] = L.pos.dispatched, r = L.r;
      const g = svg('g', { class: 'tr' }, gT);
      const y0 = y + r * 0.72, xs = x - r * 0.5, xe = x + r * 0.5;
      svg('path', { d: `M${xs},${y0} C${xs - 26},${y + r + 44} ${xe + 26},${y + r + 44} ${xe},${y0 + 2}`, 'marker-end': 'url(#fsm-arrow-a)' }, g);
      const t = svg('text', { x, y: y + r + 48, 'text-anchor': 'middle' }, g);
      t.textContent = name === 'tall' ? 'ack' : 'ack (stays dispatched)';
    }
    stEls = {};
    Object.entries(L.pos).forEach(([id, [x, y]]) => {
      const S = STATES[id];
      const g = svg('g', { class: `st${S.term ? ' term' : ''}` }, gS);
      svg('circle', { class: 'body', cx: x, cy: y, r: L.r }, g);
      const t = svg('text', { x, y: S.sub ? y - 6 : y }, g); t.textContent = S.label;
      if (S.sub) { const s = svg('text', { x, y: y + 9, class: 'sub' }, g); s.textContent = S.sub; }
      stEls[id] = g;
    });
    paint();
  }

  function paint() {
    const step = STEPS[idx];
    Object.entries(stEls).forEach(([k, g]) => {
      g.classList.toggle('on', !!step && step.state === k);
      g.classList.toggle('visited', visited.has(k) && !(step && step.state === k));
    });
    const hot = new Set(step ? step.tr : []);
    Object.entries(trEls).forEach(([k, { g, path }]) => {
      g.classList.toggle('on', hot.has(k));
      path.setAttribute('marker-end', `url(#fsm-arrow-${hot.has(k) ? 'b' : 'a'})`);
    });
  }

  function show(i) {
    idx = i;
    const s = STEPS[i];
    visited.add(s.state);
    if (s.via) visited.add(s.via);
    log.innerHTML = `<span class="step-k">${s.k}</span><h4>${s.h}</h4><p>${s.p.replace(/</g, '&lt;').replace(/&lt;id>/g, '&lt;id&gt;')}</p>`;
    ticks.forEach((t, k) => t.classList.toggle('done', k <= i));
    cancelAnimationFrame(cdRaf);
    clockEl.classList.remove('hot');
    if (s.countdown) {
      clockLbl.textContent = 'Are you OK? (10x speed)';
      clockEl.classList.add('hot');
      const t0 = performance.now();
      const run = (now) => {
        const left = Math.max(0, 30 - ((now - t0) / 1000) * 10);
        clockEl.textContent = `${Math.ceil(left)} s`;
        if (left > 0 && idx === i) cdRaf = requestAnimationFrame(run);
      };
      if (reduced()) clockEl.textContent = '30 s → 0'; else cdRaf = requestAnimationFrame(run);
    } else {
      clockLbl.textContent = 'Scenario clock';
      clockEl.textContent = s.clock;
    }
    paint();
  }

  function next() {
    if (idx >= STEPS.length - 1) { stop(); return false; }
    show(idx + 1);
    return true;
  }
  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    const s = STEPS[idx];
    const d = s && s.countdown ? 3300 : 2900;
    timer = setTimeout(() => { if (next()) schedule(); }, idx < 0 ? 200 : d);
  }
  function stop() {
    playing = false;
    clearTimeout(timer);
    playBtn.textContent = idx >= STEPS.length - 1 ? 'Replay scenario' : 'Resume';
  }
  function reset() {
    stop();
    cancelAnimationFrame(cdRaf);
    idx = -1; visited.clear();
    ticks.forEach((t) => t.classList.remove('done'));
    clockEl.textContent = 'T+0.0 s'; clockEl.classList.remove('hot'); clockLbl.textContent = 'Scenario clock';
    log.innerHTML = '<span class="step-k">Ready</span><h4>Eight steps from sensor to resolution</h4><p>Play the road-accident workflow from the project proposal. The 30 second countdown runs ten times faster here; steps that depend on a responder show symbolic times.</p>';
    playBtn.textContent = 'Play scenario';
    paint();
  }

  playBtn.addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (idx >= STEPS.length - 1) reset();
    playing = true;
    playBtn.textContent = 'Pause';
    if (idx < 0) { next(); }
    schedule();
  });
  stepBtn.addEventListener('click', () => { stop(); if (idx >= STEPS.length - 1) reset(); next(); });
  resetBtn.addEventListener('click', reset);

  const pick = () => (host.clientWidth < 560 ? 'tall' : 'wide');
  build(pick());
  new ResizeObserver(() => { const n = pick(); if (n !== layoutName) build(n); }).observe(host);
}
