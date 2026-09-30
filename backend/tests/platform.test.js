'use strict';
/** Production config, rate limiting, observability (/ready, JSON request logs), pagination, absolute share URLs. */
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(async (p) => actual.rulesTriage(p)), chat: jest.fn(async () => ({ reply: 'ok', source: 'rules' })) };
});

const request = require('supertest');
const db = require('../src/db');
const config = require('../src/config');
const { createApp } = require('../src/app');
const { safePath } = require('../src/logger');
const { resetDb, registerUser, createResponder, auth } = require('./helpers');

const app = createApp();

beforeAll(resetDb);
afterAll(() => db.close());

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k];
  }
  const restore = () => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(restore);
    restore();
    return out;
  } catch (e) {
    restore();
    throw e;
  }
}

describe('production config guard', () => {
  const GOOD = {
    NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), MEDICAL_KEY: 'ab'.repeat(32),
    CORS_ORIGINS: 'https://console.resqme.app', DATABASE_URL: 'postgres://x',
  };
  test('a safe production env passes; non-production is never blocked', () => {
    expect(() => config.assertProductionSafe(GOOD)).not.toThrow();
    expect(() => config.assertProductionSafe({ NODE_ENV: 'development', JWT_SECRET: 'change-me' })).not.toThrow();
  });
  test.each([
    ['short JWT_SECRET', { JWT_SECRET: 'short' }, /JWT_SECRET/],
    ['example JWT_SECRET', { JWT_SECRET: 'change-me' }, /JWT_SECRET/],
    ['non-hex MEDICAL_KEY', { MEDICAL_KEY: 'zz'.repeat(32) }, /MEDICAL_KEY/],
    ['short MEDICAL_KEY', { MEDICAL_KEY: 'ab'.repeat(16) }, /MEDICAL_KEY/],
    ['all-zero MEDICAL_KEY', { MEDICAL_KEY: '0'.repeat(64) }, /all zeros/],
    ['missing CORS_ORIGINS', { CORS_ORIGINS: '' }, /CORS_ORIGINS/],
  ])('refuses %s', (_, patch, re) => {
    expect(() => config.assertProductionSafe({ ...GOOD, ...patch })).toThrow(re);
  });
  test('reports every problem at once', () => {
    try {
      config.assertProductionSafe({ NODE_ENV: 'production' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.problems.length).toBeGreaterThanOrEqual(3);
    }
  });
  test('parses TRUST_PROXY, CORS_ORIGINS, PUBLIC_URL, LOG_LEVEL', () => {
    expect(config.parseTrustProxy(undefined)).toBe('loopback');
    expect(config.parseTrustProxy('true')).toBe(true);
    expect(config.parseTrustProxy('false')).toBe(false);
    expect(config.parseTrustProxy('2')).toBe(2);
    expect(config.parseTrustProxy('10.0.0.0/8, loopback')).toEqual(['10.0.0.0/8', 'loopback']);
    withEnv({ CORS_ORIGINS: undefined }, () => expect(config.corsOrigins).toEqual(['*']));
    withEnv({ CORS_ORIGINS: 'https://a.com/, https://b.com' }, () => expect(config.corsOrigins).toEqual(['https://a.com', 'https://b.com']));
    withEnv({ PUBLIC_URL: 'https://api.resqme.app/' }, () => expect(config.publicUrl).toBe('https://api.resqme.app'));
    withEnv({ LOG_LEVEL: 'bogus' }, () => expect(config.logLevel).toBe('silent')); // test default
    withEnv({ LOG_LEVEL: 'debug' }, () => expect(config.logLevel).toBe('debug'));
  });
});

describe('CORS allowlist', () => {
  test('wildcard by default; allowlist only reflects listed origins', async () => {
    const open = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(open.headers['access-control-allow-origin']).toBe('*');
    await withEnv({ CORS_ORIGINS: 'https://console.resqme.app' }, async () => {
      const locked = createApp();
      const ok = await request(locked).get('/health').set('Origin', 'https://console.resqme.app');
      expect(ok.headers['access-control-allow-origin']).toBe('https://console.resqme.app');
      const bad = await request(locked).get('/health').set('Origin', 'https://evil.example');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
      const native = await request(locked).get('/health'); // no Origin (mobile app / curl)
      expect(native.status).toBe(200);
    });
  });
});

