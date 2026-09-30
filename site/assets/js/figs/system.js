import { svg, visibleLoop, reduced } from '../lib/kit.js';

const LAYERS = { P: 'Physical · sensing', C: 'Cyber · processing and intelligence', A: 'Actuation · response' };

const NODES = {
  imu: { L: 'P', name: 'Motion sensors', sub: 'accel + gyro, 50 Hz', tech: 'expo-sensors · Accelerometer + Gyroscope · 20 ms interval',
    resp: ['Fuse acceleration (g) with the latest gyroscope reading (rad/s) into one sample stream', 'Share a single hardware subscription between all consumers', 'Absent on web and some emulators: the app then offers “Simulate impact”'],
    io: ['startMotionStream(onSample) → unsubscribe', 'Sample = { t, ax, ay, az, gx, gy, gz }'] },
  gnss: { L: 'P', name: 'GPS', sub: 'expo-location', tech: 'expo-location position watch',
    resp: ['Position for the map, route corridor and incidents', 'Trail recorded every > 4 m while tracking', 'Falls back to a default point when permission is missing'],
    io: ['LocationContext.subscribe(fn)', 'POST /api/incidents/:id/location every 15 s'] },
  meteo: { L: 'P', name: 'Open-Meteo', sub: 'live weather', tech: 'api.open-meteo.com/v1/forecast · 5 s timeout',
    resp: ['Temperature, precipitation, WMO code, gusts, visibility', 'Cached 10 min per 0.1° cell', 'Never throws: stale cache or an empty list'],
    io: ['mapWeatherToHazards(current, lat, lng)', 'heat · flood · fog · storm (Table 1)'] },
  feed: { L: 'P', name: 'Hazard feed', sub: 'crime, accidents', tech: 'PostgreSQL hazards table · mulberry32 seeded PRNG',
    resp: ['Deterministic crime / accident zones when fewer than 3 are nearby', 'Community reports with severity and radius', 'Expired hazards excluded'],
    io: ['GET /api/hazards?lat&lng&radiusKm', 'POST /api/hazards → hazard:new'] },
  app: { L: 'C', name: 'Mobile app', sub: 'Expo SDK 54', tech: 'React Native · Expo Go · NativeWind · Socket.IO client',
    resp: ['On-device impact detection (§2)', 'Escalation countdown and offline queue (§3)', 'Walk-with-me corridor and timer (§4)', 'AI chat UI, medical ID, training, CPR pacer', 'Biometric app lock; session in secure store'],
    io: ['REST + Socket.IO to the API', 'expo-sms · tel: · expo-notifications'] },
  api: { L: 'C', name: 'API server', sub: 'Node + Socket.IO', tech: 'Node 22 · Express · Socket.IO · zod · helmet · bcrypt · jsonwebtoken',
    resp: ['Auth, TOTP MFA, token versioning, audit log', 'Incident lifecycle and broadcast', 'AES-256-GCM medical IDs, share tokens, /m/:token', 'Hazards, weather, drone simulator tick', 'Chat proxy; serves the responder console'],
    io: ['/api/* (see Reference)', 'rooms user:<id>, responders', '/health · /ready'] },
  db: { L: 'C', name: 'Database', sub: 'PostgreSQL 16', tech: 'pg · SQL migrations 001, 002',
    resp: ['Ten tables (Fig. 6)', 'Incident creation in one transaction', 'Drone assignment with SELECT … FOR UPDATE'],
    io: ['DATABASE_URL', 'pg_isready health check'] },
  ai: { L: 'C', name: 'AI service', sub: 'FastAPI + LLM', tech: 'Python 3.13 · FastAPI · pydantic · httpx',
    resp: ['/chat: crisis guidance as JSON', '/triage: rule severity, optional LLM summary', '/motion/score: server-side window scoring'],
    io: ['POST /chat · /triage · /motion/score', 'OpenRouter chat/completions, json_object'] },
  rules: { L: 'C', name: 'Rules engine', sub: 'always available', tech: 'rules.py · triage.py · motion.py · backend services/ai.js',
    resp: ['14 keyword first-aid topics with steps and videos', 'Triage by trigger, impact, medical risk, keywords', 'Local JS port of motion scoring in the API'],
    io: ['Engaged on: no key, timeout, bad JSON, service down', 'Same response shape as the LLM path'] },
  sms: { L: 'A', name: 'Contacts', sub: 'SMS composer', tech: 'expo-sms',
    resp: ['Pre-filled alert with a maps link to every contact', 'Works offline', 'User taps send (OS rule: no silent SMS)'],
    io: ['SMS.sendSMSAsync(phones, message)'] },
  dial: { L: 'A', name: 'Quick dial', sub: '112, 108, 100', tech: 'tel: links · country presets',
    resp: ['IN default: 112 national, 100 police, 101 fire, 108 ambulance, 1091 women', 'Available without a connection'],
    io: ['Linking.openURL("tel:…")'] },
  console: { L: 'A', name: 'Responders', sub: 'web console', tech: 'static HTML + JS · Leaflet · Socket.IO client',
    resp: ['Live severity-sorted queue and map', 'Triage, impact score, medical card, timeline', 'Acknowledge with ETA, dispatch drone, resolve', 'TOTP sign-in'],
    io: ['room responders', 'POST /ack · /drone · /resolve'] },
  drone: { L: 'A', name: 'Drone sim', sub: '3 drones, 1 Hz', tech: 'in-process in the API · services/drones.js',
    resp: ['Nearest idle drone, reposition if > 25 km', '15 m/s great-circle steps, on scene at 30 m', 'Battery −0.05 %/s, swap at base'],
    io: ['POST /api/incidents/:id/drone', 'drone:update to responders + owner'] },
  notify: { L: 'A', name: 'Local alerts', sub: 'hazards, haptics', tech: 'expo-notifications · expo-haptics',
    resp: ['Notify when a hazard is within radius', 'Haptic confirmation when help is acknowledged'],
    io: ['hazard:new · incident:updated'] },
};

