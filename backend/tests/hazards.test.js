'use strict';
const request = require('supertest');
const db = require('../src/db');
const weather = require('../src/services/weather');
const hazards = require('../src/services/hazards');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');
const { haversineM } = require('../src/util');

const app = createApp();
let user;

const SEVERE = { time: '2026-09-30T06:00', interval: 900, temperature_2m: 42.3, precipitation: 3.2, weather_code: 96, wind_gusts_10m: 72, visibility: 600 };
const CALM = { time: '2026-09-30T06:00', interval: 900, temperature_2m: 30, precipitation: 0, weather_code: 0, wind_gusts_10m: 20, visibility: 10000 };

beforeAll(async () => {
  await resetDb();
  user = await registerUser(app);
});
afterAll(() => db.close());
beforeEach(() => weather.clearCache());
afterEach(() => jest.restoreAllMocks());

const get = (lat, lng, extra = '') => request(app).get(`/api/hazards?lat=${lat}&lng=${lng}${extra}`).set(auth(user.token));

describe('weather mapping (pure)', () => {
  test('maps thresholds to hazard types', () => {
    const hz = weather.mapWeatherToHazards(SEVERE, 28.6, 77.2, new Date('2026-09-30T06:00:00Z'));
    const byType = Object.fromEntries(hz.map((h) => [h.type, h]));
    expect(Object.keys(byType).sort()).toEqual(['flood', 'fog', 'heat', 'storm']);
    expect(byType.heat.title).toMatch(/42°C/);
    expect(byType.flood.title).toMatch(/12\.8 mm\/h/);
    expect(byType.storm.title).toMatch(/hail/i);
    expect(byType.storm.severity).toBe('critical');
    for (const h of hz) {
      expect(h).toEqual({
        id: expect.stringMatching(/^weather:/), type: expect.any(String), severity: expect.any(String), title: expect.any(String),
        description: expect.any(String), lat: 28.6, lng: 77.2, radiusM: expect.any(Number), source: 'open-meteo',
        createdAt: '2026-09-30T06:00:00.000Z', expiresAt: expect.any(String),
      });
    }
    expect(weather.mapWeatherToHazards(CALM, 28.6, 77.2)).toEqual([]);
    expect(weather.mapWeatherToHazards({ ...CALM, weather_code: 95 }, 1, 1).map((h) => h.type)).toEqual(['storm']);
    expect(weather.mapWeatherToHazards({ ...CALM, wind_gusts_10m: 65 }, 1, 1).map((h) => h.type)).toEqual(['storm']);
  });
});

describe('GET /api/hazards', () => {
  test('combines weather + deterministic seeded hazards, cached per cell', async () => {
    const spy = jest.spyOn(weather, 'fetchCurrent').mockResolvedValue(SEVERE);
    const res = await get(28.6139, 77.209);
    expect(res.status).toBe(200);
    const types = res.body.map((h) => h.source);
    expect(types.filter((s) => s === 'open-meteo')).toHaveLength(4);
    const seeded = res.body.filter((h) => h.source === 'seed');
    expect(seeded.length).toBeGreaterThanOrEqual(3);
    for (const h of seeded) {
      expect(['crime', 'accident']).toContain(h.type);
      expect(haversineM(28.6139, 77.209, h.lat, h.lng)).toBeLessThan(10000);
      expect(h.expiresAt).toBeNull();
    }
    // second call in the same 0.1° cell hits the cache and returns the same seeded set
    const again = await get(28.6141, 77.2093);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(again.body.filter((h) => h.source === 'seed').map((h) => h.id).sort()).toEqual(seeded.map((h) => h.id).sort());
  });

  test('seeded hazards are deterministic for the same rounded point', () => {
    const a = hazards.generateSeedHazards(19.0761, 72.8775, 10000);
    const b = hazards.generateSeedHazards(19.0759, 72.8771, 10000);
    expect(a).toEqual(b);
    expect(a.map((h) => h.title).every((t) => hazards.SEED_TEMPLATES.some((x) => x.title === t))).toBe(true);
    expect(hazards.generateSeedHazards(12.97, 77.59, 10000)).not.toEqual(a);
  });

  test('Open-Meteo failure never fails the request', async () => {
    jest.spyOn(weather, 'fetchCurrent').mockRejectedValue(new Error('network down'));
    const res = await get(12.9716, 77.5946);
    expect(res.status).toBe(200);
    expect(res.body.some((h) => h.source === 'open-meteo')).toBe(false);
    expect(res.body.filter((h) => h.source === 'seed').length).toBeGreaterThanOrEqual(3);
  });

  test('POST creates a user hazard (201) that appears in GET; expired hazards excluded', async () => {
    jest.spyOn(weather, 'fetchCurrent').mockResolvedValue(CALM);
    const post = await request(app).post('/api/hazards').set(auth(user.token))
      .send({ type: 'flood', title: 'Waterlogged underpass', lat: 13.0827, lng: 80.2707, severity: 'high' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ type: 'flood', title: 'Waterlogged underpass', source: 'user', severity: 'high', description: '' });
    expect(new Date(post.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await db.query(`INSERT INTO hazards (type, title, lat, lng, source, expires_at) VALUES ('crime','Old report',13.083,80.271,'user', now() - interval '1 hour')`);
    const res = await get(13.0827, 80.2707, '&radiusKm=5');
    expect(res.body.map((h) => h.id)).toContain(post.body.id);
    expect(res.body.map((h) => h.title)).not.toContain('Old report');

    expect((await request(app).post('/api/hazards').set(auth(user.token)).send({ type: 'ufo', title: 'x', lat: 1, lng: 1 })).status).toBe(400);
  });

  test('validates query and requires auth', async () => {
    expect((await request(app).get('/api/hazards?lat=abc&lng=1').set(auth(user.token))).status).toBe(400);
    expect((await request(app).get('/api/hazards?lat=1&lng=1')).status).toBe(401);
  });
});
