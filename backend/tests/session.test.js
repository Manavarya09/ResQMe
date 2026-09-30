'use strict';
const http = require('http');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');
const db = require('../src/db');
const realtime = require('../src/services/realtime');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');

let server;
let url;
const sockets = [];

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
}

beforeAll(async () => {
  await resetDb();
  server = http.createServer(createApp());
  realtime.init(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await realtime.close();
  await db.close();
});

const me = (token) => request(server).get('/api/me').set(auth(token));

describe('token_version (tv) sessions', () => {
  test('access tokens carry tv; legacy tokens without tv are treated as tv 0', async () => {
    const u = await registerUser(server);
    expect(jwt.decode(u.token).tv).toBe(0);
    const legacy = jwt.sign({ sub: u.user.id, role: 'user' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    expect((await me(legacy)).status).toBe(200);
  });

  test('purpose-scoped tokens are never access tokens', async () => {
    const u = await registerUser(server);
    const scoped = jwt.sign({ sub: u.user.id, purpose: 'mfa', tv: 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    expect((await me(scoped)).status).toBe(401);
    await expect(connect(scoped)).rejects.toThrow(/unauthorized/);
  });

  test('logout-all revokes every existing token (HTTP + socket) but new logins work', async () => {
    const u = await registerUser(server);
    const legacy = jwt.sign({ sub: u.user.id, role: 'user' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    const second = (await request(server).post('/api/auth/login').send({ email: u.user.email, password: u.password })).body.token;
    const sock = await connect(u.token);
    const dropped = new Promise((resolve) => sock.on('disconnect', resolve));

    expect((await request(server).post('/api/auth/logout-all')).status).toBe(401);
    const res = await request(server).post('/api/auth/logout-all').set(auth(u.token));
    expect(res.status).toBe(204);
    expect(await dropped).toBe('io server disconnect');

    for (const t of [u.token, second, legacy]) {
      const r = await me(t);
      expect(r.status).toBe(401);
      expect(r.body.error).toMatch(/revoked/);
    }
    await expect(connect(u.token)).rejects.toThrow(/unauthorized/);

    const fresh = await request(server).post('/api/auth/login').send({ email: u.user.email, password: u.password });
    expect(jwt.decode(fresh.body.token).tv).toBe(1);
    expect((await me(fresh.body.token)).status).toBe(200);
    await connect(fresh.body.token);
  });

  test('change-password validates, bumps tv and returns a fresh session', async () => {
    const u = await registerUser(server);
    const path = '/api/auth/change-password';
    const wrong = await request(server).post(path).set(auth(u.token)).send({ currentPassword: 'wrong-one', newPassword: 'NewPassword1' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatch(/incorrect/);
    const short = await request(server).post(path).set(auth(u.token)).send({ currentPassword: u.password, newPassword: 'short' });
    expect(short.status).toBe(400);
    expect((await me(u.token)).status).toBe(200); // failed attempts revoke nothing

    const ok = await request(server).post(path).set(auth(u.token)).send({ currentPassword: u.password, newPassword: 'NewPassword1' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ token: expect.any(String), user: expect.objectContaining({ id: u.user.id, mfaEnabled: false }) });
    expect(jwt.decode(ok.body.token).tv).toBe(1);
    expect((await me(u.token)).status).toBe(401);
    expect((await me(ok.body.token)).status).toBe(200);

    expect((await request(server).post('/api/auth/login').send({ email: u.user.email, password: u.password })).status).toBe(401);
    expect((await request(server).post('/api/auth/login').send({ email: u.user.email, password: 'NewPassword1' })).status).toBe(200);

    const audit = await request(server).get('/api/me/audit').set(auth(ok.body.token));
    expect(audit.body.map((e) => e.action)).toEqual(expect.arrayContaining(['password_changed', 'password_change_failed']));
  });
});