// kind: w = wire, n = network (wavy), d = dashed fallback.  bi = packets both ways.
const EDGES = [
  ['imu', 'app', 'w', 'samples 50 Hz'],
  ['gnss', 'app', 'w', 'fix'],
  ['meteo', 'api', 'n', 'HTTPS · 10 min cache'],
  ['feed', 'api', 'w', 'SQL'],
  ['app', 'api', 'n', 'REST + WebSocket', true],
  ['api', 'db', 'w', 'SQL · tx', true],
  ['api', 'ai', 'n', 'HTTP · 4 s / 15 s', true],
  ['api', 'rules', 'd', 'AI unreachable'],
  ['ai', 'rules', 'd', 'LLM failure'],
  ['app', 'sms', 'w', 'expo-sms'],
  ['app', 'dial', 'w', 'tel:'],
  ['app', 'notify', 'w', 'local'],
  ['api', 'console', 'n', 'incident:new / updated', true],
  ['api', 'drone', 'w', 'tick 1 s', true],
];

const LAYOUTS = {
  wide: {
    vb: [740, 540], nw: 128, nh: 48,
    bands: { P: [4, 128], C: [140, 382], A: [394, 536] },
    pos: {
      imu: [95, 76], gnss: [260, 76], meteo: [460, 76], feed: [625, 76],
      app: [95, 262], api: [320, 262], ai: [510, 204], db: [510, 322], rules: [660, 262],
      sms: [80, 474], dial: [225, 474], console: [370, 474], drone: [515, 474], notify: [660, 474],
    },
  },
  tall: {
    vb: [400, 860], nw: 168, nh: 48,
    bands: { P: [4, 190], C: [202, 552], A: [564, 856] },
    pos: {
      imu: [100, 74], gnss: [300, 74], meteo: [100, 144], feed: [300, 144],
      app: [100, 276], api: [300, 276], db: [100, 380], ai: [300, 380], rules: [300, 484],
      sms: [100, 622], dial: [300, 622], console: [100, 704], drone: [300, 704], notify: [100, 786],
    },
  },
};

