'use strict';
const db = require('../db');
const ai = require('./ai');
const realtime = require('./realtime');
const medical = require('./medical');
const { toIso, HttpError } = require('../util');

const SELECT = `SELECT i.*, u.name AS user_name, u.phone AS user_phone
                  FROM incidents i JOIN users u ON u.id = i.user_id`;
const CLOSED = ['resolved', 'cancelled'];

function rowToIncident(r) {
  return {
    id: r.id, userId: r.user_id, trigger: r.trigger, status: r.status, severity: r.severity,
    lat: r.lat, lng: r.lng, accuracy: r.accuracy, note: r.note,
    triage: r.triage, impactScore: r.impact_score,
    medicalSnapshot: r.medical_snapshot, contactsSnapshot: r.contacts_snapshot || [],
    user: { name: r.user_name, phone: r.user_phone },
    droneId: r.drone_id, responderEtaMinutes: r.responder_eta_minutes,
    createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at),
  };
}

const rowToEvent = (r) => ({
  id: r.id, incidentId: r.incident_id, type: r.type, message: r.message, data: r.data || {}, createdAt: toIso(r.created_at),
});

async function getIncident(id) {
  const { rows } = await db.query(`${SELECT} WHERE i.id = $1`, [id]);
  return rows[0] ? rowToIncident(rows[0]) : null;
}

async function getEvents(id) {
  const { rows } = await db.query('SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at ASC', [id]);
  return rows.map(rowToEvent);
}

async function listIncidents({ userId = null, statuses = null, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (userId) { params.push(userId); where.push(`i.user_id = $${params.length}`); }
  if (statuses && statuses.length) { params.push(statuses); where.push(`i.status = ANY($${params.length})`); }
  params.push(limit);
  const { rows } = await db.query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows.map(rowToIncident);
}

async function addEvent(incidentId, type, message, data = {}, client = db) {
  const { rows } = await client.query(
    'INSERT INTO incident_events (incident_id, type, message, data) VALUES ($1,$2,$3,$4) RETURNING *',
    [incidentId, type, message, data]
  );
  return rowToEvent(rows[0]);
}

async function addEventAndBroadcast(incidentId, type, message, data = {}) {
  await addEvent(incidentId, type, message, data);
  await db.query('UPDATE incidents SET updated_at = now() WHERE id = $1', [incidentId]);
  const inc = await getIncident(incidentId);
  if (inc) realtime.emitIncidentUpdated(inc);
  return inc;
}

const TRIGGER_LABEL = {
  sos: 'SOS triggered', impact: 'Impact detected', route_deviation: 'Route deviation detected',
  timer_expired: 'Journey timer expired', manual: 'Emergency reported',
};

async function createIncident(user, body) {
  const shareMedical = body.shareMedical !== false;
  const [med, contacts] = await Promise.all([
    shareMedical ? medical.getMedicalId(user.id) : Promise.resolve(null),
    medical.listContacts(user.id),
  ]);

  let impactScore = null;
  if (Array.isArray(body.sensorWindow) && body.sensorWindow.length) {
    const s = await ai.scoreMotion({ samples: body.sensorWindow });
    impactScore = { impactDetected: !!s.impactDetected, score: s.score, peakG: s.peakG, classification: s.classification };
  } else if (body.impact) {
    impactScore = {
      impactDetected: true, score: null, peakG: body.impact.peakG,
      classification: body.impact.classification || null,
    };
  }

  const triage = await ai.triage({
    trigger: body.trigger,
    impact: body.impact || undefined,
    impactScore: impactScore || undefined,
    note: body.note || undefined,
    medical: med || undefined,
  });

  const id = await db.tx(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO incidents (user_id, trigger, severity, lat, lng, accuracy, note, triage, impact_score, medical_snapshot, contacts_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [user.id, body.trigger, triage.severity, body.lat, body.lng, body.accuracy ?? null, body.note ?? null,
        triage, impactScore, med, JSON.stringify(contacts)]
    );
    const incId = rows[0].id;
    await addEvent(incId, 'created', TRIGGER_LABEL[body.trigger] || 'Incident created',
      { trigger: body.trigger, lat: body.lat, lng: body.lng }, client);
    await addEvent(incId, 'triaged', `Triage: ${triage.severity.toUpperCase()} (${triage.source})`,
      { severity: triage.severity, source: triage.source, confidence: triage.confidence }, client);
    if (!shareMedical) {
      await addEvent(incId, 'medical_withheld', 'Medical ID withheld by user consent', {}, client);
    }
    return incId;
  });

  const inc = await getIncident(id);
  realtime.emitIncidentNew(inc);
  return inc;
}

/** Load incident or throw 404; enforce owner/responder visibility. */
async function loadForUser(id, user) {
  const inc = await getIncident(id);
  if (!inc || (user.role !== 'responder' && inc.userId !== user.id)) throw new HttpError(404, 'Incident not found');
  return inc;
}

function assertOpen(inc) {
  if (CLOSED.includes(inc.status)) throw new HttpError(409, `Incident is already ${inc.status}`);
}

async function setFields(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  await db.query(`UPDATE incidents SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
}

module.exports = {
  rowToIncident, getIncident, getEvents, listIncidents, addEvent, addEventAndBroadcast,
  createIncident, loadForUser, assertOpen, setFields, CLOSED,
};
