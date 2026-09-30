'use strict';
const path = require('path');
// .env is optional: in containers/production everything comes from real env vars.
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

/** TRUST_PROXY → value for app.set('trust proxy'): true/false, hop count, or a subnet/keyword list. */
function parseTrustProxy(raw) {
  if (raw === undefined || raw === '') return 'loopback';
  const v = String(raw).trim();
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get isProduction() { return config.nodeEnv === 'production'; },
  get isTest() { return process.env.NODE_ENV === 'test'; },
  get port() { return Number(process.env.PORT || 4100); },
  get jwtSecret() { return required('JWT_SECRET'); },
  get medicalKey() { return required('MEDICAL_KEY'); },
  get aiUrl() { return (process.env.AI_URL || 'http://localhost:8100').replace(/\/+$/, ''); },
  /** Allowed browser origins: ['*'] (any) or an explicit list. */
  get corsOrigins() {
    const raw = (process.env.CORS_ORIGINS || '').trim();
    if (!raw) return ['*'];
    return raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  },
  get trustProxy() { return parseTrustProxy(process.env.TRUST_PROXY); },
  /** Public base URL (e.g. https://api.resqme.app) used for absolute links; null → derive from the request. */
  get publicUrl() {
    const v = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
    return v || null;
  },
  get logLevel() {
    const v = (process.env.LOG_LEVEL || '').trim().toLowerCase();
    if (LOG_LEVELS.includes(v)) return v;
    return config.isTest ? 'silent' : 'info';
  },
};

/**
 * `cors` / Socket.IO origin option. '*' → allow any origin (dev default); otherwise an allowlist.
 * Requests without an Origin header (native mobile apps, curl) are always allowed — CORS is a
 * browser-only control.
 */
function corsOriginOption() {
  const list = config.corsOrigins;
  if (list.includes('*')) return true;
  return (origin, cb) => {
    if (!origin || list.includes(origin)) return cb(null, true);
    return cb(null, false);
  };
}

/** Throws with every problem listed when the process is not safe to run in production. */
function assertProductionSafe(env = process.env) {
  if ((env.NODE_ENV || '') !== 'production') return;
  const problems = [];
  const secret = env.JWT_SECRET || '';
  if (secret.length < 32 || secret === 'change-me') problems.push('JWT_SECRET must be at least 32 characters and not the example value');
  const key = env.MEDICAL_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(key)) problems.push('MEDICAL_KEY must be exactly 64 hex characters (32 bytes)');
  else if (/^0+$/.test(key)) problems.push('MEDICAL_KEY must not be all zeros');
  const cors = (env.CORS_ORIGINS || '').trim();
  if (!cors) problems.push('CORS_ORIGINS must be set in production (comma-separated origins, or * to allow any)');
  if (!env.DATABASE_URL) problems.push('DATABASE_URL must be set');
  if (problems.length) {
    const err = new Error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`);
    err.problems = problems;
    throw err;
  }
}

module.exports = config;
module.exports.corsOriginOption = corsOriginOption;
module.exports.assertProductionSafe = assertProductionSafe;
module.exports.parseTrustProxy = parseTrustProxy;
