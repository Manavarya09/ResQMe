/* ResQMe Responder Console — vanilla JS, no build step. */
(function () {
  'use strict';

  const API = window.location.origin;
  const TOKEN_KEY = 'resqme.responder.token';
  const SOUND_KEY = 'resqme.responder.sound';
  const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi
  const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
  const ACTIVE = ['open', 'acknowledged', 'dispatched'];
  const CLOSED = ['resolved', 'cancelled'];
  const SEV_COLOR = { critical: '#ef4444', high: '#f48c25', medium: '#eab308', low: '#38bdf8' };
  const HAZARD_COLOR = { crime: '#fb7185', accident: '#f97316', flood: '#38bdf8', heat: '#f59e0b', fog: '#94a3b8', storm: '#a78bfa', weather: '#60a5fa', other: '#cbd5e1' };
  const EVENT_COLOR = {
    created: '#ef4444', triaged: '#f48c25', acknowledged: '#f48c25', drone_dispatched: '#a78bfa', drone_on_scene: '#a78bfa',
    resolved: '#22c55e', cancelled: '#768194', medical_withheld: '#eab308',
  };
  const TRIGGER_LABEL = { sos: 'SOS', impact: 'Impact / crash', route_deviation: 'Route deviation', timer_expired: 'Timer expired', manual: 'Manual report' };

  const ICONS = {
    sos: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/></svg>',
    impact: '<svg viewBox="0 0 24 24"><path d="m12 2 2.2 5.6L20 6l-3 5 5 3-5.8.8L17 21l-5-3.5L7 21l.8-6.2L2 14l5-3-3-5 5.8 1.6z"/></svg>',
    route_deviation: '<svg viewBox="0 0 24 24"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/></svg>',
    timer_expired: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
    manual: '<svg viewBox="0 0 24 24"><path d="M4 21V4h11l-1 4 6 0-3 6H9"/></svg>',
    drone: '<svg viewBox="0 0 24 24"><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  };

  // ------------------------------------------------------------------ state
  const state = {
    token: safeGet(TOKEN_KEY),
    me: null,
    incidents: new Map(),
    drones: new Map(),
    hazards: new Map(),
    selectedId: null,
    selectedDetail: null,
    filter: 'active',
    sound: safeGet(SOUND_KEY) !== 'off',
    showHazards: true,
    socket: null,
    fresh: new Set(),
    mfaToken: null, // pending second login step
  };

  // ------------------------------------------------------------------ utils
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');

  function timeAgo(iso) {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 45) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }
  const clockTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const distKm = (a, b, c, d) => {
    const r = Math.PI / 180;
    const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  };
  function age(dob) {
    if (!dob) return null;
    const d = new Date(dob + 'T00:00:00Z');
    if (isNaN(d)) return null;
    const n = new Date();
    let a = n.getUTCFullYear() - d.getUTCFullYear();
    if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a -= 1;
    return a;
  }

  function toast(msg, isErr) {
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (res.status === 401 && path.indexOf('/api/auth/') !== 0) { logout('Session expired, please sign in again.'); throw new Error('Unauthorized'); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    return data;
  }

  // ------------------------------------------------------------------ audio
  let audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep(critical) {
    if (!state.sound) return;
    ensureAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const tones = critical ? [988, 740, 988, 740, 988] : [880, 660, 880];
    tones.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      const s = t0 + i * 0.18;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.12, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(s);
      o.stop(s + 0.17);
    });
  }
  let flashTimer = null;
  function flashHeader() {
    const bar = $('topbar');
    bar.classList.remove('flash');
    void bar.offsetWidth; // restart animation
    bar.classList.add('flash');
    $('alertBanner').hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { bar.classList.remove('flash'); $('alertBanner').hidden = true; }, 4500);
  }
  function renderSoundBtn() {
    const b = $('soundBtn');
    b.innerHTML = state.sound ? ICONS.soundOn : ICONS.soundOff;
    b.setAttribute('aria-pressed', String(state.sound));
    b.title = state.sound ? 'Alert sound on' : 'Alert sound off';
  }

  // ------------------------------------------------------------------ map
  let map = null;
  const layers = { incidents: null, drones: null, hazards: null, links: null };
  const incMarkers = new Map();
  const droneMarkers = new Map();
  const droneLinks = new Map();

  function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true, attributionControl: true, preferCanvas: false }).setView(DEFAULT_CENTER, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layers.hazards = L.layerGroup().addTo(map);
    layers.links = L.layerGroup().addTo(map);
    layers.incidents = L.layerGroup().addTo(map);
    layers.drones = L.layerGroup().addTo(map);
  }

  function incIcon(inc) {
    const cls = ['inc-marker', 'sev-' + inc.severity];
    if (inc.status === 'open') cls.push('pulse');
    if (CLOSED.indexOf(inc.status) >= 0) cls.push('closed');
    if (inc.id === state.selectedId) cls.push('selected');
    return L.divIcon({ className: '', html: '<div class="' + cls.join(' ') + '"><span class="dot"></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  }

  function syncIncidentMarker(inc) {
    if (!map) return;
    const visible = isVisible(inc);
    let m = incMarkers.get(inc.id);
    if (!visible) { if (m) { layers.incidents.removeLayer(m); incMarkers.delete(inc.id); } return; }
    if (!m) {
      m = L.marker([inc.lat, inc.lng], { icon: incIcon(inc), zIndexOffset: SEV_RANK[inc.severity] * 100 });
      m.on('click', () => select(inc.id));
      m.addTo(layers.incidents);
      incMarkers.set(inc.id, m);
    } else {
      m.setLatLng([inc.lat, inc.lng]);
      m.setIcon(incIcon(inc));
    }
    m.bindTooltip(esc(inc.user && inc.user.name) + ' · ' + esc(TRIGGER_LABEL[inc.trigger] || inc.trigger), { direction: 'top', offset: [0, -10] });
  }

  function droneIcon(d) {
    const cls = 'drone-marker ' + (d.status === 'idle' ? 'idle' : 'active');
    const tag = d.status === 'idle' ? esc(d.name) : esc(d.name) + ' · ' + (d.status === 'on_scene' ? 'ON SCENE' : d.status === 'returning' ? 'RTB' : fmtEta(d.etaSeconds));
    return L.divIcon({ className: '', html: '<div class="' + cls + '"><div class="body">' + ICONS.drone + '</div><div class="tag">' + tag + '</div></div>', iconSize: [34, 34], iconAnchor: [17, 17] });
  }
  function fmtEta(s) {
    if (s == null) return '--';
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's';
  }

  function syncDroneMarker(d) {
    if (!map) return;
    let m = droneMarkers.get(d.id);
    if (!m) {
      m = L.marker([d.lat, d.lng], { icon: droneIcon(d), zIndexOffset: 2000 }).addTo(layers.drones);
      droneMarkers.set(d.id, m);
    } else {
      m.setLatLng([d.lat, d.lng]);
      m.setIcon(droneIcon(d));
    }
    m.bindTooltip(esc(d.name) + ' · ' + esc(d.status.replace('_', ' ')) + ' · ' + Math.round(d.batteryPct) + '%', { direction: 'top', offset: [0, -16] });
    // dashed link drone → incident while flying/on scene
    const inc = d.incidentId && state.incidents.get(d.incidentId);
    let link = droneLinks.get(d.id);
    if (inc && d.status !== 'idle' && d.status !== 'returning') {
      const pts = [[d.lat, d.lng], [inc.lat, inc.lng]];
      if (!link) {
        link = L.polyline(pts, { color: '#a78bfa', weight: 2, opacity: 0.8, dashArray: '6 6' }).addTo(layers.links);
        droneLinks.set(d.id, link);
      } else link.setLatLngs(pts);
    } else if (link) {
      layers.links.removeLayer(link);
      droneLinks.delete(d.id);
    }
  }

  function renderHazards() {
    if (!map) return;
    layers.hazards.clearLayers();
    if (!state.showHazards) return;
    state.hazards.forEach((h) => {
      const color = HAZARD_COLOR[h.type] || '#cbd5e1';
      L.circle([h.lat, h.lng], { radius: h.radiusM || 300, color, weight: 1.5, dashArray: '4 4', fillColor: color, fillOpacity: 0.12 })
        .bindPopup('<b>' + esc(h.title) + '</b><br><span style="color:#aab3c2">' + esc(h.type) + ' · ' + esc(h.severity) + ' · ' + esc(h.source) + '</span>' + (h.description ? '<br><small>' + esc(h.description) + '</small>' : ''))
        .addTo(layers.hazards);
    });
  }

  async function loadHazards(lat, lng) {
    try {
      const list = await api('/api/hazards?lat=' + lat.toFixed(5) + '&lng=' + lng.toFixed(5) + '&radiusKm=8');
      list.forEach((h) => state.hazards.set(h.id, h));
      renderHazards();
    } catch (e) { /* hazards are best effort */ }
  }

  function fitAll() {
    if (!map) return;
    const pts = [];
    state.incidents.forEach((i) => { if (isVisible(i)) pts.push([i.lat, i.lng]); });
    state.drones.forEach((d) => { if (d.status !== 'idle') pts.push([d.lat, d.lng]); });
    if (!pts.length) { map.setView(DEFAULT_CENTER, 12); return; }
    if (pts.length === 1) { map.setView(pts[0], 15); return; }
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
  }

  // ------------------------------------------------------------------ queue
  function isVisible(inc) {
    if (state.filter === 'active') return ACTIVE.indexOf(inc.status) >= 0;
    if (state.filter === 'closed') return CLOSED.indexOf(inc.status) >= 0;
    return true;
  }
  function sorted() {
    return Array.from(state.incidents.values()).filter(isVisible).sort((a, b) => {
      const aa = ACTIVE.indexOf(a.status) >= 0 ? 1 : 0;
      const bb = ACTIVE.indexOf(b.status) >= 0 ? 1 : 0;
      return (bb - aa) || (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || (new Date(b.createdAt) - new Date(a.createdAt));
    });
  }

  function renderQueue() {
    const list = sorted();
    const ul = $('queueList');
    ul.innerHTML = list.map((inc) => {
      const cls = ['q-item', 'sev-' + inc.severity];
      if (inc.id === state.selectedId) cls.push('selected');
      if (state.fresh.has(inc.id)) cls.push('fresh');
      const name = (inc.user && inc.user.name) || 'Unknown user';
      return '<li class="' + cls.join(' ') + '" data-id="' + esc(inc.id) + '" tabindex="0" role="button" aria-label="' + esc(name + ', ' + inc.severity + ' ' + (TRIGGER_LABEL[inc.trigger] || inc.trigger)) + '">' +
        '<span class="q-icon">' + (ICONS[inc.trigger] || ICONS.manual) + '</span>' +
        '<span class="q-main"><div class="q-title">' + esc(name) + '</div>' +
        '<div class="q-sub">' + esc(TRIGGER_LABEL[inc.trigger] || inc.trigger) + (inc.triage && inc.triage.summary ? ' · ' + esc(inc.triage.summary) : '') + '</div></span>' +
        '<span class="q-side"><span class="badge">' + esc(inc.severity) + '</span>' +
        '<span class="status-pill st-' + esc(inc.status) + '">' + esc(inc.status) + '</span>' +
        '<span class="q-time" data-ts="' + esc(inc.createdAt) + '">' + timeAgo(inc.createdAt) + '</span></span></li>';
    }).join('');
    $('queueEmpty').hidden = list.length > 0;
    const activeCount = Array.from(state.incidents.values()).filter((i) => ACTIVE.indexOf(i.status) >= 0).length;
    const c = $('queueCount');
    c.textContent = String(activeCount);
    c.classList.toggle('zero', activeCount === 0);
    state.fresh.clear();
  }

  function renderStats() {
    let open = 0; let ack = 0; let disp = 0;
    state.incidents.forEach((i) => { if (i.status === 'open') open++; else if (i.status === 'acknowledged') ack++; else if (i.status === 'dispatched') disp++; });
    let active = 0;
    state.drones.forEach((d) => { if (d.status !== 'idle') active++; });
    $('statOpen').textContent = open;
    $('statAck').textContent = ack;
    $('statDispatched').textContent = disp;
    $('statDrones').textContent = active + '/' + state.drones.size;
    document.title = (open ? '(' + open + ') ' : '') + 'ResQMe Responder Console';
  }

  function renderAll() {
    renderQueue();
    renderStats();
    state.incidents.forEach(syncIncidentMarker);
    state.drones.forEach(syncDroneMarker);
  }

  // ------------------------------------------------------------------ detail
  async function select(id, opts) {
    const prev = state.selectedId;
    state.selectedId = id;
    if (prev && state.incidents.get(prev)) syncIncidentMarker(state.incidents.get(prev));
    const inc = state.incidents.get(id);
    if (inc) {
      syncIncidentMarker(inc);
      if (!opts || !opts.noPan) map.setView([inc.lat, inc.lng], Math.max(map.getZoom(), 14), { animate: true });
      loadHazards(inc.lat, inc.lng);
    }
    renderQueue();
    await refreshDetail();
  }

  async function refreshDetail() {
    const id = state.selectedId;
    if (!id) { $('detailBody').hidden = true; $('detailEmpty').hidden = false; return; }
    try {
      const detail = await api('/api/incidents/' + id);
      if (state.selectedId !== id) return;
      state.selectedDetail = detail;
      const { events, ...inc } = detail; // eslint-disable-line no-unused-vars
      state.incidents.set(id, Object.assign(state.incidents.get(id) || {}, inc));
      renderDetail();
    } catch (e) {
      toast('Could not load incident: ' + e.message, true);
    }
  }

  function droneCardInner(drone) {
    return '<h3>Drone</h3><div class="drone-info"><b>' + esc(drone.name) + '</b><span class="status-pill st-dispatched">' + esc(drone.status.replace('_', ' ')) + '</span>' +
      '<span class="mono">' + (drone.status === 'en_route' ? 'ETA ' + fmtEta(drone.etaSeconds) : '') + '</span>' +
      '<span class="battery" title="Battery ' + Math.round(drone.batteryPct) + '%"><i style="width:' + Math.max(0, Math.min(100, drone.batteryPct)) + '%"></i></span>' +
      '<span class="mono muted">' + Math.round(drone.batteryPct) + '%</span></div>';
  }

  function renderDetail() {
    const d = state.selectedDetail;
    if (!d) return;
    const inc = Object.assign({}, d, state.incidents.get(d.id));
    const events = d.events || [];
    const body = $('detailBody');
    const drone = inc.droneId ? state.drones.get(inc.droneId) : null;
    const closed = CLOSED.indexOf(inc.status) >= 0;
    const t = inc.triage || {};
    const imp = inc.impactScore;
    const med = inc.medicalSnapshot;
    const withheld = events.some((e) => e.type === 'medical_withheld');
    const etaInputVal = inc.responderEtaMinutes != null ? inc.responderEtaMinutes : 8;
    const phone = inc.user && inc.user.phone;

    let medHtml;
    if (med) {
      const a = age(med.dateOfBirth);
      const facts = [a != null ? a + ' yrs' : null, med.dateOfBirth ? 'DOB ' + esc(med.dateOfBirth) : null,
        med.heightCm ? esc(med.heightCm) + ' cm' : null, med.weightKg ? esc(med.weightKg) + ' kg' : null,
        med.organDonor ? 'Organ donor' : null].filter(Boolean);
      const chips = (arr, cls) => (arr && arr.length ? '<div class="chips">' + arr.map((x) => '<span class="chip ' + cls + '">' + esc(x) + '</span>').join('') + '</div>' : '<div class="none">None reported</div>');
      medHtml = '<div class="med-top"><div class="blood"><b>' + esc(med.bloodType || '?') + '</b><span>Blood type</span></div>' +
        '<div class="med-facts">' + (facts.length ? facts.map((f) => '<div>' + f + '</div>').join('') : '<div class="none">No personal details</div>') + '</div></div>' +
        '<div class="med-label">Allergies</div>' + chips(med.allergies, 'chip-allergy') +
        '<div class="med-label">Conditions</div>' + chips(med.conditions, 'chip-cond') +
        '<div class="med-label">Medications</div>' +
        (med.medications && med.medications.length
          ? '<ul class="meds">' + med.medications.map((m) => '<li><b>' + esc(m.name) + '</b>' + (m.dosage ? ' ' + esc(m.dosage) : '') + (m.frequency ? ' <small>(' + esc(m.frequency) + ')</small>' : '') + '</li>').join('') + '</ul>'
          : '<div class="none">None reported</div>') +
        (med.notes ? '<div class="med-label">Notes</div><div>' + esc(med.notes) + '</div>' : '');
    } else {
      medHtml = '<div class="withheld">' + (withheld ? 'Medical ID withheld by user consent.' : 'No medical ID on file for this user.') + '</div>';
    }

    const contacts = inc.contactsSnapshot || [];
    const contactsHtml = contacts.length
      ? contacts.map((c) => '<div class="contact"><div><b>' + esc(c.name) + '</b>' + (c.isPrimary ? '<span class="primary-tag">PRIMARY</span>' : '') +
        '<small>' + esc(c.relation || 'Contact') + ' · ' + esc(c.phone) + '</small></div>' +
        '<a class="btn btn-ghost btn-sm" href="' + esc(telHref(c.phone)) + '">' + ICONS.phone + 'Call</a></div>').join('')
      : '<div class="none">No emergency contacts</div>';

    const impHtml = imp
      ? '<div class="kv"><div><b>' + (imp.score != null ? Math.round(imp.score * 100) + '%' : '--') + '</b><span>Impact score</span></div>' +
        '<div><b>' + (imp.peakG != null ? Number(imp.peakG).toFixed(1) + 'g' : '--') + '</b><span>Peak force</span></div>' +
        '<div><b style="font-size:12px">' + esc((imp.classification || 'n/a').replace('_', ' ')) + '</b><span>Type</span></div></div>'
      : '';

    const droneHtml = drone ? '<div class="card" id="droneCard">' + droneCardInner(drone) + '</div>' : '';

    const timeline = events.map((e) => '<li style="--ev:' + (EVENT_COLOR[e.type] || '#768194') + '"><time>' + clockTime(e.createdAt) + '</time>' + esc(e.message) + '</li>').join('');

    body.innerHTML =
      '<div class="d-head sev-' + esc(inc.severity) + '">' +
        '<div class="d-head-row"><span class="badge">' + esc(inc.severity) + '</span><span class="status-pill st-' + esc(inc.status) + '">' + esc(inc.status) + '</span>' +
        '<span class="d-meta">' + esc(TRIGGER_LABEL[inc.trigger] || inc.trigger) + ' · ' + timeAgo(inc.createdAt) + '</span></div>' +
        '<h2 class="d-name">' + esc((inc.user && inc.user.name) || 'Unknown user') + '</h2>' +
        (phone ? '<a class="d-phone" href="' + esc(telHref(phone)) + '">' + ICONS.phone + esc(phone) + '</a>' : '<span class="d-meta">No phone on file</span>') +
        '<div class="d-meta mono">' + inc.lat.toFixed(5) + ', ' + inc.lng.toFixed(5) + (inc.accuracy != null ? ' ±' + Math.round(inc.accuracy) + 'm' : '') +
        (inc.responderEtaMinutes != null ? ' · Responder ETA ' + esc(inc.responderEtaMinutes) + ' min' : '') + '</div>' +
      '</div>' +
      (inc.note ? '<div class="card"><h3>User note</h3><p>' + esc(inc.note) + '</p></div>' : '') +
      '<div class="card"><h3>AI triage <span class="src">' + esc(t.source || '') + (t.confidence != null ? ' · ' + Math.round(t.confidence * 100) + '% conf' : '') + '</span></h3>' +
        '<p>' + esc(t.summary || 'No triage available') + '</p>' +
        (t.recommendedActions && t.recommendedActions.length ? '<ol class="actions-list">' + t.recommendedActions.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ol>' : '') +
        (impHtml ? '<div style="margin-top:10px">' + impHtml + '</div>' : '') +
      '</div>' +
      droneHtml +
      '<div class="card medical"><h3>Medical ID</h3>' + medHtml + '</div>' +
      '<div class="card"><h3>Emergency contacts</h3>' + contactsHtml + '</div>' +
      '<div class="card"><h3>Timeline</h3><ul class="timeline">' + timeline + '</ul></div>' +
      '<div class="action-bar">' +
        '<div class="ack-row"><input id="etaInput" class="eta-input" type="number" min="0" max="600" step="1" value="' + esc(etaInputVal) + '" aria-label="ETA minutes" title="ETA (minutes)"' + (closed ? ' disabled' : '') + '>' +
        '<button id="ackBtn" class="btn btn-primary"' + (closed ? ' disabled' : '') + '>' + ICONS.check + (inc.responderEtaMinutes != null ? 'Update ETA' : 'Acknowledge') + '</button></div>' +
        '<div class="row-2"><button id="droneBtn" class="btn"' + (closed || (drone && drone.status !== 'idle' && drone.incidentId === inc.id) ? ' disabled' : '') + '>' + ICONS.drone + 'Dispatch drone</button>' +
        '<button id="resolveBtn" class="btn btn-success"' + (closed ? ' disabled' : '') + '>' + ICONS.shield + 'Resolve</button></div>' +
      '</div>';

    $('detailEmpty').hidden = true;
    body.hidden = false;
    $('ackBtn').addEventListener('click', onAck);
    $('droneBtn').addEventListener('click', onDrone);
    $('resolveBtn').addEventListener('click', onResolve);
  }

  async function withBusy(btn, fn) {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message, true); btn.disabled = false; }
  }
  function onAck(e) {
    const eta = parseInt($('etaInput').value, 10);
    if (!Number.isFinite(eta) || eta < 0) { toast('Enter a valid ETA in minutes', true); return; }
    withBusy(e.currentTarget, async () => {
      const inc = await api('/api/incidents/' + state.selectedId + '/ack', { method: 'POST', body: { etaMinutes: eta } });
      upsertIncident(inc);
      toast('Acknowledged · ETA ' + eta + ' min');
      await refreshDetail();
    });
  }
  function onDrone(e) {
    withBusy(e.currentTarget, async () => {
      const drone = await api('/api/incidents/' + state.selectedId + '/drone', { method: 'POST' });
      upsertDrone(drone);
      toast(drone.name + ' dispatched · ETA ' + fmtEta(drone.etaSeconds));
      await refreshDetail();
    });
  }
  function onResolve(e) {
    if (!window.confirm('Mark this incident as resolved?')) return;
    withBusy(e.currentTarget, async () => {
      const inc = await api('/api/incidents/' + state.selectedId + '/resolve', { method: 'POST' });
      upsertIncident(inc);
      toast('Incident resolved');
      await refreshDetail();
    });
  }

  // ------------------------------------------------------------------ data sync
  function upsertIncident(inc) {
    const prev = state.incidents.get(inc.id);
    state.incidents.set(inc.id, Object.assign(prev || {}, inc));
    syncIncidentMarker(state.incidents.get(inc.id));
    renderQueue();
    renderStats();
  }
  function upsertDrone(d) {
    state.drones.set(d.id, d);
    syncDroneMarker(d);
    renderStats();
    if (state.selectedDetail && state.selectedDetail.droneId === d.id) renderDetailDroneOnly();
  }
  function renderDetailDroneOnly() {
    const d = state.selectedDetail;
    if (!d) return;
    const drone = d.droneId && state.drones.get(d.droneId);
    const card = $('droneCard');
    if (drone && card) card.innerHTML = droneCardInner(drone);
    else if (drone && !card) renderDetail();
  }

  async function loadInitial() {
    const [incs, drones] = await Promise.all([api('/api/incidents?limit=200'), api('/api/drones')]);
    state.incidents.clear();
    incs.forEach((i) => state.incidents.set(i.id, i));
    drones.forEach((d) => state.drones.set(d.id, d));
    renderAll();
    fitAll();
    const c = map.getCenter();
    loadHazards(c.lat, c.lng);
  }

  function connectSocket() {
    if (state.socket) state.socket.disconnect();
    if (typeof io !== 'function') { setConn(false, 'No realtime'); return; }
    const s = io(API, { auth: { token: state.token }, transports: ['websocket', 'polling'] });
    state.socket = s;
    s.on('connect', () => setConn(true));
    s.on('disconnect', (reason) => {
      setConn(false);
      // the server drops sockets when sessions are revoked (sign-out-all / password change):
      // re-check the session — api() signs out on 401, otherwise reconnect
      if (reason === 'io server disconnect' && state.socket === s) {
        api('/api/me').then(() => { if (state.socket === s) s.connect(); }).catch(() => {});
      }
    });
    s.on('connect_error', (err) => {
      setConn(false);
      if (err && err.message === 'unauthorized') logout('Session expired, please sign in again.');
    });
    s.io.on('reconnect', () => loadInitial().catch(() => {}));
    s.on('incident:new', (inc) => {
      state.fresh.add(inc.id);
      upsertIncident(inc);
      beep(inc.severity === 'critical');
      flashHeader();
      toast('New ' + inc.severity.toUpperCase() + ' incident: ' + ((inc.user && inc.user.name) || 'user') + ' · ' + (TRIGGER_LABEL[inc.trigger] || inc.trigger));
      if (!state.selectedId) select(inc.id);
    });
    s.on('incident:updated', (inc) => {
      upsertIncident(inc);
      if (inc.id === state.selectedId) refreshDetail();
    });
    s.on('incident:location', (p) => {
      const inc = state.incidents.get(p.incidentId);
      if (!inc) return;
      inc.lat = p.lat; inc.lng = p.lng;
      syncIncidentMarker(inc);
      state.drones.forEach((d) => { if (d.incidentId === inc.id) syncDroneMarker(d); });
      if (inc.id === state.selectedId && state.selectedDetail) { state.selectedDetail.lat = p.lat; state.selectedDetail.lng = p.lng; if (!(document.activeElement && document.activeElement.id === 'etaInput')) renderDetail(); }
    });
    s.on('drone:update', upsertDrone);
    s.on('hazard:new', (h) => {
      state.hazards.set(h.id, h);
      renderHazards();
      toast('Hazard reported: ' + h.title);
    });
  }
  function setConn(on, label) {
    const el = $('conn');
    el.className = 'conn ' + (on ? 'conn-on' : 'conn-off');
    el.querySelector('span').textContent = label || (on ? 'Live' : 'Offline');
  }

  // ------------------------------------------------------------------ auth flow
  function setMfaStep(on) {
    if (!on) state.mfaToken = null;
    $('credStep').hidden = on;
    $('mfaStep').hidden = !on;
    $('mfaBackBtn').hidden = !on;
    $('loginHint').hidden = on;
    $('loginBtn').textContent = on ? 'Verify' : 'Sign in';
    $('mfaCode').value = '';
    setTimeout(() => (on ? $('mfaCode') : $('loginEmail')).focus(), 0);
  }
  function showLogin(msg) {
    $('app').hidden = true;
    $('login').hidden = false;
    closeSecurityMenu();
    closeModal();
    setMfaStep(false);
    $('loginError').textContent = msg || '';
    $('loginPassword').value = '';
  }
  async function showApp() {
    $('login').hidden = true;
    $('app').hidden = false;
    $('whoami').textContent = state.me.name;
    renderSecurityMenu();
    initMap();
    setTimeout(() => map.invalidateSize(), 0);
    renderSoundBtn();
    connectSocket();
    await loadInitial();
  }
  function logout(msg) {
    safeSet(TOKEN_KEY, null);
    state.token = null;
    state.me = null;
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    showLogin(msg);
  }

  async function onLogin(e) {
    e.preventDefault();
    ensureAudio(); // user gesture unlocks WebAudio
    const btn = $('loginBtn');
    const mfaStep = !!state.mfaToken;
    let body;
    if (mfaStep) {
      const code = $('mfaCode').value.trim();
      if (!code) { $('loginError').textContent = 'Enter the code from your authenticator app.'; return; }
      body = { mfaToken: state.mfaToken, code: normalizeCode(code) };
    } else {
      const email = $('loginEmail').value.trim();
      const password = $('loginPassword').value;
      if (!email || !password) { $('loginError').textContent = 'Enter email and password.'; return; }
      body = { email, password };
    }
    btn.disabled = true;
    btn.textContent = mfaStep ? 'Verifying…' : 'Signing in…';
    $('loginError').textContent = '';
    try {
      const res = await api(mfaStep ? '/api/auth/mfa/verify' : '/api/auth/login', { method: 'POST', body });
      if (res.mfaRequired) {
        state.mfaToken = res.mfaToken;
        $('loginPassword').value = '';
        setMfaStep(true);
        return;
      }
      if (res.user.role !== 'responder') { setMfaStep(false); throw new Error('This account is not a responder account.'); }
      state.mfaToken = null;
      state.token = res.token;
      state.me = res.user;
      safeSet(TOKEN_KEY, res.token);
      await showApp();
    } catch (err) {
      $('loginError').textContent = err.message;
      if (mfaStep && /expired|sign in again/i.test(err.message)) setMfaStep(false);
      else if (mfaStep) $('mfaCode').select();
    } finally {
      btn.disabled = false;
      btn.textContent = state.mfaToken ? 'Verify' : 'Sign in';
    }
  }

  // ------------------------------------------------------------------ security (MFA + sessions)
  /** "123 456" → "123456"; recovery codes (letters) pass through for the server to normalise. */
  function normalizeCode(raw) {
    const s = String(raw || '').trim();
    return /^[\d\s]+$/.test(s) ? s.replace(/\s/g, '') : s;
  }
  function renderSecurityMenu() {
    if (!state.me) return;
    const on = !!state.me.mfaEnabled;
    $('mfaStatus').innerHTML = 'Two-factor: ' + (on ? '<b>On</b>' : '<b class="off">Off</b>');
    $('mfaToggleBtn').textContent = on ? 'Turn off two-factor authentication' : 'Enable two-factor authentication';
  }
  function openSecurityMenu() {
    renderSecurityMenu();
    $('securityMenu').hidden = false;
    $('securityBtn').setAttribute('aria-expanded', 'true');
  }
  function closeSecurityMenu() {
    $('securityMenu').hidden = true;
    $('securityBtn').setAttribute('aria-expanded', 'false');
  }
  function openModal(title, html) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modal').hidden = false;
    const first = $('modalBody').querySelector('input, .btn-primary, .btn-danger');
    if (first) setTimeout(() => first.focus(), 0);
  }
  function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; }

  // QR rendering is lazy-loaded only when enrolling; pinned version + SRI.
  const QR_SRC = 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js';
  const QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
  let qrLoading = null;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = QR_SRC;
        s.integrity = QR_SRI;
        s.crossOrigin = 'anonymous';
        s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('QR library missing')));
        s.onerror = () => { qrLoading = null; reject(new Error('Could not load QR library')); };
        document.head.appendChild(s);
      });
    }
    return qrLoading;
  }

  async function startMfaEnrolment() {
    closeSecurityMenu();
    let setup;
    try {
      setup = await api('/api/auth/mfa/setup', { method: 'POST' });
    } catch (err) { toast(err.message, true); return; }
    openModal('Enable two-factor authentication',
      '<p>1. Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy…).</p>' +
      '<div class="qr-box" id="qrBox"><span style="color:#555">Loading QR…</span></div>' +
      '<p>Can’t scan? Enter this key manually:</p>' +
      '<div class="secret" id="mfaSecret">' + esc(setup.secret.replace(/(.{4})/g, '$1 ').trim()) + '</div>' +
      '<form id="mfaEnableForm"><label>2. Enter the 6-digit code it shows' +
      '<input id="mfaEnableCode" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456"></label>' +
      '<div class="form-error" id="mfaEnableErr" role="alert"></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn-primary" id="mfaEnableBtn">Enable</button></div></form>');
    loadQrLib().then((qrcode) => {
      const qr = qrcode(0, 'M');
      qr.addData(setup.otpauthUrl);
      qr.make();
      const box = $('qrBox');
      if (box) box.innerHTML = '<img alt="QR code for your authenticator app" src="' + qr.createDataURL(6, 2) + '">';
    }).catch(() => {
      const box = $('qrBox');
      if (box) box.innerHTML = '<span style="color:#555">QR unavailable. Use the key below.</span>';
    });
    $('mfaEnableForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeCode($('mfaEnableCode').value);
      if (!/^\d{6}$/.test(code)) { $('mfaEnableErr').textContent = 'Enter the 6-digit code.'; return; }
      $('mfaEnableBtn').disabled = true;
      try {
        const res = await api('/api/auth/mfa/enable', { method: 'POST', body: { code } });
        state.me.mfaEnabled = true;
        renderSecurityMenu();
        showRecoveryCodes(res.recoveryCodes);
      } catch (err) {
        $('mfaEnableErr').textContent = err.message;
        $('mfaEnableBtn').disabled = false;
      }
    });
  }

  function showRecoveryCodes(codes) {
    openModal('Save your recovery codes',
      '<p>Two-factor authentication is <b style="color:var(--green)">on</b>. Each code below signs you in once if you lose your phone.</p>' +
      '<p class="warn-note">They are shown <b>only this once</b>. Store them somewhere safe, such as a password manager.</p>' +
      '<div class="recovery-grid">' + codes.map((c) => '<code>' + esc(c) + '</code>').join('') + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="copyCodesBtn">Copy</button>' +
      '<button type="button" class="btn btn-primary" data-close>I saved them</button></div>');
    $('copyCodesBtn').addEventListener('click', () => {
      const text = codes.join('\n');
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')))
        .then(() => toast('Recovery codes copied'), () => toast('Copy failed, please write them down', true));
    });
  }

  function startMfaDisable() {
    closeSecurityMenu();
    openModal('Turn off two-factor authentication',
      '<p>Enter a current code from your authenticator app, or one of your recovery codes.</p>' +
      '<form id="mfaDisableForm"><label>Code<input id="mfaDisableCode" class="code-input" autocomplete="one-time-code" maxlength="11" placeholder="123456"></label>' +
      '<div class="form-error" id="mfaDisableErr" role="alert"></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn-danger" id="mfaDisableBtn">Turn off</button></div></form>');
    $('mfaDisableForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = normalizeCode($('mfaDisableCode').value);
      if (!code) { $('mfaDisableErr').textContent = 'Enter a code.'; return; }
      $('mfaDisableBtn').disabled = true;
      try {
        await api('/api/auth/mfa/disable', { method: 'POST', body: { code } });
        state.me.mfaEnabled = false;
        renderSecurityMenu();
        closeModal();
        toast('Two-factor authentication turned off');
      } catch (err) {
        $('mfaDisableErr').textContent = err.message;
        $('mfaDisableBtn').disabled = false;
      }
    });
  }

  function confirmLogoutAll() {
    closeSecurityMenu();
    openModal('Sign out all sessions',
      '<p>This signs out every device and browser using this account, including this one. You will need to sign in again.</p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
      '<button type="button" class="btn btn-danger" id="logoutAllConfirm">Sign out everywhere</button></div>');
    $('logoutAllConfirm').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      // detach our socket first so the server-side disconnect is not reported as "session expired"
      if (state.socket) { const s = state.socket; state.socket = null; s.disconnect(); }
      try {
        await api('/api/auth/logout-all', { method: 'POST' });
        closeModal();
        logout('All sessions were signed out.');
      } catch (err) {
        toast(err.message, true);
        b.disabled = false;
        if (state.token) connectSocket();
      }
    });
  }

  async function boot() {
    $('loginForm').addEventListener('submit', onLogin);
    $('logoutBtn').addEventListener('click', () => logout());
    $('mfaBackBtn').addEventListener('click', () => { setMfaStep(false); $('loginError').textContent = ''; });
    $('securityBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if ($('securityMenu').hidden) openSecurityMenu(); else closeSecurityMenu();
    });
    $('mfaToggleBtn').addEventListener('click', () => (state.me && state.me.mfaEnabled ? startMfaDisable() : startMfaEnrolment()));
    $('logoutAllBtn').addEventListener('click', confirmLogoutAll);
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeSecurityMenu(); });
    $('modalClose').addEventListener('click', closeModal);
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal') || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('modal').hidden) closeModal();
      closeSecurityMenu();
    });
    $('soundBtn').addEventListener('click', () => {
      state.sound = !state.sound;
      safeSet(SOUND_KEY, state.sound ? 'on' : 'off');
      renderSoundBtn();
      if (state.sound) beep(false);
    });
    $('fitBtn').addEventListener('click', fitAll);
    $('hazardBtn').addEventListener('click', (e) => {
      state.showHazards = !state.showHazards;
      e.currentTarget.setAttribute('aria-pressed', String(state.showHazards));
      renderHazards();
    });
    document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      state.filter = b.dataset.filter;
      renderAll();
    }));
    const ql = $('queueList');
    ql.addEventListener('click', (e) => { const li = e.target.closest('.q-item'); if (li) select(li.dataset.id); });
    ql.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const li = e.target.closest('.q-item');
      if (li) { e.preventDefault(); select(li.dataset.id); }
    });
    document.addEventListener('pointerdown', ensureAudio, { once: true });

    // clock + relative times
    setInterval(() => {
      $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
      document.querySelectorAll('.q-time[data-ts]').forEach((el) => { el.textContent = timeAgo(el.dataset.ts); });
    }, 1000);

    if (!state.token) { showLogin(); return; }
    try {
      state.me = await api('/api/me');
      if (state.me.role !== 'responder') { logout('This account is not a responder account.'); return; }
      await showApp();
    } catch (e) {
      if (state.token) showLogin('Could not reach the server: ' + e.message);
    }
  }

  // expose for debugging in console
  window.ResQMeConsole = { state, distKm };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
