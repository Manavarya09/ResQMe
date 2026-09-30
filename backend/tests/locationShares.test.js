'use strict';
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(async (p) => actual.rulesTriage(p)) };
});

const http = require('http');
const crypto = require('crypto');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const db = require('../src/db');
const realtime = require('../src/services/realtime');
const shares = require('../src/services/locationShares');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');

const app = createApp();

const MEDICAL = {
  bloodType: 'AB-', allergies: ['Peanuts'], conditions: ['Epilepsy'],
  medications: [{ name: 'Levetiracetam', dosage: '500 mg' }], organDonor: true, notes: 'Secret medical note',
};

let owner;
let other;

async function createShare(token = owner.token, body = {}) {
  const res = await request(app).post('/api/location-shares').set(auth(token))
    .send({ lat: 19.076, lng: 72.8777, accuracy: 12, ...body });
  if (res.status !== 201) throw new Error(`share create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

beforeAll(async () => {
  await resetDb();
  owner = await registerUser(app, { name: 'Priya Sharma Kapoor', phone: '+91 99999 12345' });
  other = await registerUser(app);
  await request(app).put('/api/medical-id').set(auth(owner.token)).send(MEDICAL);
  await request(app).post('/api/contacts').set(auth(owner.token)).send({ name: 'Mum', phone: '+91 98888 77777', relation: 'Mother' });
});

afterAll(async () => {
  await realtime.close();
  await db.close();
});

describe('location shares – owner API', () => {
  test('requires auth', async () => {
    expect((await request(app).post('/api/location-shares').send({})).status).toBe(401);
    expect((await request(app).get('/api/location-shares')).status).toBe(401);
  });

  test('create returns token + urls; DB stores only the sha256 hash of a 32-byte token', async () => {
    const res = await request(app).post('/api/location-shares').set(auth(owner.token)).send({ lat: 19.07, lng: 72.87 });
    expect(res.status).toBe(201);
    const { id, token, url, absoluteUrl, expiresAt } = res.body;
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(url).toBe(`/t/${token}`);
    expect(absoluteUrl).toMatch(new RegExp(`^https?://[^/]+/t/${token}$`));
    // default 60 minutes
    const ttl = new Date(expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60e3);
    expect(ttl).toBeLessThanOrEqual(60 * 60e3);

    const { rows } = await db.query('SELECT * FROM location_shares WHERE id = $1', [id]);
    expect(rows[0].token_hash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(rows[0])).not.toContain(token);
  });

  test('validates duration bounds and lat/lng', async () => {
    const bad = [{ durationMinutes: 5 }, { durationMinutes: 1441 }, { durationMinutes: 30.5 }, { lat: 91, lng: 0 }, { lat: 10 }];
    for (const body of bad) {
      const res = await request(app).post('/api/location-shares').set(auth(owner.token)).send(body);
      expect(res.status).toBe(400);
    }
    const ok = await request(app).post('/api/location-shares').set(auth(owner.token)).send({ durationMinutes: 1440 });
    expect(ok.status).toBe(201);
  });

  test('incidentId must belong to the caller', async () => {
    const inc = await request(app).post('/api/incidents').set(auth(other.token)).send({ trigger: 'sos', lat: 1, lng: 1 });
    const res = await request(app).post('/api/location-shares').set(auth(owner.token)).send({ incidentId: inc.body.id });
    expect(res.status).toBe(404);
    const junk = await request(app).post('/api/location-shares').set(auth(owner.token)).send({ incidentId: 'nope' });
    expect(junk.status).toBe(400);
  });

  test('owner can push location; other users cannot', async () => {
    const s = await createShare();
    const upd = await request(app).post(`/api/location-shares/${s.id}/location`).set(auth(owner.token)).send({ lat: 19.1, lng: 72.9, accuracy: 5 });
    expect(upd.status).toBe(204);
    const pub = await request(app).get(`/api/public/track/${s.token}`);
    expect(pub.body).toMatchObject({ lat: 19.1, lng: 72.9, accuracy: 5 });

    const hijack = await request(app).post(`/api/location-shares/${s.id}/location`).set(auth(other.token)).send({ lat: 0, lng: 0 });
    expect(hijack.status).toBe(404);
    const after = await request(app).get(`/api/public/track/${s.token}`);
    expect(after.body.lat).toBe(19.1);

    expect((await request(app).post(`/api/location-shares/${s.id}/location`).set(auth(owner.token)).send({ lat: 'x', lng: 1 })).status).toBe(400);
    expect((await request(app).post('/api/location-shares/not-a-uuid/location').set(auth(owner.token)).send({ lat: 1, lng: 1 })).status).toBe(404);
    expect((await request(app).delete(`/api/location-shares/${s.id}`).set(auth(other.token))).status).toBe(404);
  });

  test('list returns only my active shares; revoke removes it, blocks updates and is audited', async () => {
    const s = await createShare();
    const mine = await request(app).get('/api/location-shares').set(auth(owner.token));
    expect(mine.body.map((x) => x.id)).toContain(s.id);
    expect(JSON.stringify(mine.body)).not.toContain(s.token);
    const theirs = await request(app).get('/api/location-shares').set(auth(other.token));
    expect(theirs.body.map((x) => x.id)).not.toContain(s.id);

    expect((await request(app).delete(`/api/location-shares/${s.id}`).set(auth(owner.token))).status).toBe(204);
    expect((await request(app).delete(`/api/location-shares/${s.id}`).set(auth(owner.token))).status).toBe(204); // idempotent
    const after = await request(app).get('/api/location-shares').set(auth(owner.token));
    expect(after.body.map((x) => x.id)).not.toContain(s.id);

    expect((await request(app).get(`/api/public/track/${s.token}`)).status).toBe(410);
    expect((await request(app).get(`/t/${s.token}`)).status).toBe(410);
    expect((await request(app).post(`/api/location-shares/${s.id}/location`).set(auth(owner.token)).send({ lat: 1, lng: 1 })).status).toBe(410);

    const { rows } = await db.query(
      "SELECT action, meta FROM audit_log WHERE user_id = $1 AND action LIKE 'location_share_%' AND meta->>'shareId' = $2 ORDER BY created_at",
      [owner.user.id, s.id]
    );
    expect(rows.map((r) => r.action)).toEqual(['location_share_created', 'location_share_revoked']);
    expect(JSON.stringify(rows)).not.toContain(s.token);
  });
});