describe('share token absoluteUrl', () => {
  test('uses PUBLIC_URL when set, else the request host; url stays relative', async () => {
    const u = await registerUser(app);
    const derived = await request(app).post('/api/medical-id/share-token').set(auth(u.token));
    expect(derived.body.url).toBe(`/m/${derived.body.token}`);
    expect(derived.body.absoluteUrl).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/m/${derived.body.token}$`));
    await withEnv({ PUBLIC_URL: 'https://api.resqme.app' }, async () => {
      const res = await request(app).post('/api/medical-id/share-token').set(auth(u.token));
      expect(res.body).toEqual({
        token: expect.any(String), url: `/m/${res.body.token}`,
        absoluteUrl: `https://api.resqme.app/m/${res.body.token}`, expiresAt: expect.any(String),
      });
    });
  });
});

describe('rate limiting', () => {
  test('limiters are off under NODE_ENV=test by default', async () => {
    const u = await registerUser(app);
    for (let i = 0; i < 12; i++) {
      await request(app).post('/api/hazards').set(auth(u.token)).send({ type: 'other', title: `h${i}`, lat: 10, lng: 10 }).expect(201);
    }
  });

  test('createApp({ rateLimits }) opts in: hazards limited per user with 429 { error }', async () => {
    const limited = createApp({ rateLimits: { enabled: true, limits: { hazards: 2 } } });
    const a = await registerUser(limited);
    const b = await registerUser(limited);
    const post = (tok) => request(limited).post('/api/hazards').set(auth(tok)).send({ type: 'other', title: 'x', lat: 10, lng: 10 });
    expect((await post(a.token)).status).toBe(201);
    const second = await post(a.token);
    expect(second.status).toBe(201);
    expect(second.headers.ratelimit).toMatch(/remaining=0/);
    const third = await post(a.token);
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: expect.any(String) });
    expect((await post(b.token)).status).toBe(201); // per-user bucket
  });

  test('incident creation and chat limiters', async () => {
    const limited = createApp({ rateLimits: { enabled: true, limits: { incidents: 1, chat: 1 } } });
    const u = await registerUser(limited);
    const inc = () => request(limited).post('/api/incidents').set(auth(u.token)).send({ trigger: 'sos', lat: 1, lng: 1 });
    expect((await inc()).status).toBe(201);
    expect((await inc()).status).toBe(429);
    const chat = () => request(limited).post('/api/chat').set(auth(u.token)).send({ messages: [{ role: 'user', content: 'hi' }] });
    expect((await chat()).status).toBe(200);
    expect((await chat()).status).toBe(429);
  });

  test('MFA verify is limited per account', async () => {
    const limited = createApp({ rateLimits: { enabled: true, limits: { mfa: 2, auth: 1000 } } });
    const u = await registerUser(limited);
    const { signMfaToken } = require('../src/auth');
    await db.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [u.user.id]);
    const mfaToken = signMfaToken({ id: u.user.id, tokenVersion: 0 });
    const v = () => request(limited).post('/api/auth/mfa/verify').send({ mfaToken, code: '123456' });
    expect((await v()).status).toBe(401);
    expect((await v()).status).toBe(401);
    expect((await v()).status).toBe(429);
  });
});

