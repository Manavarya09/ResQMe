'use strict';
/**
 * Live location sharing links. The raw token (32 random bytes, base64url) is returned to the
 * owner exactly once; only its SHA-256 hash is stored, so a database leak does not leak links.
 */
const crypto = require('crypto');
const db = require('../db');
const { toIso } = require('../util');

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

const hashToken = (token) => crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const isTokenShaped = (token) => typeof token === 'string' && TOKEN_RE.test(token);

function isActive(row, now = Date.now()) {
  return !row.revoked_at && new Date(row.expires_at).getTime() > now;
}

const rowToShare = (r) => ({
  id: r.id,
  incidentId: r.incident_id,
  lat: r.last_lat, lng: r.last_lng, accuracy: r.last_accuracy,
  updatedAt: toIso(r.updated_at),
  expiresAt: toIso(r.expires_at),
  revokedAt: toIso(r.revoked_at),
  createdAt: toIso(r.created_at),
  active: isActive(r),
});

async function createShare(userId, { durationMinutes, incidentId = null, lat = null, lng = null, accuracy = null }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const { rows } = await db.query(
    `INSERT INTO location_shares (user_id, token_hash, incident_id, last_lat, last_lng, last_accuracy, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, hashToken(token), incidentId, lat, lng, accuracy, expiresAt]
  );
  return { token, share: rowToShare(rows[0]) };
}

async function getOwned(id, userId) {
  const { rows } = await db.query('SELECT * FROM location_shares WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

async function listActive(userId) {
  const { rows } = await db.query(
    `SELECT * FROM location_shares WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC`, [userId]
  );
  return rows.map(rowToShare);
}

async function updateLocation(id, { lat, lng, accuracy = null }) {
  const { rows } = await db.query(
    `UPDATE location_shares SET last_lat = $2, last_lng = $3, last_accuracy = $4, updated_at = now()
      WHERE id = $1 RETURNING *`, [id, lat, lng, accuracy]
  );
  return rows[0] ? rowToShare(rows[0]) : null;
}

async function revoke(id) {
  await db.query('UPDATE location_shares SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1', [id]);
}

/** Row + public-safe owner/incident fields for a raw token (or null when the token is unknown). */
async function findByToken(token) {
  if (!isTokenShaped(token)) return null;
  const { rows } = await db.query(
    `SELECT s.*, u.name AS owner_name, i.status AS incident_status, i.trigger AS incident_trigger, i.severity AS incident_severity
       FROM location_shares s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN incidents i ON i.id = s.incident_id
      WHERE s.token_hash = $1`, [hashToken(token)]
  );
  return rows[0] || null;
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Someone';

/** The only shape ever served publicly: no email, phone, medical data, contacts or user id. */
function toPublic(row) {
  return {
    name: firstName(row.owner_name),
    lat: row.last_lat,
    lng: row.last_lng,
    accuracy: row.last_accuracy,
    updatedAt: toIso(row.updated_at),
    expiresAt: toIso(row.expires_at),
    active: isActive(row),
    incident: row.incident_id && row.incident_status
      ? { status: row.incident_status, trigger: row.incident_trigger, severity: row.incident_severity }
      : null,
  };
}

module.exports = {
  hashToken, newToken, isTokenShaped, isActive, rowToShare, createShare, getOwned, listActive,
  updateLocation, revoke, findByToken, toPublic, firstName,
};
