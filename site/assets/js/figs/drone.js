import { palette, onPaletteChange, setupCanvas, visibleLoop, reduced, monoFont, serifFont } from '../lib/kit.js';
import { haversineM, stepDrone, bearingDeg, SPEED_MPS, ON_SCENE_M, MAX_DIRECT_RANGE_M } from '../lib/geo.js';

const FLEET = [
  { id: 'drone-1', name: 'Garuda-1', lat: 28.6315, lng: 77.2167, base: 'Connaught Pl.' },
  { id: 'drone-2', name: 'Garuda-2', lat: 28.5245, lng: 77.2066, base: 'Saket' },
  { id: 'drone-3', name: 'Garuda-3', lat: 28.5921, lng: 77.0460, base: 'Dwarka' },
];
const PRESET = [
  { lat: 28.6129, lng: 77.2295, name: 'India Gate' },
  { lat: 28.5494, lng: 77.2001, name: 'Hauz Khas' },
  { lat: 28.6219, lng: 77.0878, name: 'Janakpuri' },
  { lat: 28.5494, lng: 77.2517, name: 'Nehru Place' },
  { lat: 28.6519, lng: 77.1909, name: 'Karol Bagh' },
];
const BOUNDS = { s: 28.475, n: 28.69, w: 76.93, e: 77.375 };
const SIM = 20;            // sim seconds per real second
const HOVER_SIM_S = 60;    // on-scene time before the (simulated) responder resolves

