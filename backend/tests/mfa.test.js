'use strict';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { totp } = require('../src/services/totp');
const { resetDb, registerUser, auth } = require('./helpers');

const app = createApp();

// A controllable clock (TOTP steps, JWT iat/exp all read Date.now()).
const realNow = Date.now.bind(Date);
let now = realNow();
beforeAll(async () => {
  await resetDb();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterAll(async () => {
  Date.now.mockRestore();
  await db.close();
});

const code = (secret, offsetMs = 0) => totp(secret, { timeMs: now + offsetMs });
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const verify = (mfaToken, c) => request(app).post('/api/auth/mfa/verify').send({ mfaToken, code: c });
const wrong = (secret) => {
  // a 6-digit code that is not valid for any step in the ±1 window
  const valid = new Set([-30000, 0, 30000].map((o) => code(secret, o)));
  let c = '000000';
  while (valid.has(c)) c = String(Number(c) + 1).padStart(6, '0');
  return c;
};

describe('TOTP MFA', () => {
  let u;
  let secret;
  let recoveryCodes;

  beforeAll(async () => {
    u = await registerUser(app, { email: 'mfa.user@example.com' });
  });

  test('user objects expose mfaEnabled=false by default', async () => {
    expect(u.user.mfaEnabled).toBe(false);
    const me = await request(app).get('/api/me').set(auth(u.token));
    expect(me.body.mfaEnabled).toBe(false);
  });

  test('setup requires auth and returns a secret + otpauth URL without enabling MFA', async () => {
    expect((await request(app).post('/api/auth/mfa/setup')).status).toBe(401);
    const res = await request(app).post('/api/auth/mfa/setup').set(auth(u.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ secret: expect.stringMatching(/^[A-Z2-7]{32}$/), otpauthUrl: expect.any(String) });
    secret = res.body.secret;
    const url = new URL(res.body.otpauthUrl);
    expect(decodeURIComponent(url.pathname)).toBe('/ResQMe:mfa.user@example.com');
    expect(url.searchParams.get('secret')).toBe(secret);
    expect(url.searchParams.get('issuer')).toBe('ResQMe');

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [u.user.id]);
    expect(rows[0].mfa_enabled).toBe(false);
    expect(rows[0].mfa_secret).toBeNull();
    expect(JSON.stringify(rows[0].mfa_pending_secret)).not.toContain(secret); // encrypted at rest
    expect(Object.keys(rows[0].mfa_pending_secret).sort()).toEqual(['ciphertext', 'iv', 'tag']);

    // password login is unaffected while only pending
    const plain = await login('mfa.user@example.com', u.password);
    expect(plain.body.token).toEqual(expect.any(String));
  });

  test('enable rejects a wrong code (400) and accepts the current code', async () => {
    const bad = await request(app).post('/api/auth/mfa/enable').set(auth(u.token)).send({ code: wrong(secret) });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: expect.any(String) });

    const res = await request(app).post('/api/auth/mfa/enable').set(auth(u.token)).send({ code: code(secret) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, recoveryCodes: expect.any(Array) });
    expect(res.body.recoveryCodes).toHaveLength(8);
    res.body.recoveryCodes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/));
    expect(new Set(res.body.recoveryCodes).size).toBe(8);
    recoveryCodes = res.body.recoveryCodes;

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [u.user.id]);
    expect(rows[0].mfa_enabled).toBe(true);
    expect(rows[0].mfa_pending_secret).toBeNull();
    expect(JSON.stringify(rows[0].mfa_secret)).not.toContain(secret);
    const { rows: codes } = await db.query('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = $1', [u.user.id]);
    expect(codes).toHaveLength(8);
    codes.forEach((r) => { expect(r.code_hash).toMatch(/^[0-9a-f]{64}$/); expect(recoveryCodes).not.toContain(r.code_hash); });

    // existing sessions keep working and now report mfaEnabled
    const me = await request(app).get('/api/me').set(auth(u.token));
    expect(me.status).toBe(200);
    expect(me.body.mfaEnabled).toBe(true);
    // cannot re-enrol while enabled
    expect((await request(app).post('/api/auth/mfa/setup').set(auth(u.token))).status).toBe(409);
    expect((await request(app).post('/api/auth/mfa/enable').set(auth(u.token)).send({ code: code(secret) })).status).toBe(409);
  });

  test('login now returns an MFA challenge; the mfaToken is not an access token', async () => {
    const res = await login('mfa.user@example.com', u.password);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    const decoded = jwt.verify(res.body.mfaToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(decoded).toMatchObject({ sub: u.user.id, purpose: 'mfa' });
    expect(decoded.exp - decoded.iat).toBe(300);

    for (const path of ['/api/me', '/api/incidents', '/api/me/audit']) {
      const r = await request(app).get(path).set(auth(res.body.mfaToken));
      expect(r.status).toBe(401);
    }
    // wrong password still plain 401
    expect((await login('mfa.user@example.com', 'nope-nope')).status).toBe(401);
  });

  test('verify: wrong code 401, replayed code 401, next-step code → { token, user }', async () => {
    const { body: { mfaToken } } = await login('mfa.user@example.com', u.password);
    const bad = await verify(mfaToken, wrong(secret));
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: expect.any(String) });
    // the code used for enabling is burnt (RFC 6238 §5.2 replay protection)
    expect((await verify(mfaToken, code(secret))).status).toBe(401);

    now += 30000;
    const ok = await verify(mfaToken, code(secret));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ token: expect.any(String), user: expect.objectContaining({ id: u.user.id, mfaEnabled: true }) });
    expect((await request(app).get('/api/me').set(auth(ok.body.token))).status).toBe(200);
    // same code again → replay
    expect((await verify(mfaToken, code(secret))).status).toBe(401);
    // access tokens are not accepted as MFA tokens
    expect((await verify(ok.body.token, code(secret, 30000))).status).toBe(401);
  });

  test('recovery codes work once, accept loose formatting, and are consumed', async () => {
    const { body: { mfaToken } } = await login('mfa.user@example.com', u.password);
    const ok = await verify(mfaToken, recoveryCodes[0]);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    expect((await verify(mfaToken, recoveryCodes[0])).status).toBe(401);

    const loose = recoveryCodes[1].toUpperCase().replace('-', '');
    expect((await verify(mfaToken, loose)).status).toBe(200);
    expect((await verify(mfaToken, 'aaaa-aaaa')).status).toBe(401);

    const { rows } = await db.query('SELECT count(*)::int AS n FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [u.user.id]);
    expect(rows[0].n).toBe(6);
  });

  test('mfaToken expires after 5 minutes', async () => {
    const { body: { mfaToken } } = await login('mfa.user@example.com', u.password);
    now += 5 * 60 * 1000 + 1000;
    const res = await verify(mfaToken, code(secret));
    expect(res.status).toBe(401);
  });

  test('verify validates its body', async () => {
    expect((await request(app).post('/api/auth/mfa/verify').send({})).status).toBe(400);
    expect((await verify('not-a-jwt', '123456')).status).toBe(401);
  });

  test('disable requires a valid code (TOTP or recovery), then login is single-step again', async () => {
    const { body: { token } } = await (async () => {
      const { body: { mfaToken } } = await login('mfa.user@example.com', u.password);
      now += 30000;
      return verify(mfaToken, code(secret));
    })();
    const bad = await request(app).post('/api/auth/mfa/disable').set(auth(token)).send({ code: wrong(secret) });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/mfa/disable').set(auth(token)).send({ code: recoveryCodes[2] });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ enabled: false });
    expect((await request(app).post('/api/auth/mfa/disable').set(auth(token)).send({ code: '123456' })).status).toBe(409);

    const res = await login('mfa.user@example.com', u.password);
    expect(res.body).toEqual({ token: expect.any(String), user: expect.objectContaining({ mfaEnabled: false }) });
    const { rows } = await db.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [u.user.id]);
    expect(rows[0]).toEqual({ mfa_secret: null, mfa_enabled: false });
    const { rows: codes } = await db.query('SELECT 1 FROM mfa_recovery_codes WHERE user_id = $1', [u.user.id]);
    expect(codes).toHaveLength(0);
  });

  test('disable with a TOTP code works too, and every MFA event is audited', async () => {
    const setup = await request(app).post('/api/auth/mfa/setup').set(auth(u.token));
    const s2 = setup.body.secret;
    now += 30000;
    await request(app).post('/api/auth/mfa/enable').set(auth(u.token)).send({ code: code(s2) }).expect(200);
    now += 30000;
    const off = await request(app).post('/api/auth/mfa/disable').set(auth(u.token)).send({ code: code(s2) });
    expect(off.body).toEqual({ enabled: false });

    const audit = await request(app).get('/api/me/audit?limit=200').set(auth(u.token));
    const actions = audit.body.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining([
      'mfa_enabled', 'mfa_disabled', 'login_mfa_challenge', 'login_success', 'mfa_failed', 'mfa_recovery_code_used', 'login_failed',
    ]));
    const success = audit.body.find((e) => e.action === 'login_success' && e.meta.mfa);
    expect(success.meta).toEqual({ mfa: true, method: expect.stringMatching(/^(totp|recovery)$/) });
    expect(JSON.stringify(audit.body)).not.toContain(s2);
  });
});
