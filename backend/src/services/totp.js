'use strict';
/**
 * RFC 4226 (HOTP) / RFC 6238 (TOTP) with RFC 4648 base32 — node:crypto only, no dependencies.
 * Defaults match every mainstream authenticator app: SHA1, 6 digits, 30 s step.
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

/** RFC 4648 base32 encode (no padding — authenticator apps expect it unpadded). */
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** RFC 4648 base32 decode; tolerant of lowercase, spaces, hyphens and '=' padding. */
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP(K, C) — RFC 4226 §5.3 dynamic truncation. `key` is a Buffer. */
function hotp(key, counter, { digits = DIGITS, algorithm = 'sha1' } = {}) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac(algorithm, key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

const stepAt = (timeMs = Date.now(), step = STEP_SECONDS) => Math.floor(timeMs / 1000 / step);

/** TOTP code for a base32 secret at `timeMs` (default now). */
function totp(secretB32, { timeMs = Date.now(), digits = DIGITS, step = STEP_SECONDS, algorithm = 'sha1' } = {}) {
  return hotp(base32Decode(secretB32), stepAt(timeMs, step), { digits, algorithm });
}

/**
 * Verify a TOTP code within ±`window` steps. Returns the matched time-step (a number) or null.
 * Callers should persist the returned step and pass it back as `afterStep` to reject replays
 * (RFC 6238 §5.2: a code must not be accepted twice).
 */
function verifyTotp(secretB32, code, { timeMs = Date.now(), window = 1, afterStep = null, digits = DIGITS, step = STEP_SECONDS } = {}) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d+$/.test(c) || c.length !== digits) return null;
  const key = base32Decode(secretB32);
  const now = stepAt(timeMs, step);
  const given = Buffer.from(c);
  for (let i = -window; i <= window; i++) {
    const s = now + i;
    if (s < 0 || (afterStep !== null && afterStep !== undefined && s <= afterStep)) continue;
    const expected = Buffer.from(hotp(key, s, { digits }));
    if (crypto.timingSafeEqual(expected, given)) return s;
  }
  return null;
}

/** 160-bit random secret (RFC 4226 §4 recommends ≥128, 160 is the SHA1 block-friendly norm). */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** otpauth:// URI (Google Authenticator Key Uri Format). */
function otpauthUrl({ secret, label, issuer = 'ResQMe' }) {
  const path = encodeURIComponent(`${issuer}:${label}`);
  const q = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${path}?${q.toString()}`;
}

module.exports = { base32Encode, base32Decode, hotp, totp, verifyTotp, generateSecret, otpauthUrl, stepAt, STEP_SECONDS };
