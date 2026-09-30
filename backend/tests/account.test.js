'use strict';
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(async (p) => actual.rulesTriage(p)) };
});

const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { resetDb, registerUser, createResponder, auth } = require('./helpers');

const app = createApp();
const MEDICAL = { bloodType: 'AB+', allergies: ['Latex'], conditions: ['Asthma'], medications: [], organDonor: false };

let owner;
let responder;
let incidentId;

beforeAll(async () => {
  await resetDb();
  owner = await registerUser(app, { name: 'Audit Owner' });
  responder = await createResponder();
  await request(app).put('/api/medical-id').set(auth(owner.token)).send(MEDICAL).expect(200);
  await request(app).post('/api/contacts').set(auth(owner.token)).send({ name: 'Mum', phone: '+91 1', relation: 'Mother', isPrimary: true }).expect(201);
  const inc = await request(app).post('/api/incidents').set(auth(owner.token)).send({ trigger: 'sos', lat: 28.6, lng: 77.2 }).expect(201);
  incidentId = inc.body.id;
  await request(app).post(`/api/incidents/${incidentId}/ack`).set(auth(responder.token)).send({ etaMinutes: 3 }).expect(200);
  await request(app).post(`/api/incidents/${incidentId}/resolve`).set(auth(responder.token)).expect(200);
  const inc2 = await request(app).post('/api/incidents').set(auth(owner.token)).send({ trigger: 'manual', lat: 28.6, lng: 77.2 }).expect(201);
  await request(app).post(`/api/incidents/${inc2.body.id}/cancel`).set(auth(owner.token)).expect(200);
});
afterAll(() => db.close());

