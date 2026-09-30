'use strict';
/**
 * Append-only audit trail (security + privacy transparency). Writing never throws: an audit
 * failure must not break an emergency flow, it is logged instead.
 *
 * Never put secrets, passwords, share tokens or medical data in `meta`.
 */
const db = require('../db');
const { logger } = require('../logger');
const { toIso } = require('../util');

async function record(action, { userId = null, actorId = null, meta = {}, ip = null } = {}, client = db) {
  try {
    await client.query(
      'INSERT INTO audit_log (user_id, actor_id, action, meta, ip) VALUES ($1,$2,$3,$4,$5)',
      [userId, actorId, action, meta || {}, ip]
    );
  } catch (err) {
    logger.error({ err, action }, 'audit write failed');
  }
}

/** Convenience: audit from a request (ip + actor = signed-in user by default). */
function fromReq(req, action, { userId, actorId, meta } = {}) {
  const me = req.user ? req.user.id : null;
  return record(action, {
    userId: userId === undefined ? me : userId,
    actorId: actorId === undefined ? me : actorId,
    meta,
    ip: req.ip || null,
  });
}

const rowToEntry = (r) => ({
  id: r.id, action: r.action, actorId: r.actor_id, meta: r.meta || {}, ip: r.ip, createdAt: toIso(r.created_at),
});

async function listForUser(userId, limit = 50) {
  const { rows } = await db.query(
    'SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]
  );
  return rows.map(rowToEntry);
}

module.exports = { record, fromReq, listForUser, rowToEntry };
