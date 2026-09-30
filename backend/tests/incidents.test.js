'use strict';
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(), scoreMotion: jest.fn(), chat: jest.fn(), health: jest.fn(async () => true) };
});

const request = require('supertest');
const db = require('../src/db');
const ai = require('../src/services/ai');
const { createApp } = require('../src/app');
const { resetDb, registerUser, createResponder, auth } = require('./helpers');

const app = createApp();
let owner;
let other;
let responder;

const LLM_TRIAGE = { severity: 'high', summary: 'Possible assault', recommendedActions: ['Call user', 'Alert police'], confidence: 0.8, source: 'llm' };

beforeAll(async () => {
  await resetDb();
  owner = await registerUser(app, { name: 'Owner', phone: '+91 91111 11111' });
  other = await registerUser(app);
  responder = await createResponder();
  await request(app).put('/api/medical-id').set(auth(owner.token)).send({
    bloodType: 'A+', allergies: ['Sulfa'], conditions: ['Epilepsy'], medications: [], organDonor: false,
  });
  await request(app).post('/api/contacts').set(auth(owner.token)).send({ name: 'Sis', phone: '+91 2', relation: 'Sister', isPrimary: true });
});
afterAll(() => db.close());
beforeEach(() => {
  ai.triage.mockReset().mockResolvedValue(LLM_TRIAGE);
  ai.scoreMotion.mockReset();
  ai.chat.mockReset();
});

const createIncident = (token, body = {}) => request(app).post('/api/incidents').set(auth(token))
  .send({ trigger: 'sos', lat: 28.6139, lng: 77.209, accuracy: 12, note: 'Being followed', ...body });

describe('incident creation', () => {
  test('snapshots medical ID + contacts, calls triage, returns full Incident', async () => {
    const res = await createIncident(owner.token);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String), userId: owner.user.id, trigger: 'sos', status: 'open', severity: 'high',
      lat: 28.6139, lng: 77.209, accuracy: 12, note: 'Being followed',
      triage: LLM_TRIAGE, impactScore: null,
      medicalSnapshot: expect.objectContaining({ bloodType: 'A+', allergies: ['Sulfa'], conditions: ['Epilepsy'] }),
      contactsSnapshot: [expect.objectContaining({ name: 'Sis', phone: '+91 2', relation: 'Sister', isPrimary: true })],
      user: { name: 'Owner', phone: '+91 91111 11111' }, droneId: null, responderEtaMinutes: null,
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(ai.triage).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'sos', note: 'Being followed', medical: expect.objectContaining({ bloodType: 'A+' }),
    }));
    expect(ai.scoreMotion).not.toHaveBeenCalled();
  });

  test('shareMedical=false withholds the medical snapshot and logs an event', async () => {
    const res = await createIncident(owner.token, { shareMedical: false });
    expect(res.status).toBe(201);
    expect(res.body.medicalSnapshot).toBeNull();
    expect(res.body.contactsSnapshot).toHaveLength(1);
    expect(ai.triage.mock.calls[0][0].medical).toBeUndefined();
    const detail = await request(app).get(`/api/incidents/${res.body.id}`).set(auth(owner.token));
    expect(detail.body.events.map((e) => e.type)).toEqual(['created', 'triaged', 'medical_withheld']);
    expect(detail.body.events[2].message).toMatch(/withheld/i);
  });

  test('sensorWindow triggers /motion/score and stores impactScore', async () => {
    ai.scoreMotion.mockResolvedValue({ impactDetected: true, score: 0.92, peakG: 7.1, freeFallMs: 0, stillnessAfter: true, rotationPeak: 3, classification: 'vehicle_crash' });
    ai.triage.mockResolvedValue({ ...LLM_TRIAGE, severity: 'critical' });
    const samples = Array.from({ length: 10 }, (_, i) => ({ t: i * 20, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 }));
    const res = await createIncident(owner.token, { trigger: 'impact', sensorWindow: samples, impact: { peakG: 7.1 } });
    expect(res.status).toBe(201);
    expect(ai.scoreMotion).toHaveBeenCalledWith({ samples });
    expect(res.body.impactScore).toEqual({ impactDetected: true, score: 0.92, peakG: 7.1, classification: 'vehicle_crash' });
    expect(res.body.severity).toBe('critical');
    expect(ai.triage.mock.calls[0][0].impactScore.classification).toBe('vehicle_crash');
  });

  test('validation errors return 400 { error }', async () => {
    const res = await createIncident(owner.token, { trigger: 'alien' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.stringMatching(/trigger/) });
    expect((await createIncident(owner.token, { lat: 200 })).status).toBe(400);
  });

  test('rules fallback is used when the AI service is unreachable', async () => {
    const actual = jest.requireActual('../src/services/ai');
    ai.triage.mockImplementation(actual.triage); // real client → closed port → rules
    const res = await createIncident(owner.token, { trigger: 'impact', note: 'he is unconscious', impact: { peakG: 3 } });
    expect(res.status).toBe(201);
    expect(res.body.triage.source).toBe('rules');
    expect(res.body.severity).toBe('critical');
    expect(res.body.triage.recommendedActions.length).toBeGreaterThan(0);
  });
});

