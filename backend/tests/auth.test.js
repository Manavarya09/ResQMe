'use strict';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');

const app = createApp();

beforeAll(resetDb);
afterAll(() => db.close());

describe('auth', () => {
  test('register returns 201 with token and user (role user, country IN)', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Asha', email: 'Asha@Example.com', password: 'longenough', phone: '+91 99999 00000' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: expect.any(String), name: 'Asha', email: 'asha@example.com', phone: '+91 99999 00000',
      role: 'user', country: 'IN', settings: {}, mfaEnabled: false, createdAt: expect.any(String),
    });
    expect(res.body.user.password_hash).toBeUndefined();
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded.sub).toBe(res.body.user.id);
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 3600);
  });

  test('register rejects duplicate email (409) and short password (400)', async () => {
    const dup = await request(app).post('/api/auth/register').send({ name: 'X', email: 'asha@example.com', password: 'longenough' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/exists/);
    const short = await request(app).post('/api/auth/register').send({ name: 'X', email: 'x@example.com', password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toMatch(/password/);
  });

  test('login succeeds with correct password and fails otherwise', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'ASHA@example.com', password: 'longenough' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('asha@example.com');
    const bad = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'wrongpass' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: expect.any(String) });
  });

  test('GET /api/me requires a valid token', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').set(auth('garbage'))).status).toBe(401);
    const { token, user } = await registerUser(app);
    const me = await request(app).get('/api/me').set(auth(token));
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(user.id);
  });

  test('PATCH /api/me updates fields and merges settings shallowly', async () => {
    const { token } = await registerUser(app);
    let res = await request(app).patch('/api/me').set(auth(token)).send({ settings: { locationSharing: true, theme: 'light' } });
    expect(res.status).toBe(200);
    res = await request(app).patch('/api/me').set(auth(token)).send({ name: 'Renamed', country: 'us', settings: { theme: 'dark' } });
    expect(res.body.name).toBe('Renamed');
    expect(res.body.country).toBe('US');
    expect(res.body.settings).toEqual({ locationSharing: true, theme: 'dark' });
  });

  test('GET /health reports db and ai reachability', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true, ai: false });
  });
});
