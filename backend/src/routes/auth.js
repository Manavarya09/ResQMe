'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { signToken, signMfaToken, verifyMfaToken, rowToUser, requireAuth } = require('../auth');
const { limiter } = require('../rateLimit');
const mfa = require('../services/mfa');
const totp = require('../services/totp');
const audit = require('../services/audit');
const realtime = require('../services/realtime');
const { ah, parse, HttpError } = require('../util');

const router = express.Router();

const authLimiter = limiter('auth', {
  windowMs: 15 * 60 * 1000, limit: 50, by: 'ip', message: 'Too many attempts, please try again later',
});
// Brute-force guard for 6-digit codes: keyed by the account in the MFA token (so rotating IPs
// does not help), falling back to IP for garbage tokens.
const mfaLimiter = limiter('mfa', {
  windowMs: 5 * 60 * 1000,
  limit: 10,
  by: (req) => {
    const decoded = req.body && typeof req.body.mfaToken === 'string' ? jwt.decode(req.body.mfaToken) : null;
    return decoded && typeof decoded.sub === 'string' ? `mfa:${decoded.sub}` : null;
  },
  message: 'Too many code attempts, please wait a few minutes and sign in again',
});

// Constant-ish time for unknown emails (prevents account enumeration via response timing).
const DUMMY_HASH = bcrypt.hashSync('resqme-dummy-password-never-matches', 10);

const password = z.string().min(8, 'password must be at least 8 characters').max(200);
const registerSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  email: z.string().trim().toLowerCase().email('invalid email'),
  password,
  phone: z.string().trim().max(30).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'email is required'),
  password: z.string().min(1, 'password is required'),
});

const codeSchema = z.object({ code: z.string().trim().min(1, 'code is required').max(20) });

router.post('/auth/register', authLimiter, ah(async (req, res) => {
  const body = parse(registerSchema, req.body || {});
  const hash = await bcrypt.hash(body.password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING *',
      [body.name, body.email, hash, body.phone || null]
    );
    const user = rowToUser(rows[0]);
    await audit.fromReq(req, 'account_created', { userId: user.id, actorId: user.id });
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}));

router.post('/auth/login', authLimiter, ah(async (req, res) => {
  const body = parse(loginSchema, req.body || {});
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [body.email]);
  const row = rows[0];
  const match = await bcrypt.compare(body.password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !match) {
    await audit.fromReq(req, 'login_failed', {
      userId: row ? row.id : null, actorId: null, meta: { reason: row ? 'bad_password' : 'unknown_email' },
    });
    throw new HttpError(401, 'Invalid email or password');
  }
  const user = rowToUser(row);
  if (row.mfa_enabled) {
    await audit.fromReq(req, 'login_mfa_challenge', { userId: user.id, actorId: user.id });
    return res.json({ mfaRequired: true, mfaToken: signMfaToken(user) });
  }
  await audit.fromReq(req, 'login_success', { userId: user.id, actorId: user.id, meta: { mfa: false } });
  return res.json({ token: signToken(user), user });
}));

router.post('/auth/mfa/verify', authLimiter, mfaLimiter, ah(async (req, res) => {
  const body = parse(z.object({
    mfaToken: z.string().min(1, 'mfaToken is required').max(2000),
    code: z.string().trim().min(1, 'code is required').max(20),
  }), req.body || {});
  const payload = verifyMfaToken(body.mfaToken);
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const row = rows[0];
  if (!row || !row.mfa_enabled || (payload.tv ?? 0) !== (row.token_version ?? 0)) {
    throw new HttpError(401, 'MFA session expired, please sign in again');
  }
  const result = await mfa.verifyUserCode(row.id, body.code);
  if (!result) {
    await audit.fromReq(req, 'mfa_failed', { userId: row.id, actorId: null });
    throw new HttpError(401, 'Invalid verification code');
  }
  const user = rowToUser(row);
  await audit.fromReq(req, 'login_success', { userId: user.id, actorId: user.id, meta: { mfa: true, method: result.method } });
  if (result.method === 'recovery') {
    await audit.fromReq(req, 'mfa_recovery_code_used', {
      userId: user.id, actorId: user.id, meta: { remaining: result.recoveryCodesRemaining },
    });
  }
  res.json({ token: signToken(user), user });
}));

router.post('/auth/mfa/setup', requireAuth, ah(async (req, res) => {
  if (req.user.mfaEnabled) throw new HttpError(409, 'MFA is already enabled; disable it first to re-enrol');
  const secret = await mfa.startSetup(req.user.id);
  res.json({ secret, otpauthUrl: totp.otpauthUrl({ secret, label: req.user.email, issuer: 'ResQMe' }) });
}));

router.post('/auth/mfa/enable', requireAuth, authLimiter, ah(async (req, res) => {
  const { code } = parse(codeSchema, req.body || {});
  const result = await mfa.enable(req.user.id, code);
  if (result.error === 'no_pending') {
    throw new HttpError(409, req.user.mfaEnabled ? 'MFA is already enabled' : 'Start MFA setup first');
  }
  if (result.error) throw new HttpError(400, 'Invalid verification code');
  await audit.fromReq(req, 'mfa_enabled');
  res.json({ enabled: true, recoveryCodes: result.recoveryCodes });
}));

router.post('/auth/mfa/disable', requireAuth, authLimiter, ah(async (req, res) => {
  const { code } = parse(codeSchema, req.body || {});
  if (!req.user.mfaEnabled) throw new HttpError(409, 'MFA is not enabled');
  const result = await mfa.verifyUserCode(req.user.id, code);
  if (!result) {
    await audit.fromReq(req, 'mfa_failed', { meta: { during: 'disable' } });
    throw new HttpError(400, 'Invalid verification code');
  }
  await mfa.disable(req.user.id);
  await audit.fromReq(req, 'mfa_disabled', { meta: { method: result.method } });
  res.json({ enabled: false });
}));

router.post('/auth/logout-all', requireAuth, ah(async (req, res) => {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await audit.fromReq(req, 'logout_all');
  realtime.disconnectUser(req.user.id);
  res.status(204).end();
}));

router.post('/auth/change-password', requireAuth, authLimiter, ah(async (req, res) => {
  const body = parse(z.object({
    currentPassword: z.string().min(1, 'currentPassword is required').max(200),
    newPassword: password.describe('newPassword'),
  }), req.body || {});
  const ok = await bcrypt.compare(body.currentPassword, req.userRow.password_hash);
  if (!ok) {
    await audit.fromReq(req, 'password_change_failed');
    throw new HttpError(400, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(body.newPassword, 10);
  const { rows } = await db.query(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING *',
    [req.user.id, hash]
  );
  const user = rowToUser(rows[0]);
  await audit.fromReq(req, 'password_changed');
  realtime.disconnectUser(user.id);
  res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, (req, res) => res.json(req.user));

const patchMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO code').transform((s) => s.toUpperCase()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.patch('/me', requireAuth, ah(async (req, res) => {
  const body = parse(patchMeSchema, req.body || {});
  const { rows } = await db.query(
    `UPDATE users SET
       name = COALESCE($2, name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       country = COALESCE($5, country),
       settings = settings || $6::jsonb
     WHERE id = $1 RETURNING *`,
    [req.user.id, body.name ?? null, body.phone !== undefined, body.phone ?? null, body.country ?? null, JSON.stringify(body.settings || {})]
  );
  res.json(rowToUser(rows[0]));
}));

module.exports = router;
