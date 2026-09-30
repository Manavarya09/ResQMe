import { palette, onPaletteChange, setupCanvas, visibleLoop, reduced, monoFont } from '../lib/kit.js';
import { checkCorridor, haversineM, remainingPathM } from '../lib/geo.js';

const CORRIDOR_M = 150, GRACE_S = 60, ARRIVAL_M = 80, CLOCK = 8;
const LAT0 = 28.6139, LNG0 = 77.209;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 111320;
const toLL = ([x, y]) => ({ lat: LAT0 + y / KY, lng: LNG0 + x / KX });

const ROUTE_M = [[-980, -360], [-420, -300], [40, 160], [560, 210], [960, -170]];
const ROUTE = ROUTE_M.map(toLL);
const DEST = ROUTE[ROUTE.length - 1];

function autoKeys() {
  const [a, b, c, d, e] = ROUTE_M;
  const mid = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
  const dx = c[0] - b[0], dy = c[1] - b[1], L = Math.hypot(dx, dy);
  const off = [mid[0] - (dy / L) * 270, mid[1] + (dx / L) * 270];
  const off2 = [off[0] + 60, off[1] + 25];
  return [
    { p: a }, { p: b }, { p: mid }, { p: off }, { p: off2, hold: 1.5 }, { p: off, hold: 0 },
    { p: off2, hold: 7.5 }, { p: c }, { p: d }, { p: e, hold: 2.8 },
  ];
}