describe('location shares – public', () => {
  test('unknown / malformed tokens → 404', async () => {
    expect((await request(app).get(`/api/public/track/${crypto.randomBytes(32).toString('base64url')}`)).status).toBe(404);
    expect((await request(app).get('/api/public/track/short')).status).toBe(404);
    expect((await request(app).get('/t/%3Cscript%3E')).status).toBe(404);
  });

  test('expired share → 410 (JSON and page)', async () => {
    const s = await createShare();
    await db.query("UPDATE location_shares SET expires_at = now() - interval '1 second' WHERE id = $1", [s.id]);
    const res = await request(app).get(`/api/public/track/${s.token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/ended/i);
    const page = await request(app).get(`/t/${s.token}`);
    expect(page.status).toBe(410);
    expect(page.text).toMatch(/Sharing has ended/);
  });

  test('public payload is minimal and never leaks email, phone, medical or contacts', async () => {
    const s = await createShare();
    const res = await request(app).get(`/api/public/track/${s.token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(['accuracy', 'active', 'expiresAt', 'incident', 'lat', 'lng', 'name', 'updatedAt']);
    expect(res.body).toMatchObject({ name: 'Priya', lat: 19.076, lng: 72.8777, accuracy: 12, active: true, incident: null });
    const blob = JSON.stringify(res.body);
    for (const secret of [owner.user.email, '99999', 'Sharma', 'AB-', 'Peanuts', 'Epilepsy', 'Levetiracetam', 'Secret', 'Mum', '98888', owner.user.id]) {
      expect(blob).not.toContain(secret);
    }

    const page = await request(app).get(`/t/${s.token}`);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/html/);
    expect(page.text).toContain('Priya is sharing their location');
    expect(page.text).toContain('/share-assets/track.js');
    for (const secret of [owner.user.email, '99999', 'Sharma', 'Peanuts', 'Epilepsy', 'Mum']) {
      expect(page.text).not.toContain(secret);
    }
    // no inline executable script: CSP stays script-src 'self' + unpkg
    expect(page.text).not.toMatch(/<script>(?!<)/);
    expect(page.headers['content-security-policy']).toMatch(/script-src 'self' https:\/\/unpkg\.com/);
  });

  test('names are escaped in the page', async () => {
    const u = await registerUser(app, { name: '<img src=x onerror=alert(1)> Evil' });
    const s = await createShare(u.token);
    const page = await request(app).get(`/t/${s.token}`);
    expect(page.text).not.toContain('<img src=x');
    expect(page.text).toContain('&lt;img');
  });

  test('linked incident exposes only status/trigger/severity', async () => {
    const inc = await request(app).post('/api/incidents').set(auth(owner.token))
      .send({ trigger: 'sos', lat: 19.07, lng: 72.87, note: 'private note about chest pain' });
    expect(inc.status).toBe(201);
    const s = await createShare(owner.token, { incidentId: inc.body.id, durationMinutes: 240 });
    const res = await request(app).get(`/api/public/track/${s.token}`);
    expect(res.body.incident).toEqual({ status: 'open', trigger: 'sos', severity: inc.body.severity });
    expect(JSON.stringify(res.body)).not.toMatch(/chest pain|private note|triage/);

    await request(app).post(`/api/incidents/${inc.body.id}/cancel`).set(auth(owner.token));
    const after = await request(app).get(`/api/public/track/${s.token}`);
    expect(after.body.incident.status).toBe('cancelled');
  });

  test('track.js asset is served', async () => {
    const res = await request(app).get('/share-assets/track.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('/api/public/track/');
  });

  test('public endpoints are rate limited', async () => {
    const limited = createApp({ rateLimits: { enabled: true, limits: { publicTrack: 2 } } });
    const s = await createShare();
    expect((await request(limited).get(`/api/public/track/${s.token}`)).status).toBe(200);
    expect((await request(limited).get(`/t/${s.token}`)).status).toBe(200);
    const third = await request(limited).get(`/api/public/track/${s.token}`);
    expect(third.status).toBe(429);
  });
});

describe('location shares – service + realtime', () => {
  test('hashToken is sha256 hex and token shape check rejects junk', () => {
    expect(shares.hashToken('abc')).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
    expect(shares.isTokenShaped('a'.repeat(43))).toBe(true);
    expect(shares.isTokenShaped('../../etc')).toBe(false);
    expect(shares.isTokenShaped(undefined)).toBe(false);
    expect(shares.firstName('  Ana  Maria ')).toBe('Ana');
  });

  test('location updates are pushed to share:<id> watchers', async () => {
    const server = http.createServer(app);
    realtime.init(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const s = await createShare();
    const viewer = ioClient(url, { auth: { token: other.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    try {
      await new Promise((resolve, reject) => { viewer.on('hello', resolve); viewer.on('connect_error', reject); });
      const bad = await viewer.timeout(3000).emitWithAck('share:watch', { token: 'x'.repeat(43) });
      expect(bad).toEqual({ ok: false });
      const ack = await viewer.timeout(3000).emitWithAck('share:watch', { token: s.token });
      expect(ack).toEqual({ ok: true, shareId: s.id });
      const got = new Promise((resolve) => viewer.on('share:location', resolve));
      await request(app).post(`/api/location-shares/${s.id}/location`).set(auth(owner.token)).send({ lat: 12.5, lng: 77.5 });
      expect(await got).toMatchObject({ shareId: s.id, lat: 12.5, lng: 77.5 });
    } finally {
      viewer.close();
      await realtime.close();
      await new Promise((r) => server.close(r));
    }
  });
});