describe('observability', () => {
  test('/ready is 200 when the DB answers and 503 when it does not; /health unchanged', async () => {
    const ok = await request(app).get('/ready');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ready: true, db: true });
    const spy = jest.spyOn(db, 'ping').mockResolvedValue(false);
    try {
      const down = await request(app).get('/ready');
      expect(down.status).toBe(503);
      expect(down.body).toEqual({ ready: false, db: false });
    } finally {
      spy.mockRestore();
    }
    expect((await request(app).get('/health')).body).toEqual({ ok: true, db: true, ai: false });
  });

  test('request logs are structured JSON without secrets, bodies or query strings', async () => {
    const u = await registerUser(app);
    const share = await request(app).post('/api/medical-id/share-token').set(auth(u.token));
    const lines = [];
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
    try {
      await withEnv({ LOG_LEVEL: 'info' }, async () => {
        await request(app).get('/api/me').set(auth(u.token));
        await request(app).post('/api/auth/login').send({ email: u.user.email, password: 'SuperSecretPw1' });
        await request(app).get(`/api/medical-id/public/${share.body.token}`);
        await request(app).get('/api/hazards?lat=28.61&lng=77.2').set(auth(u.token));
      });
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
    const entries = lines.join('').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.msg === 'request');
    expect(entries.length).toBe(4);
    const me = entries.find((e) => e.path === '/api/me');
    expect(me).toEqual({
      level: 'info', time: expect.any(String), msg: 'request', method: 'GET', path: '/api/me',
      status: 200, ms: expect.any(Number), userId: u.user.id, ip: expect.any(String),
    });
    expect(entries.find((e) => e.path === '/api/auth/login')).toMatchObject({ status: 401, level: 'warn' });
    expect(entries.map((e) => e.path)).toContain('/api/medical-id/public/:token');
    expect(entries.map((e) => e.path)).toContain('/api/hazards');
    const raw = lines.join('');
    expect(raw).not.toContain(u.token);
    expect(raw).not.toContain('SuperSecretPw1');
    expect(raw).not.toContain(share.body.token);
    expect(raw).not.toContain('28.61');
  });

  test('safePath redacts share tokens and strips queries', () => {
    expect(safePath('/m/abc123?x=1')).toBe('/m/:token');
    expect(safePath('/api/medical-id/public/abc')).toBe('/api/medical-id/public/:token');
    expect(safePath('/api/incidents?limit=5')).toBe('/api/incidents');
  });
});

describe('incident pagination', () => {
  let u;
  let ids;
  beforeAll(async () => {
    u = await registerUser(app);
    ids = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/incidents').set(auth(u.token)).send({ trigger: 'manual', lat: 1, lng: 1, note: `n${i}` });
      ids.push(r.body.id);
    }
    ids.reverse(); // newest first
  });

  test('default is a plain newest-first array', async () => {
    const res = await request(app).get('/api/incidents').set(auth(u.token));
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((i) => i.id)).toEqual(ids);
    expect(res.headers['x-next-cursor']).toBeUndefined();
  });

  test('limit + before walk the list via X-Next-Cursor without gaps or repeats', async () => {
    const seen = [];
    let before = null;
    for (let page = 0; page < 5; page++) {
      const res = await request(app).get(`/api/incidents?limit=2${before ? `&before=${encodeURIComponent(before)}` : ''}`).set(auth(u.token));
      expect(res.status).toBe(200);
      seen.push(...res.body.map((i) => i.id));
      before = res.headers['x-next-cursor'];
      if (!before) break;
      expect(before).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    }
    expect(seen).toEqual(ids);
  });

  test('before also accepts an item createdAt; bad params are 400', async () => {
    const all = (await request(app).get('/api/incidents').set(auth(u.token))).body;
    const res = await request(app).get(`/api/incidents?before=${encodeURIComponent(all[1].createdAt)}`).set(auth(u.token));
    expect(res.body.map((i) => i.id)).toEqual(ids.slice(2));
    expect((await request(app).get('/api/incidents?limit=0').set(auth(u.token))).status).toBe(400);
    expect((await request(app).get('/api/incidents?limit=201').set(auth(u.token))).status).toBe(400);
    expect((await request(app).get('/api/incidents?before=yesterday-ish').set(auth(u.token))).status).toBe(400);
  });

  test('responders page across all users', async () => {
    const r = await createResponder();
    const res = await request(app).get('/api/incidents?limit=3').set(auth(r.token));
    expect(res.body).toHaveLength(3);
    expect(res.headers['x-next-cursor']).toEqual(expect.any(String));
  });
});
