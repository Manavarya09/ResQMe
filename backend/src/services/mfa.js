'use strict';
/** TOTP MFA persistence: encrypted secrets, replay-protected verification, one-time recovery codes. */
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const totp = require('./totp');
const { encryptJson, decryptJson } = require('./crypto');

const RECOVERY_COUNT = 8;
// no 0/o/1/l/i — easy to read back from paper
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const encryptSecret = (secret) => encryptJson({ secret });
const decryptSecret = (enc) => (enc ? decryptJson(enc).secret : null);

function randomRecoveryCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normalise user input to the canonical `xxxx-xxxx` form, or null if it cannot be a recovery code. */
function normalizeRecoveryCode(input) {
  const s = String(input || '').toLowerCase().replace(/[\s-]/g, '');
  if (s.length !== 8 || [...s].some((c) => !RECOVERY_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Keyed hash (HMAC-SHA256 with the server key) — a leaked DB alone cannot brute-force the codes. */
function hashRecoveryCode(code) {
  return crypto.createHmac('sha256', Buffer.from(config.medicalKey, 'hex')).update(`resqme-recovery:${code}`).digest('hex');
}

const isTotpShaped = (code) => /^\d{6}$/.test(String(code || '').replace(/\s/g, ''));

/** Replace all recovery codes for a user; returns the plaintext codes (shown to the user exactly once). */
async function regenerateRecoveryCodes(userId, client = db) {
  const codes = Array.from({ length: RECOVERY_COUNT }, randomRecoveryCode);
  await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [userId]);
  await client.query(
    `INSERT INTO mfa_recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])`,
    [userId, codes.map(hashRecoveryCode)]
  );
  return codes;
}

/**
 * Verify a code for a user with MFA enabled. `code` may be a 6-digit TOTP (replay-protected)
 * or a recovery code (consumed on success). Returns { method: 'totp'|'recovery' } or null.
 */
async function verifyUserCode(userId, code, { allowRecovery = true } = {}) {
  return db.tx(async (client) => {
    const { rows } = await client.query(
      'SELECT mfa_enabled, mfa_secret, mfa_last_step FROM users WHERE id = $1 FOR UPDATE', [userId]
    );
    const u = rows[0];
    if (!u || !u.mfa_enabled || !u.mfa_secret) return null;
    if (isTotpShaped(code)) {
      const last = u.mfa_last_step === null ? null : Number(u.mfa_last_step);
      const step = totp.verifyTotp(decryptSecret(u.mfa_secret), code, { afterStep: last });
      if (step === null) return null;
      await client.query('UPDATE users SET mfa_last_step = $2 WHERE id = $1', [userId, step]);
      return { method: 'totp' };
    }
    if (!allowRecovery) return null;
    const norm = normalizeRecoveryCode(code);
    if (!norm) return null;
    const res = await client.query(
      `UPDATE mfa_recovery_codes SET used_at = now()
        WHERE id = (SELECT id FROM mfa_recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL LIMIT 1)
        RETURNING id`,
      [userId, hashRecoveryCode(norm)]
    );
    if (!res.rowCount) return null;
    const { rows: left } = await client.query(
      'SELECT count(*)::int AS n FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId]
    );
    return { method: 'recovery', recoveryCodesRemaining: left[0].n };
  });
}

/** Store a fresh pending secret (MFA not yet enabled). Returns the plaintext base32 secret. */
async function startSetup(userId) {
  const secret = totp.generateSecret();
  await db.query('UPDATE users SET mfa_pending_secret = $2 WHERE id = $1', [userId, encryptSecret(secret)]);
  return secret;
}

/**
 * Confirm the pending secret with a TOTP code and turn MFA on.
 * Returns recovery codes, or null if the code is wrong / nothing is pending.
 */
async function enable(userId, code) {
  return db.tx(async (client) => {
    const { rows } = await client.query('SELECT mfa_enabled, mfa_pending_secret FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const u = rows[0];
    if (!u || u.mfa_enabled || !u.mfa_pending_secret) return { error: 'no_pending' };
    const secret = decryptSecret(u.mfa_pending_secret);
    const step = totp.verifyTotp(secret, code);
    if (step === null) return { error: 'bad_code' };
    await client.query(
      `UPDATE users SET mfa_enabled = true, mfa_secret = mfa_pending_secret, mfa_pending_secret = NULL, mfa_last_step = $2
        WHERE id = $1`, [userId, step]
    );
    return { recoveryCodes: await regenerateRecoveryCodes(userId, client) };
  });
}

async function disable(userId) {
  await db.tx(async (client) => {
    await client.query(
      `UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_last_step = NULL WHERE id = $1`,
      [userId]
    );
    await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [userId]);
  });
}

module.exports = {
  RECOVERY_COUNT, startSetup, enable, disable, verifyUserCode, regenerateRecoveryCodes,
  normalizeRecoveryCode, hashRecoveryCode, randomRecoveryCode, isTotpShaped, decryptSecret,
};
