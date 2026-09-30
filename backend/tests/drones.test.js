'use strict';
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(async (p) => actual.rulesTriage(p)) };
});

const request = require('supertest');
const db = require('../src/db');
const drones = require('../src/services/drones');
const { createApp } = require('../src/app');
const { resetDb, registerUser, createResponder, auth } = require('./helpers');
const { haversineM, destinationPoint } = require('../src/util');

const app = createApp();
let owner;
let responder;

beforeAll(async () => {
  await resetDb();
  owner = await registerUser(app);
  responder = await createResponder();
});
afterAll(() => db.close());

const newIncident = (lat, lng) => request(app).post('/api/incidents').set(auth(owner.token)).send({ trigger: 'sos', lat, lng });

describe('stepDrone (pure)', () => {
  const base = { id: 'd', name: 'D', status: 'en_route', lat: 28.6, lng: 77.2, baseLat: 28.6, baseLng: 77.2, batteryPct: 100, incidentId: 'i', etaSeconds: null };

  test('en_route moves 15 m/s toward the target and drains battery 0.05 %/s', () => {
    const target = destinationPoint(28.6, 77.2, 90, 1000);
    const { drone, changed, event } = drones.stepDrone(base, target, 1);
    expect(changed).toBe(true);
    expect(event).toBeNull();
    expect(haversineM(28.6, 77.2, drone.lat, drone.lng)).toBeCloseTo(15, 1);
    expect(haversineM(drone.lat, drone.lng, target.lat, target.lng)).toBeCloseTo(985, 0);
    expect(drone.batteryPct).toBeCloseTo(99.95, 5);
    expect(drone.etaSeconds).toBe(66);
    expect(base.lat).toBe(28.6); // input not mutated
  });

  test('switches to on_scene within 30 m, then hovers', () => {
    const target = destinationPoint(28.6, 77.2, 0, 40);
    const r = drones.stepDrone(base, target, 1);
    expect(r.drone.status).toBe('on_scene');
    expect(r.event).toBe('arrived_scene');
    expect(r.drone.etaSeconds).toBe(0);
    const hover = drones.stepDrone(r.drone, target, 1);
    expect(hover.changed).toBe(false);
  });

  test('returning drone lands at base, becomes idle and detaches from incident', () => {
    const away = { ...base, status: 'returning', ...destinationPoint(28.6, 77.2, 180, 20) };
    const r = drones.stepDrone(away, null, 2);
    expect(r.event).toBe('arrived_base');
    expect(r.drone).toMatchObject({ status: 'idle', lat: 28.6, lng: 77.2, incidentId: null, etaSeconds: null });
  });

  test('idle drones do not move', () => {
    expect(drones.stepDrone({ ...base, status: 'idle' }, { lat: 0, lng: 0 }, 1).changed).toBe(false);
  });
});

describe('dispatch + simulation', () => {
  test('GET /api/drones returns the seeded fleet of 3', async () => {
    const res = await request(app).get('/api/drones').set(auth(owner.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual({
      id: 'drone-1', name: expect.any(String), status: 'idle', lat: expect.any(Number), lng: expect.any(Number),
      baseLat: expect.any(Number), baseLng: expect.any(Number), batteryPct: 100, incidentId: null, etaSeconds: null,
    });
  });

  test('nearest idle drone is dispatched; tick moves it; resolve sends it home', async () => {
    const inc = (await newIncident(28.6139, 77.209)).body; // near Connaught Place → drone-1
    const res = await request(app).post(`/api/incidents/${inc.id}/drone`).set(auth(responder.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'drone-1', status: 'en_route', incidentId: inc.id });
    expect(res.body.etaSeconds).toBeGreaterThan(0);

    const detail = await request(app).get(`/api/incidents/${inc.id}`).set(auth(owner.token));
    expect(detail.body).toMatchObject({ status: 'dispatched', droneId: 'drone-1' });
    expect(detail.body.events.map((e) => e.type)).toContain('drone_dispatched');

    // idempotent: dispatching again returns the same drone
    const again = await request(app).post(`/api/incidents/${inc.id}/drone`).set(auth(owner.token));
    expect(again.body.id).toBe('drone-1');

    const before = haversineM(res.body.lat, res.body.lng, inc.lat, inc.lng);
    await drones.tick(1);
    const moved = await drones.getDrone('drone-1');
    expect(before - haversineM(moved.lat, moved.lng, inc.lat, inc.lng)).toBeCloseTo(15, 0);
    expect(moved.batteryPct).toBeLessThan(100);

    // a big step brings it on scene and logs an event
    const results = await drones.tick(10000);
    expect(results.find((r) => r.drone.id === 'drone-1').event).toBe('arrived_scene');
    expect((await drones.getDrone('drone-1')).status).toBe('on_scene');
    const d2 = await request(app).get(`/api/incidents/${inc.id}`).set(auth(owner.token));
    expect(d2.body.events.map((e) => e.type)).toContain('drone_on_scene');

    await request(app).post(`/api/incidents/${inc.id}/resolve`).set(auth(responder.token)).expect(200);
    expect((await drones.getDrone('drone-1')).status).toBe('returning');
    await drones.tick(10000);
    const home = await drones.getDrone('drone-1');
    expect(home).toMatchObject({ status: 'idle', incidentId: null, lat: home.baseLat, lng: home.baseLng });
  });

  test('far-away incident repositions a drone to a base 2–4 km away', async () => {
    const inc = (await newIncident(19.076, 72.8777)).body; // Mumbai
    const res = await request(app).post(`/api/incidents/${inc.id}/drone`).set(auth(owner.token));
    expect(res.status).toBe(200);
    const dist = haversineM(res.body.baseLat, res.body.baseLng, inc.lat, inc.lng);
    expect(dist).toBeGreaterThanOrEqual(1999);
    expect(dist).toBeLessThanOrEqual(4001);
    expect(res.body.lat).toBeCloseTo(res.body.baseLat, 8);
  });

  test('returns 409 when no drone is idle', async () => {
    const a = (await newIncident(28.5, 77.1)).body;
    const b = (await newIncident(28.51, 77.11)).body;
    await request(app).post(`/api/incidents/${a.id}/drone`).set(auth(owner.token)).expect(200);
    await request(app).post(`/api/incidents/${b.id}/drone`).set(auth(owner.token)).expect(200);
    const c = (await newIncident(28.52, 77.12)).body;
    const res = await request(app).post(`/api/incidents/${c.id}/drone`).set(auth(owner.token));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No drones/);
  });
});