describe('audit log', () => {
  test('records medical updates, incident lifecycle (with responder as actor) and public share views', async () => {
    const share = await request(app).post('/api/medical-id/share-token').set(auth(owner.token));
    await request(app).get(`/api/medical-id/public/${share.body.token}`).set('User-Agent', 'ParamedicTablet/1.0').expect(200);
    await request(app).get(share.body.url).expect(200);

    const res = await request(app).get('/api/me/audit').set(auth(owner.token));
    expect(res.status).toBe(200);
    const byAction = (a) => res.body.filter((e) => e.action === a);
    expect(byAction('medical_id_updated')).toHaveLength(1);
    expect(byAction('incident_created')).toHaveLength(2);
    expect(byAction('incident_cancelled')).toHaveLength(1);
    expect(byAction('incident_acknowledged')[0]).toMatchObject({ actorId: responder.user.id, meta: { incidentId, etaMinutes: 3 } });
    expect(byAction('incident_resolved')[0]).toMatchObject({ actorId: responder.user.id, meta: { incidentId } });

    const views = byAction('medical_share_viewed');
    expect(views).toHaveLength(2);
    views.forEach((v) => {
      expect(v.actorId).toBeNull();
      expect(v.ip).toEqual(expect.any(String));
      expect(JSON.stringify(v)).not.toContain(share.body.token);
    });
    expect(views.map((v) => v.meta.via).sort()).toEqual(['api', 'page']);
    expect(Object.keys(res.body[0]).sort()).toEqual(['action', 'actorId', 'createdAt', 'id', 'ip', 'meta']);
    // never leaks medical content
    expect(JSON.stringify(res.body)).not.toMatch(/Latex|Asthma|AB\+/);
    // newest first
    const times = res.body.map((e) => Date.parse(e.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test('limit is honoured and validated; other users see none of it', async () => {
    const two = await request(app).get('/api/me/audit?limit=2').set(auth(owner.token));
    expect(two.body).toHaveLength(2);
    expect((await request(app).get('/api/me/audit?limit=0').set(auth(owner.token))).status).toBe(400);
    expect((await request(app).get('/api/me/audit?limit=201').set(auth(owner.token))).status).toBe(400);
    const stranger = await registerUser(app);
    const s = await request(app).get('/api/me/audit').set(auth(stranger.token));
    expect(s.body.every((e) => e.action === 'account_created')).toBe(true);
  });

  test('failed and successful logins are audited', async () => {
    await request(app).post('/api/auth/login').send({ email: owner.user.email, password: 'bad-password' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: owner.user.email, password: owner.password }).expect(200);
    const res = await request(app).get('/api/me/audit').set(auth(owner.token));
    expect(res.body.find((e) => e.action === 'login_failed')).toMatchObject({ actorId: null, meta: { reason: 'bad_password' } });
    expect(res.body.find((e) => e.action === 'login_success')).toMatchObject({ actorId: owner.user.id, meta: { mfa: false } });
  });
});

describe('data export', () => {
  test('returns profile, settings, decrypted medical ID, contacts, incidents with events and audit', async () => {
    await request(app).patch('/api/me').set(auth(owner.token)).send({ settings: { locationSharing: true } }).expect(200);
    const res = await request(app).get('/api/me/export').set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body;
    expect(body).toMatchObject({
      format: 'resqme-export/v1',
      exportedAt: expect.any(String),
      profile: { id: owner.user.id, name: 'Audit Owner', email: owner.user.email, mfaEnabled: false },
      settings: { locationSharing: true },
      security: { mfaEnabled: false, recoveryCodes: { total: 0, unused: 0 } },
      medicalId: expect.objectContaining({ bloodType: 'AB+', allergies: ['Latex'] }),
      contacts: [expect.objectContaining({ name: 'Mum' })],
    });
    expect(body.incidents).toHaveLength(2);
    const inc = body.incidents.find((i) => i.id === incidentId);
    expect(inc.status).toBe('resolved');
    expect(inc.events.map((e) => e.type)).toEqual(expect.arrayContaining(['created', 'triaged', 'acknowledged', 'resolved']));
    expect(body.medicalShareLinks.length).toBeGreaterThanOrEqual(1);
    expect(body.medicalShareLinks[0]).toEqual({ createdAt: expect.any(String), expiresAt: expect.any(String) });
    expect(body.audit.length).toBeGreaterThan(5);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/password_hash|mfa_secret|\$2[aby]\$/);
  });

  test('requires auth', async () => {
    expect((await request(app).get('/api/me/export')).status).toBe(401);
  });
});

describe('account deletion', () => {
  test('wrong password is rejected; correct password deletes the user and cascades their data', async () => {
    const victim = await registerUser(app);
    await request(app).put('/api/medical-id').set(auth(victim.token)).send(MEDICAL).expect(200);
    await request(app).post('/api/contacts').set(auth(victim.token)).send({ name: 'X', phone: '+91 3' }).expect(201);
    const inc = await request(app).post('/api/incidents').set(auth(victim.token)).send({ trigger: 'sos', lat: 28.6, lng: 77.2 }).expect(201);
    await request(app).post(`/api/incidents/${inc.body.id}/drone`).set(auth(responder.token)).expect(200);
    await request(app).post('/api/medical-id/share-token').set(auth(victim.token)).expect(200);

    expect((await request(app).delete('/api/me').set(auth(victim.token)).send({})).status).toBe(400);
    const bad = await request(app).delete('/api/me').set(auth(victim.token)).send({ password: 'not-it-at-all' });
    expect(bad.status).toBe(400);

    const res = await request(app).delete('/api/me').set(auth(victim.token)).send({ password: victim.password });
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/me').set(auth(victim.token))).status).toBe(401);

    const id = victim.user.id;
    for (const [table, col] of [['users', 'id'], ['medical_ids', 'user_id'], ['contacts', 'user_id'], ['incidents', 'user_id'],
      ['share_tokens', 'user_id'], ['audit_log', 'user_id'], ['audit_log', 'actor_id']]) {
      const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [id]);
      expect({ table, col, n: rows.length }).toEqual({ table, col, n: 0 });
    }
    const { rows: ev } = await db.query('SELECT 1 FROM incident_events WHERE incident_id = $1', [inc.body.id]);
    expect(ev).toHaveLength(0);
    const { rows: dr } = await db.query('SELECT status FROM drones WHERE incident_id = $1', [inc.body.id]);
    expect(dr).toHaveLength(0);
    const { rows: tomb } = await db.query("SELECT * FROM audit_log WHERE action = 'account_deleted' AND meta->>'deletedUserId' = $1", [id]);
    expect(tomb).toHaveLength(1);
    expect(tomb[0].user_id).toBeNull();
    // email is free again
    await request(app).post('/api/auth/register').send({ name: 'Again', email: victim.user.email, password: 'Password123' }).expect(201);
  });
});