describe('incident listing & access', () => {
  test('user sees only own incidents; responder sees all; newest first; status filter', async () => {
    await createIncident(other.token, { trigger: 'manual', note: null });
    const mine = await request(app).get('/api/incidents').set(auth(owner.token));
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body.every((i) => i.userId === owner.user.id)).toBe(true);
    const all = await request(app).get('/api/incidents').set(auth(responder.token));
    expect(all.body.some((i) => i.userId === other.user.id)).toBe(true);
    expect(all.body.some((i) => i.userId === owner.user.id)).toBe(true);
    const times = all.body.map((i) => new Date(i.createdAt).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    const open = await request(app).get('/api/incidents?status=open').set(auth(responder.token));
    expect(open.body.every((i) => i.status === 'open')).toBe(true);
    expect((await request(app).get('/api/incidents?status=bogus').set(auth(responder.token))).status).toBe(400);
  });

  test('other users cannot read someone else\'s incident', async () => {
    const inc = (await createIncident(owner.token)).body;
    expect((await request(app).get(`/api/incidents/${inc.id}`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).get(`/api/incidents/${inc.id}`).set(auth(responder.token))).status).toBe(200);
    expect((await request(app).get('/api/incidents/not-a-uuid').set(auth(responder.token))).status).toBe(404);
  });
});

describe('incident lifecycle', () => {
  test('ack is responder-only; responder ack sets status + ETA; resolve is responder-only', async () => {
    const inc = (await createIncident(owner.token)).body;

    const userAck = await request(app).post(`/api/incidents/${inc.id}/ack`).set(auth(owner.token)).send({ etaMinutes: 5 });
    expect(userAck.status).toBe(403);

    const bad = await request(app).post(`/api/incidents/${inc.id}/ack`).set(auth(responder.token)).send({});
    expect(bad.status).toBe(400);

    const ack = await request(app).post(`/api/incidents/${inc.id}/ack`).set(auth(responder.token)).send({ etaMinutes: 7 });
    expect(ack.status).toBe(200);
    expect(ack.body).toMatchObject({ id: inc.id, status: 'acknowledged', responderEtaMinutes: 7 });

    const loc = await request(app).post(`/api/incidents/${inc.id}/location`).set(auth(owner.token)).send({ lat: 28.62, lng: 77.21 });
    expect(loc.status).toBe(204);
    expect((await request(app).post(`/api/incidents/${inc.id}/location`).set(auth(responder.token)).send({ lat: 1, lng: 1 })).status).toBe(403);

    expect((await request(app).post(`/api/incidents/${inc.id}/resolve`).set(auth(owner.token))).status).toBe(403);
    const resolved = await request(app).post(`/api/incidents/${inc.id}/resolve`).set(auth(responder.token));
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ status: 'resolved', lat: 28.62, lng: 77.21 });

    const again = await request(app).post(`/api/incidents/${inc.id}/resolve`).set(auth(responder.token));
    expect(again.status).toBe(409);

    const detail = await request(app).get(`/api/incidents/${inc.id}`).set(auth(owner.token));
    expect(detail.body.events.map((e) => e.type)).toEqual(['created', 'triaged', 'acknowledged', 'resolved']);
    expect(detail.body.events[0]).toEqual({
      id: expect.any(String), incidentId: inc.id, type: 'created', message: expect.any(String), data: expect.any(Object), createdAt: expect.any(String),
    });
  });

  test('owner can cancel; non-owner cannot; cancelled incident cannot be acked', async () => {
    const inc = (await createIncident(owner.token)).body;
    expect((await request(app).post(`/api/incidents/${inc.id}/cancel`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).post(`/api/incidents/${inc.id}/cancel`).set(auth(responder.token))).status).toBe(403);
    const cancel = await request(app).post(`/api/incidents/${inc.id}/cancel`).set(auth(owner.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe('cancelled');
    expect((await request(app).post(`/api/incidents/${inc.id}/ack`).set(auth(responder.token)).send({ etaMinutes: 3 })).status).toBe(409);
  });
});

describe('chat proxy', () => {
  test('forwards to AI with incident context', async () => {
    const reply = { reply: 'Stay calm.', suggestions: ['Call 112'], videoIds: ['cpr'], severity: 'high', source: 'llm' };
    ai.chat.mockResolvedValue(reply);
    const inc = (await createIncident(owner.token)).body;
    const res = await request(app).post('/api/chat').set(auth(owner.token))
      .send({ messages: [{ role: 'user', content: 'help' }], incidentId: inc.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(reply);
    expect(ai.chat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'help' }],
      context: expect.objectContaining({ incidentActive: true, trigger: 'sos', country: 'IN', location: { lat: 28.6139, lng: 77.209 }, medical: expect.objectContaining({ bloodType: 'A+' }) }),
    });
    expect((await request(app).post('/api/chat').set(auth(owner.token)).send({ messages: [] })).status).toBe(400);
  });
});
