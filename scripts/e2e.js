#!/usr/bin/env node
// End-to-end check of the proposal's road-accident workflow against running services:
// impact → incident with location + medical ID → responder sees it live → ack → drone → resolve.
// Usage: node scripts/e2e.js   (API_URL defaults to http://localhost:4100)
const path = require('path');
const { io } = require(path.join(__dirname, '..', 'backend', 'node_modules', 'socket.io-client'));

const API = process.env.API_URL || 'http://localhost:4100';
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, body, token) {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data)}`);
  return data;
}

async function step(name, fn) {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ ok: true, name, ms: Date.now() - t, detail });
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ ok: false, name, error: e.message });
    console.log(`  ✘ ${name} — ${e.message}`);
    throw e;
  }
}

function waitFor(socket, event, pred = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, h); reject(new Error(`timed out waiting for ${event}`)); }, timeoutMs);
    function h(payload) {
      if (pred(payload)) { clearTimeout(timer); socket.off(event, h); resolve(payload); }
    }
    socket.on(event, h);
  });
}

function fallWindow() {
  const out = [];
  let t = Date.now() - 3000;
  const push = (ms, g) => { for (let i = 0; i < ms / 20; i++) { out.push({ t, ax: 0, ay: 0, az: g, gx: 0.3, gy: 0, gz: 0 }); t += 20; } };
  push(500, 1); push(300, 0.1); push(60, 7.5); push(1500, 1);
  return out;
}

(async () => {
  console.log(`\nResQMe E2E against ${API}\n`);
  const email = `e2e+${Date.now()}@resqme.app`;
  const at = { lat: 28.6315, lng: 77.2167 }; // Connaught Place, New Delhi
  let user, userToken, respToken, incident, userSock, respSock;

  try {
    await step('health (db + ai)', async () => {
      const h = await call('GET', '/health');
      if (!h.ok || !h.db) throw new Error(JSON.stringify(h));
      return `db=${h.db} ai=${h.ai}`;
    });

    await step('register user', async () => {
      const r = await call('POST', '/api/auth/register', { name: 'E2E Rider', email, password: 'Passw0rd!e2e', phone: '+919800000000' });
      user = r.user; userToken = r.token;
      return user.id;
    });

    await step('save encrypted medical ID', async () => {
      const m = await call('PUT', '/api/medical-id', { bloodType: 'B+', allergies: ['Penicillin'], conditions: ['Epilepsy'], medications: [{ name: 'Levetiracetam', dosage: '500mg', frequency: 'BD' }], organDonor: true }, userToken);
      return `${m.bloodType}, ${m.conditions.join(',')}`;
    });

    await step('add emergency contact', async () => {
      const c = await call('POST', '/api/contacts', { name: 'Asha', phone: '+919811111111', relation: 'Family', isPrimary: true }, userToken);
      return `${c.name} primary=${c.isPrimary}`;
    });

    await step('responder login + sockets connect', async () => {
      respToken = (await call('POST', '/api/auth/login', { email: 'responder@resqme.app', password: 'Responder@123' })).token;
      respSock = io(API, { auth: { token: respToken }, transports: ['websocket'] });
      userSock = io(API, { auth: { token: userToken }, transports: ['websocket'] });
      await Promise.all([waitFor(respSock, 'connect'), waitFor(userSock, 'connect')]);
      return 'both connected';
    });

    await step('impact incident → responder receives incident:new', async () => {
      const got = waitFor(respSock, 'incident:new', (i) => i.userId === user.id);
      incident = await call('POST', '/api/incidents', { trigger: 'impact', ...at, accuracy: 8, impact: { peakG: 7.5, freeFallMs: 300, classification: 'fall' }, sensorWindow: fallWindow() }, userToken);
      const live = await got;
      if (!live.medicalSnapshot || live.medicalSnapshot.bloodType !== 'B+') throw new Error('medical snapshot missing');
      return `severity=${incident.severity} triage=${incident.triage?.source} impact=${incident.impactScore?.classification ?? 'n/a'}`;
    });

    await step('live location update reaches responder', async () => {
      const got = waitFor(respSock, 'incident:location', (p) => p.incidentId === incident.id);
      await call('POST', `/api/incidents/${incident.id}/location`, { lat: at.lat + 0.0003, lng: at.lng }, userToken);
      const p = await got;
      return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    });

    await step('user cannot acknowledge (role check)', async () => {
      try {
        await call('POST', `/api/incidents/${incident.id}/ack`, { etaMinutes: 5 }, userToken);
      } catch (e) {
        if (/40[13]/.test(e.message)) return 'rejected';
        throw e;
      }
      throw new Error('user was allowed to ack');
    });

    await step('responder ack → user notified', async () => {
      const got = waitFor(userSock, 'incident:updated', (i) => i.id === incident.id && i.status === 'acknowledged');
      await call('POST', `/api/incidents/${incident.id}/ack`, { etaMinutes: 7 }, respToken);
      const i = await got;
      return `status=${i.status} eta=${i.responderEtaMinutes}m`;
    });

    await step('drone dispatch + movement', async () => {
      const d = await call('POST', `/api/incidents/${incident.id}/drone`, null, respToken);
      const first = await waitFor(userSock, 'drone:update', (x) => x.id === d.id);
      await sleep(2500);
      const list = await call('GET', '/api/drones', null, respToken);
      const now = list.find((x) => x.id === d.id);
      const moved = Math.hypot(now.lat - d.lat, now.lng - d.lng) > 0;
      if (!moved && now.status !== 'on_scene') throw new Error('drone did not move');
      return `${d.name} ${first.status} → ${now.status}, eta ${now.etaSeconds}s`;
    });

    await step('medical share link (QR) works', async () => {
      const s = await call('POST', '/api/medical-id/share-token', null, userToken);
      const pub = await call('GET', `/api/medical-id/public/${s.token}`);
      const page = await fetch(API + `/m/${s.token}`).then((r) => r.text());
      if (!page.includes('B+')) throw new Error('share page missing blood type');
      return `${pub.name} · ${pub.medical.bloodType}`;
    });

    await step('hazards near incident', async () => {
      const hz = await call('GET', `/api/hazards?lat=${at.lat}&lng=${at.lng}&radiusKm=10`, null, userToken);
      return `${hz.length} hazards (${[...new Set(hz.map((h) => h.source))].join(', ')})`;
    });

    await step('AI crisis chat', async () => {
      const r = await call('POST', '/api/chat', { messages: [{ role: 'user', content: 'My friend is having a seizure on the ground' }], incidentId: incident.id, context: { incidentActive: true, country: 'IN' } }, userToken);
      if (!r.reply) throw new Error('empty reply');
      return `source=${r.source} severity=${r.severity} videos=${(r.videoIds || []).join(',')}`;
    });

    await step('responder resolves → user notified, drone returns', async () => {
      const got = waitFor(userSock, 'incident:updated', (i) => i.id === incident.id && i.status === 'resolved');
      await call('POST', `/api/incidents/${incident.id}/resolve`, null, respToken);
      await got;
      const full = await call('GET', `/api/incidents/${incident.id}`, null, userToken);
      return `${full.events.length} timeline events`;
    });
  } catch {
    // step() already logged the failure
  } finally {
    userSock?.close();
    respSock?.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed${failed ? ' — FAILED' : ''}\n`);
  process.exit(failed ? 1 : 0);
})();
