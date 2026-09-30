'use strict';
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const { HttpError, toIso } = require('./util');

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { algorithm: 'HS256', expiresIn: '30d' });
}

function rowToUser(r) {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role,
    country: r.country, settings: r.settings || {}, createdAt: toIso(r.created_at),
  };
}

/** Express middleware: require a valid Bearer JWT and load req.user from the DB. */
async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new HttpError(401, 'Missing bearer token');
    let payload;
    try {
      payload = jwt.verify(m[1], config.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0]) throw new HttpError(401, 'User no longer exists');
    req.user = rowToUser(rows[0]);
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

module.exports = { signToken, rowToUser, requireAuth, requireRole };
