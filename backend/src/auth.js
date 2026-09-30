'use strict';
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError, toIso } = require('./util');

const ACCESS_TTL = '30d';
const MFA_TTL = '5m';

/** Access token. `tv` (token_version) lets logout-all / password change revoke every session. */
function signToken(user) {
  const tv = user.tokenVersion ?? 0;
  return jwt.sign({ sub: user.id, role: user.role, tv }, config.jwtSecret, { algorithm: 'HS256', expiresIn: ACCESS_TTL });
}

/** Short-lived, single-purpose token proving the password step of an MFA login. Never an access token. */
function signMfaToken(user) {
  return jwt.sign({ sub: user.id, purpose: 'mfa', tv: user.tokenVersion ?? 0 }, config.jwtSecret, { algorithm: 'HS256', expiresIn: MFA_TTL });
}

function rowToUser(r) {
  const user = {
    id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role,
    country: r.country, settings: r.settings || {}, mfaEnabled: !!r.mfa_enabled, createdAt: toIso(r.created_at),
  };
  // internal only — non-enumerable so it never reaches a JSON response
  Object.defineProperty(user, 'tokenVersion', { value: r.token_version ?? 0, enumerable: false });
  return user;
}

/**
 * Verify an access JWT and load its user row. Rejects purpose-scoped tokens (e.g. MFA) and
 * tokens whose `tv` no longer matches the user's token_version (tokens minted before `tv`
 * existed count as tv 0). Throws HttpError(401).
 */
async function authenticateToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  if (payload.purpose !== undefined || !payload.sub) throw new HttpError(401, 'Invalid or expired token');
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  if (!rows[0]) throw new HttpError(401, 'User no longer exists');
  if ((payload.tv ?? 0) !== (rows[0].token_version ?? 0)) throw new HttpError(401, 'Session has been revoked, please sign in again');
  return rows[0];
}

/** Verify an MFA challenge token; returns its payload or throws HttpError(401). */
function verifyMfaToken(token) {
  let payload;
  try {
    payload = jwt.verify(String(token || ''), config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'MFA session expired, please sign in again');
  }
  if (payload.purpose !== 'mfa' || !payload.sub) throw new HttpError(401, 'Invalid MFA token');
  return payload;
}

/** Express middleware: require a valid Bearer JWT and load req.user from the DB. */
async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new HttpError(401, 'Missing bearer token');
    const row = await authenticateToken(m[1]);
    req.user = rowToUser(row);
    req.userRow = row;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return next(new HttpError(403, `Only ${role}s can do this`));
    return next();
  };
}

module.exports = { signToken, signMfaToken, verifyMfaToken, authenticateToken, rowToUser, requireAuth, requireRole };