export default function drone(canvas) {
  const rows = document.getElementById('droneRows');
  const evEl = document.getElementById('droneEv');
  let view = null; // assigned below; draw() is a no-op until the canvas is ready
  view = setupCanvas(canvas, () => view && draw());
  onPaletteChange(draw);

  const drones = FLEET.map((f) => ({
    id: f.id, name: f.name, base: f.base, status: 'idle', lat: f.lat, lng: f.lng, baseLat: f.lat, baseLng: f.lng,
    batteryPct: 100, incidentId: null, etaSeconds: null, trail: [], heading: 0,
  }));
  let incidents = [];
  let simT = 0, acc = 0, idleFor = 0, presetIdx = 0, nextId = 1;
  const events = [];

  const log = (msg) => {
    events.unshift(`${Math.round(simT)} s · ${msg}`);
    events.length = Math.min(events.length, 5);
    evEl.innerHTML = events.map((e) => `<div>${e}</div>`).join('');
  };

  function report(lat, lng, label) {
    const inc = { id: nextId++, lat, lng, label, status: 'open', droneId: null, onSceneAt: null, createdAt: simT };
    incidents.push(inc);
    const idle = drones.filter((d) => d.status === 'idle');
    if (!idle.length) { log(`#${inc.id} 409 No drones available right now`); inc.status = 'unserved'; return inc; }
    const cand = idle.map((d) => ({ d, dist: haversineM(d, inc) })).sort((a, b) => a.dist - b.dist);
    const { d, dist } = cand[0];
    d.status = dist <= ON_SCENE_M ? 'on_scene' : 'en_route';
    d.incidentId = inc.id;
    d.etaSeconds = Math.ceil(Math.max(0, dist - ON_SCENE_M) / SPEED_MPS);
    d.trail = [[d.lat, d.lng]];
    inc.droneId = d.id;
    inc.status = 'dispatched';
    log(`#${inc.id} ${label}: ${d.name} dispatched · ${(dist / 1000).toFixed(2)} km · ETA ${Math.max(1, Math.round(d.etaSeconds / 60))} min${dist > MAX_DIRECT_RANGE_M ? ' (reposition)' : ''}`);
    return inc;
  }

  function simStep() {
    simT += 1;
    drones.forEach((d) => {
      const inc = incidents.find((i) => i.id === d.incidentId);
      const target = inc && inc.status !== 'resolved' ? { lat: inc.lat, lng: inc.lng } : null;
      if ((d.status === 'en_route' || d.status === 'on_scene') && !target) d.status = 'returning';
      const before = { lat: d.lat, lng: d.lng };
      const res = stepDrone(d, target, 1);
      if (!res.changed) {
        if (d.status === 'on_scene' && inc && inc.onSceneAt != null && simT - inc.onSceneAt >= HOVER_SIM_S) {
          inc.status = 'resolved';
          log(`#${inc.id} resolved by responder → ${d.name} returning`);
        }
        return;
      }
      Object.assign(d, res.drone);
      if (d.lat !== before.lat || d.lng !== before.lng) {
        d.heading = bearingDeg(before.lat, before.lng, d.lat, d.lng);
        if (simT % 4 === 0) { d.trail.push([d.lat, d.lng]); if (d.trail.length > 400) d.trail.shift(); }
      }
      if (res.event === 'arrived_scene' && inc) { inc.onSceneAt = simT; log(`#${inc.id} ${d.name} is on scene · battery ${d.batteryPct.toFixed(1)} %`); }
      if (res.event === 'arrived_base') { d.trail = []; log(`${d.name} at base · battery swapped → 100 %`); }
    });
    incidents = incidents.filter((i) => (i.status === 'unserved' ? simT - i.createdAt < 60 : i.status !== 'resolved'));
  }

  // projection
  let S = 1, OX = 0, OY = 0;
  const K = Math.cos((28.585 * Math.PI) / 180);
  function fit() {
    const { w, h } = view;
    const spanX = (BOUNDS.e - BOUNDS.w) * K, spanY = BOUNDS.n - BOUNDS.s;
    S = Math.min((w - 24) / spanX, (h - 24) / spanY);
    OX = (w - spanX * S) / 2; OY = (h - spanY * S) / 2;
  }
  const P2 = (lat, lng) => [OX + (lng - BOUNDS.w) * K * S, OY + (BOUNDS.n - lat) * S];
  const unP = (x, y) => ({ lng: BOUNDS.w + (x - OX) / (K * S), lat: BOUNDS.n - (y - OY) / S });
  const mPerPx = () => 111320 / S;

  function draw() {
    const { ctx, w, h } = view;
    if (!w) return;
    fit();
    const P = palette();
    ctx.clearRect(0, 0, w, h);
    // graticule
    ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.font = monoFont(9.5); ctx.fillStyle = P.ink3;
    for (let lat = 28.5; lat <= BOUNDS.n + 1e-9; lat += 0.05) {
      const [, y] = P2(lat, BOUNDS.w);
      ctx.beginPath(); ctx.moveTo(P2(lat, BOUNDS.w)[0], y); ctx.lineTo(P2(lat, BOUNDS.e)[0], y); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(`${lat.toFixed(2)}°N`, P2(lat, BOUNDS.w)[0] + 3, y - 2);
    }
    for (let lng = 77.0; lng <= BOUNDS.e + 1e-9; lng += 0.05) {
      const [x] = P2(BOUNDS.n, lng);
      ctx.beginPath(); ctx.moveTo(x, P2(BOUNDS.n, lng)[1]); ctx.lineTo(x, P2(BOUNDS.s, lng)[1]); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(`${lng.toFixed(2)}°E`, x, P2(BOUNDS.s, lng)[1] - 3);
    }
    // 25 km direct-range arcs
    ctx.save();
    ctx.beginPath(); ctx.rect(...P2(BOUNDS.n, BOUNDS.w), (BOUNDS.e - BOUNDS.w) * K * S, (BOUNDS.n - BOUNDS.s) * S); ctx.clip();
    ctx.setLineDash([3, 5]); ctx.strokeStyle = P.rule2;
    drones.forEach((d) => { const [x, y] = P2(d.baseLat, d.baseLng); ctx.beginPath(); ctx.arc(x, y, MAX_DIRECT_RANGE_M / mPerPx(), 0, Math.PI * 2); ctx.stroke(); });
    ctx.restore();
    ctx.setLineDash([]);
    // scale bar 2 km
    const bar = 2000 / mPerPx();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; const bx = w - bar - 20, by = 20;
    ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bar, by); ctx.lineTo(bx + bar, by + 4); ctx.stroke();
    ctx.fillStyle = P.ink2; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = monoFont(9.5); ctx.fillText('2 km', bx + bar / 2, by + 5);
    // bases
    drones.forEach((d) => {
      const [x, y] = P2(d.baseLat, d.baseLng);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = P.ink2; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.ink2; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = monoFont(10);
      ctx.fillText(d.base, x, y + 10);
    });
    // incidents
    incidents.forEach((i) => {
      if (i.status === 'resolved') return;
      const [x, y] = P2(i.lat, i.lng);
      ctx.strokeStyle = P.alarm; ctx.lineWidth = 1.6;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
      ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12); ctx.stroke();
      const txt = `#${i.id} ${i.label || ''}`;
      ctx.font = serifFont(11, true);
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 12, y - 32, tw + 12, 18, 9) : ctx.rect(x + 12, y - 32, tw + 12, 18); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.alarm; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x + 18, y - 23);
    });
    // drones
    drones.forEach((d) => {
      const flying = d.status !== 'idle';
      if (d.trail.length > 1) {
        ctx.strokeStyle = P.ink3; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
        ctx.beginPath(); d.trail.forEach(([la, ln], k) => { const [x, y] = P2(la, ln); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        const [cx, cy] = P2(d.lat, d.lng); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
      }
      const inc = incidents.find((i) => i.id === d.incidentId);
      const [x, y] = P2(d.lat, d.lng);
      if (d.status === 'en_route' && inc) {
        const [tx, ty] = P2(inc.lat, inc.lng);
        ctx.strokeStyle = P.signal; ctx.globalAlpha = 0.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate((d.heading * Math.PI) / 180);
      ctx.fillStyle = flying ? P.signal : P.ink; ctx.strokeStyle = P.plate; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (flying && d.status !== 'on_scene') {
        ctx.fillStyle = P.ink; ctx.font = monoFont(10, 700); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(d.name, x - 10, y);
      }
    });
    ctx.fillStyle = P.ink3; ctx.font = monoFont(9.5); ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`simulated time ${Math.round(simT)} s`, 12, h - 8);
    renderRows();
  }

  let lastRows = '';
  function renderRows() {
    const html = drones.map((d) => `<tr><td>${d.name}</td><td>${d.status.replace('_', ' ')}</td><td>${d.batteryPct.toFixed(1)}%</td><td>${d.etaSeconds != null && d.status !== 'idle' ? d.etaSeconds + 's' : '—'}</td></tr>`).join('');
    if (html !== lastRows) { rows.innerHTML = html; lastRows = html; }
  }

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = unP(e.clientX - r.left, e.clientY - r.top);
    report(p.lat, p.lng, 'reported');
    idleFor = 0;
    if (reduced()) { for (let i = 0; i < 4000 && drones.some((d) => d.status === 'en_route'); i++) simStep(); }
    draw();
  });

  log('fleet ready · 3 idle at base');
  const first = PRESET[presetIdx++ % PRESET.length];
  report(first.lat, first.lng, first.name);

  if (reduced()) {
    for (let i = 0; i < 120; i++) simStep();
    draw();
    return;
  }
  visibleLoop(canvas, (dt) => {
    acc += dt * SIM;
    let n = 0;
    while (acc >= 1 && n < 200) { simStep(); acc -= 1; n++; }
    const busy = drones.some((d) => d.status !== 'idle') || incidents.some((i) => i.status !== 'resolved' && i.status !== 'unserved');
    if (!busy) {
      idleFor += dt;
      if (idleFor > 1.2) {
        idleFor = 0;
        const p = PRESET[presetIdx++ % PRESET.length];
        report(p.lat, p.lng, p.name);
      }
    } else idleFor = 0;
    draw();
  });
}