export default function corridor(canvas) {
  const read = document.getElementById('corRead');
  let view = null; // assigned below; draw() is a no-op until the canvas is ready
  view = setupCanvas(canvas, () => view && draw());
  onPaletteChange(draw);

  const keys = autoKeys();
  let mode = 'auto';
  let pos = [...ROUTE_M[0]];
  let seg = 0, holdLeft = 0;
  let offFor = 0, fired = false, arrived = false;
  let trail = [];
  let lastRead = '';

  // screen transform
  let S = 1, CX = 0, CY = 0;
  function fit() {
    const { w, h } = view;
    S = Math.min((w - 30) / 2200, (h - 40) / 1050);
    CX = w / 2; CY = h / 2 + 10;
  }
  const sx = ([x, y]) => [CX + x * S, CY - y * S];
  const mx = (px, py) => [(px - CX) / S, (CY - py) / S];

  function restart() {
    pos = [...ROUTE_M[0]]; seg = 0; holdLeft = 0; offFor = 0; fired = false; arrived = false; trail = [];
  }

  function stepAuto(dt) {
    if (holdLeft > 0) { holdLeft -= dt; return; }
    const target = keys[seg + 1];
    if (!target) { restart(); return; }
    const speed = 115; // display metres per real second
    const dx = target.p[0] - pos[0], dy = target.p[1] - pos[1], d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step) {
      pos = [...target.p];
      seg++;
      holdLeft = target.hold || 0;
    } else {
      pos = [pos[0] + (dx / d) * step, pos[1] + (dy / d) * step];
    }
  }

  function update(dt) {
    if (mode === 'auto') stepAuto(dt);
    const p = toLL(pos);
    const c = checkCorridor(p, ROUTE, CORRIDOR_M);
    if (!arrived && haversineM(p, DEST) <= ARRIVAL_M) arrived = true;
    if (!arrived) {
      if (!c.inside) offFor += dt * CLOCK; else offFor = 0;
      if (offFor >= GRACE_S && !fired) fired = true;
    }
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last[0] - pos[0], last[1] - pos[1]) > 12) { trail.push([...pos]); if (trail.length > 160) trail.shift(); }
    return c;
  }

  function draw(c) {
    const { ctx, w, h } = view;
    if (!w) return;
    fit();
    const P = palette();
    if (!c) c = checkCorridor(toLL(pos), ROUTE, CORRIDOR_M);
    ctx.clearRect(0, 0, w, h);
    const pts = ROUTE_M.map(sx);
    const trace = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // corridor: Minkowski sum of polyline and disc, outlined
    trace(); ctx.strokeStyle = 'rgba(244, 140, 37, 0.35)'; ctx.lineWidth = 2 * CORRIDOR_M * S + 2; ctx.stroke();
    trace(); ctx.strokeStyle = '#fff7ee'; ctx.lineWidth = 2 * CORRIDOR_M * S; ctx.stroke();
    // route
    trace(); ctx.strokeStyle = P.signal; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke();
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = P.signal; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 6 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    // arrival circle
    const [dxp, dyp] = pts[pts.length - 1];
    ctx.setLineDash([3, 3]); ctx.strokeStyle = arrived ? P.ok : P.ink2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(dxp, dyp, ARRIVAL_M * S, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = monoFont(10); ctx.fillStyle = P.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('Destination', dxp, dyp - ARRIVAL_M * S - 10);
    ctx.fillText('Start', pts[0][0], pts[0][1] + 22);
    ctx.textAlign = 'left';
    // labels
    ctx.fillStyle = P.ink3; ctx.textBaseline = 'top';
    ctx.fillText('150 m corridor', pts[1][0] - 10, pts[1][1] + CORRIDOR_M * S + 8);
    // trail
    ctx.fillStyle = P.ink3;
    trail.forEach((t, i) => { const [x, y] = sx(t); ctx.globalAlpha = 0.15 + 0.5 * (i / trail.length); ctx.fillRect(x - 1, y - 1, 2, 2); });
    ctx.globalAlpha = 1;
    // perpendicular foot
    const a = pts[c.index], b = pts[c.index + 1];
    const fx = a[0] + (b[0] - a[0]) * c.t, fy = a[1] + (b[1] - a[1]) * c.t;
    const [wx, wy] = sx(pos);
    ctx.strokeStyle = c.inside ? P.ink3 : P.alarm; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(wx, wy); ctx.stroke(); ctx.setLineDash([]);
    // right-angle mark
    const ux = (b[0] - a[0]), uy = (b[1] - a[1]), ul = Math.hypot(ux, uy) || 1;
    const vx = wx - fx, vy = wy - fy, vl = Math.hypot(vx, vy);
    if (vl > 14 && c.t > 0.001 && c.t < 0.999) {
      const e1 = [ux / ul * 6, uy / ul * 6], e2 = [vx / vl * 6, vy / vl * 6];
      ctx.beginPath(); ctx.moveTo(fx + e2[0], fy + e2[1]); ctx.lineTo(fx + e1[0] + e2[0], fy + e1[1] + e2[1]); ctx.lineTo(fx + e1[0], fy + e1[1]); ctx.stroke();
    }
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI * 2); ctx.fill();
    if (vl > 24) {
      ctx.fillStyle = c.inside ? P.ink2 : P.alarm; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`d = ${Math.round(c.distanceM)} m`, (fx + wx) / 2 + 8, (fy + wy) / 2);
    }
    // walker
    ctx.fillStyle = c.inside ? P.ink : P.alarm; ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(wx, wy, 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = c.inside ? P.ink : P.alarm; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(wx, wy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // scale bar
    const bar = 200 * S, bx = 14, by = h - 18;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by); ctx.lineTo(bx + bar, by); ctx.lineTo(bx + bar, by - 4); ctx.stroke();
    ctx.fillStyle = P.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('200 m', bx + bar + 6, by + 1);
    if (mode !== 'auto') { ctx.textAlign = 'right'; ctx.fillStyle = P.ink3; ctx.fillText('manual', w - 12, by + 1); }

    renderRead(c);
  }

  function renderRead(c) {
    let state, alarm = false;
    if (arrived) state = 'Arrived safely';
    else if (fired) { state = 'Route deviation: "Are you OK?"'; alarm = true; }
    else if (!c.inside) { state = 'Off route, counting'; alarm = true; }
    else state = 'On route';
    const rem = remainingPathM(toLL(pos), ROUTE);
    const key = `${state}|${Math.round(c.distanceM)}|${Math.floor(offFor)}|${c.index}|${c.t.toFixed(2)}|${Math.round(rem / 10)}|${mode}`;
    if (key === lastRead) return;
    lastRead = key;
    read.innerHTML = `
      <div class="lbl">Status</div>
      <div class="state ${alarm ? 'alarm' : ''}">${state}</div>
      <div class="lbl">Off route for ${Math.min(GRACE_S, Math.floor(offFor))} of ${GRACE_S} s</div>
      <div class="meter"><i style="transform:scaleX(${Math.min(1, offFor / GRACE_S)})"></i></div>
      <dl>
        <dt>Distance to route</dt><dd>${Math.round(c.distanceM)} m</dd>
        <dt>Inside corridor</dt><dd>${c.inside ? 'yes' : 'no'}</dd>
        <dt>Nearest segment</dt><dd>${c.index + 1}, at ${Math.round(c.t * 100)}%</dd>
        <dt>Left to walk</dt><dd>${rem < 1000 ? Math.round(rem) + ' m' : (rem / 1000).toFixed(2) + ' km'}</dd>
      </dl>
      <div style="margin-top:1rem;display:flex;gap:.4rem;flex-wrap:wrap">
        <button class="btn sm" type="button" data-cor="auto" ${mode === 'auto' ? 'aria-pressed="true"' : ''}>Auto walk</button>
        <button class="btn sm" type="button" data-cor="reset">Reset</button>
      </div>`;
  }
  read.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cor]');
    if (!b) return;
    if (b.dataset.cor === 'auto') { mode = 'auto'; restart(); }
    else { restart(); if (mode !== 'auto') pos = [...ROUTE_M[0]]; }
    lastRead = '';
    draw();
  });

  // dragging
  let dragging = false;
  const toModel = (e) => {
    const r = canvas.getBoundingClientRect();
    return mx(e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; mode = 'manual'; canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
    pos = toModel(e);
    if (arrived && haversineM(toLL(pos), DEST) > ARRIVAL_M) { arrived = false; }
    lastRead = '';
    if (reduced()) draw(update(0));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    pos = toModel(e);
    if (reduced()) draw(update(0));
  });
  const end = () => { dragging = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  if (reduced()) {
    // static: park the walker off-route with an expired grace period
    const k = autoKeys()[4].p;
    pos = [...k]; offFor = GRACE_S; fired = true; mode = 'manual';
    draw(update(0));
    // keep the deviation timer honest while the reader drags
    let last = performance.now();
    setInterval(() => { const now = performance.now(); const dt = (now - last) / 1000; last = now; if (dragging || mode === 'manual') draw(update(dt)); }, 250);
    return;
  }
  visibleLoop(canvas, (dt) => draw(update(dt)));
}