export default function system(host) {
  const panel = document.getElementById('sysPanel');
  let selected = 'api';
  let layoutName = null;
  let edges = [];
  let nodeEls = {};
  let packets = [];

  function renderPanel(id) {
    const n = NODES[id];
    panel.innerHTML = `
      <div class="layer">${LAYERS[n.L]}</div>
      <h4>${n.name}</h4>
      <div class="tech">${n.tech}</div>
      <h5>Responsibilities</h5><ul>${n.resp.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <h5>Interfaces</h5><ul>${n.io.map((r) => `<li><code>${esc(r)}</code></li>`).join('')}</ul>`;
  }

  function select(id) {
    selected = id;
    Object.entries(nodeEls).forEach(([k, g]) => g.classList.toggle('sel', k === id));
    const linked = new Set([id]);
    edges.forEach((e) => {
      const on = e.a === id || e.b === id;
      if (on) { linked.add(e.a); linked.add(e.b); }
      e.path.classList.toggle('hot', on);
      e.path.classList.toggle('dim', !on);
      e.label.classList.toggle('show', on);
    });
    Object.entries(nodeEls).forEach(([k, g]) => g.classList.toggle('dim', !linked.has(k)));
    renderPanel(id);
  }

  function build(name) {
    layoutName = name;
    const L = LAYOUTS[name];
    host.innerHTML = '';
    const root = svg('svg', { viewBox: `0 0 ${L.vb[0]} ${L.vb[1]}`, 'aria-hidden': 'true' }, host);
    // bands
    Object.entries(L.bands).forEach(([k, [y0, y1]]) => {
      svg('rect', { class: 'band', x: 1, y: y0, width: L.vb[0] - 2, height: y1 - y0, rx: 14 }, root);
      const t = svg('text', { class: 't-band', x: 16, y: y0 + 22 }, root);
      t.textContent = LAYERS[k];
    });
    const gEdges = svg('g', {}, root);
    const gLabels = svg('g', {}, root);
    const gPackets = svg('g', {}, root);
    const gNodes = svg('g', {}, root);

    edges = EDGES.map(([a, b, kind, text, bi]) => {
      const [x1, y1] = L.pos[a], [x2, y2] = L.pos[b];
      const d = `M${x1},${y1} L${x2},${y2}`;
      const path = svg('path', { d, class: `edge${kind === 'd' ? ' dash' : ''}` }, gEdges);
      const len = path.getTotalLength();
      const mid = path.getPointAtLength(len / 2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const off = 11;
      const label = svg('text', { class: 'edge-label', x: mid.x + nx * off, y: mid.y + ny * off + 3, 'text-anchor': 'middle' }, gLabels);
      label.textContent = text;
      return { a, b, kind, bi, path, len, label };
    });

    nodeEls = {};
    Object.entries(L.pos).forEach(([id, [x, y]]) => {
      const n = NODES[id];
      const g = svg('g', { class: 'node', tabindex: 0, role: 'button', 'aria-label': `${n.name}: ${n.sub}` }, gNodes);
      svg('rect', { x: x - L.nw / 2, y: y - L.nh / 2, width: L.nw, height: L.nh, rx: 12 }, g);
      svg('rect', { class: 'tick', x: x - L.nw / 2 + 10, y: y - 7, width: 3, height: 14, rx: 1.5 }, g);
      const t = svg('text', { class: 't-label', x: x - L.nw / 2 + 20, y: y - 2 }, g); t.textContent = n.name;
      const s2 = svg('text', { class: 't-sub', x: x - L.nw / 2 + 20, y: y + 13 }, g); s2.textContent = n.sub;
      g.addEventListener('click', () => select(id));
      g.addEventListener('mouseenter', () => select(id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } });
      g.addEventListener('focus', () => select(id));
      nodeEls[id] = g;
    });

    // packets
    packets = [];
    if (!reduced()) {
      edges.forEach((e, i) => {
        const count = e.kind === 'd' ? 1 : e.bi ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const halo = svg('circle', { class: 'packet-halo', r: 5.5 }, gPackets);
          const dot = svg('circle', { class: 'packet', r: 2.4 }, gPackets);
          packets.push({ e, dot, halo, dir: e.bi && k === 1 ? -1 : 1, phase: ((i * 0.37) + k * 0.5) % 1, speed: e.kind === 'd' ? 0.18 : 0.32 + ((i * 13) % 7) * 0.03 });
        }
      });
    }
    select(selected);
  }

  const pick = () => (host.clientWidth < 520 ? 'tall' : 'wide');
  build(pick());
  new ResizeObserver(() => { const n = pick(); if (n !== layoutName) build(n); }).observe(host);

  if (reduced()) return;
  visibleLoop(host, (dt) => {
    for (const p of packets) {
      p.phase = (p.phase + dt * p.speed * (180 / Math.max(60, p.e.len))) % 1;
      const s = p.dir > 0 ? p.phase : 1 - p.phase;
      const pt = p.e.path.getPointAtLength(s * p.e.len);
      const fade = Math.min(1, p.phase * 8, (1 - p.phase) * 8);
      const dimmed = p.e.path.classList.contains('dim') ? 0.25 : 1;
      p.dot.setAttribute('cx', pt.x); p.dot.setAttribute('cy', pt.y);
      p.halo.setAttribute('cx', pt.x); p.halo.setAttribute('cy', pt.y);
      p.dot.style.opacity = fade * dimmed;
      p.halo.style.opacity = 0.22 * fade * dimmed;
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
