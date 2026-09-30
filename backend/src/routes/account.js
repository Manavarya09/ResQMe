'use strict';
/** Privacy & transparency: own audit trail, full data export, account deletion. */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../auth');
const audit = require('../services/audit');
const incidents = require('../services/incidents');
const hazards = require('../services/hazards');
const realtime = require('../services/realtime');
const { getMedicalId, listContacts } = require('../services/medical');
const { ah, parse, HttpError, toIso } = require('../util');

const router = express.Router();

router.get('/me/audit', requireAuth, ah(async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).optional().default(50) }), req.query);
  res.json(await audit.listForUser(req.user.id, limit));
}));

router.get('/me/export', requireAuth, ah(async (req, res) => {
  const uid = req.user.id;
  const [medicalId, contacts, incidentList, auditEntries, shares, reported, mfaCodes, locShares] = await Promise.all([
    getMedicalId(uid),
    listContacts(uid),
    incidents.listIncidents({ userId: uid, limit: 10000 }),
    audit.listForUser(uid, 10000),
    db.query('SELECT created_at, expires_at FROM share_tokens WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
    db.query('SELECT * FROM hazards WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
    db.query('SELECT count(*) FILTER (WHERE used_at IS NULL)::int AS unused, count(*)::int AS total FROM mfa_recovery_codes WHERE user_id = $1', [uid]),
    db.query('SELECT * FROM location_shares WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
  ]);
  const withEvents = await Promise.all(incidentList.map(async (inc) => ({ ...inc, events: await incidents.getEvents(inc.id) })));
  await audit.fromReq(req, 'data_exported');
  const { settings, ...profile } = req.user;
  res.set('Cache-Control', 'no-store');
  res.set('Content-Disposition', 'attachment; filename="resqme-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    format: 'resqme-export/v1',
    profile,
    settings,
    security: {
      mfaEnabled: req.user.mfaEnabled,
      recoveryCodes: { total: mfaCodes.rows[0].total, unused: mfaCodes.rows[0].unused },
    },
    medicalId,
    contacts,
    incidents: withEvents,
    medicalShareLinks: shares.rows.map((r) => ({ createdAt: toIso(r.created_at), expiresAt: toIso(r.expires_at) })),
    liveLocationShares: locShares.rows.map((r) => ({
      incidentId: r.incident_id, lastLat: r.last_lat, lastLng: r.last_lng, updatedAt: toIso(r.updated_at),
      createdAt: toIso(r.created_at), expiresAt: toIso(r.expires_at), revokedAt: toIso(r.revoked_at),
    })),
    hazardsReported: reported.rows.map(hazards.rowToHazard),
    audit: auditEntries,
  });
}));

router.delete('/me', requireAuth, ah(async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1, 'password is required').max(200) }), req.body || {});
  const ok = await bcrypt.compare(password, req.userRow.password_hash);
  if (!ok) {
    await audit.fromReq(req, 'account_delete_failed');
    throw new HttpError(400, 'Password is incorrect');
  }
  const uid = req.user.id;
  await db.tx(async (client) => {
    // personal history goes with the account; a non-identifying tombstone stays for accountability
    await client.query('DELETE FROM audit_log WHERE user_id = $1', [uid]);
    // recall any drone still flying to one of this user's incidents (drones.incident_id has no FK)
    await client.query(
      `UPDATE drones SET status = CASE WHEN status IN ('en_route','on_scene') THEN 'returning' ELSE status END,
              incident_id = NULL, eta_seconds = NULL, updated_at = now()
        WHERE incident_id IN (SELECT id FROM incidents WHERE user_id = $1)`, [uid]
    );
    await client.query('DELETE FROM users WHERE id = $1', [uid]); // cascades: medical ID, contacts, incidents(+events), share tokens, MFA codes
    await audit.record('account_deleted', { userId: null, actorId: null, meta: { deletedUserId: uid }, ip: req.ip || null }, client);
  });
  realtime.disconnectUser(uid);
  res.status(204).end();
}));

module.exports = router;
