'use strict';
const express = require('express');
const { z } = require('zod');
const { requireAuth, requireRole } = require('../auth');
const incidents = require('../services/incidents');
const drones = require('../services/drones');
const realtime = require('../services/realtime');
const { ah, parse, HttpError, zLat, zLng, TRIGGERS } = require('../util');

const router = express.Router();
router.use('/incidents', requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'acknowledged', 'dispatched', 'resolved', 'cancelled'];
const num = z.number().finite();

const sampleSchema = z.object({
  t: num, ax: num, ay: num, az: num,
  gx: num.optional().default(0), gy: num.optional().default(0), gz: num.optional().default(0),
});

const createSchema = z.object({
  trigger: z.enum(TRIGGERS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  sensorWindow: z.array(sampleSchema).max(3000).optional().nullable(),
  impact: z.object({
    peakG: num.min(0),
    freeFallMs: num.min(0).optional().nullable(),
    classification: z.string().max(40).optional().nullable(),
  }).optional().nullable(),
  shareMedical: z.boolean().optional().default(true),
});

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return next(new HttpError(404, 'Incident not found'));
  return next();
});

router.post('/incidents', ah(async (req, res) => {
  const body = parse(createSchema, req.body || {});
  const inc = await incidents.createIncident(req.user, body);
  res.status(201).json(inc);
}));

router.get('/incidents', ah(async (req, res) => {
  let statuses = null;
  if (req.query.status) {
    statuses = String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
    const bad = statuses.find((s) => !STATUSES.includes(s));
    if (bad) throw new HttpError(400, `Invalid status: ${bad}`);
  }
  const list = await incidents.listIncidents({
    userId: req.user.role === 'responder' ? null : req.user.id,
    statuses,
  });
  res.json(list);
}));

router.get('/incidents/:id', ah(async (req, res) => {
  const inc = await incidents.loadForUser(req.params.id, req.user);
  res.json({ ...inc, events: await incidents.getEvents(inc.id) });
}));

router.post('/incidents/:id/location', ah(async (req, res) => {
  const { lat, lng } = parse(z.object({ lat: zLat, lng: zLng }), req.body || {});
  const inc = await incidents.loadForUser(req.params.id, req.user);
  if (inc.userId !== req.user.id) throw new HttpError(403, 'Only the incident owner can update its location');
  incidents.assertOpen(inc);
  await incidents.setFields(inc.id, { lat, lng });
  realtime.emitIncidentLocation(inc.userId, { incidentId: inc.id, lat, lng });
  res.status(204).end();
}));

router.post('/incidents/:id/cancel', ah(async (req, res) => {
  const inc = await incidents.loadForUser(req.params.id, req.user);
  if (inc.userId !== req.user.id) throw new HttpError(403, 'Only the incident owner can cancel it');
  incidents.assertOpen(inc);
  await incidents.setFields(inc.id, { status: 'cancelled' });
  await incidents.addEvent(inc.id, 'cancelled', 'Cancelled by user (false alarm)');
  await drones.releaseForIncident(inc.id, inc.userId);
  const updated = await incidents.getIncident(inc.id);
  realtime.emitIncidentUpdated(updated);
  res.json(updated);
}));

router.post('/incidents/:id/ack', requireRole('responder'), ah(async (req, res) => {
  const { etaMinutes } = parse(z.object({ etaMinutes: z.coerce.number().int().min(0).max(600) }), req.body || {});
  const inc = await incidents.loadForUser(req.params.id, req.user);
  incidents.assertOpen(inc);
  // keep `dispatched` if a drone is already flying; otherwise acknowledged
  const status = inc.status === 'dispatched' ? 'dispatched' : 'acknowledged';
  await incidents.setFields(inc.id, { status, responder_id: req.user.id, responder_eta_minutes: etaMinutes });
  await incidents.addEvent(inc.id, 'acknowledged', `Acknowledged by ${req.user.name} · ETA ${etaMinutes} min`,
    { responderId: req.user.id, responderName: req.user.name, etaMinutes });
  const updated = await incidents.getIncident(inc.id);
  realtime.emitIncidentUpdated(updated);
  res.json(updated);
}));

router.post('/incidents/:id/drone', ah(async (req, res) => {
  const inc = await incidents.loadForUser(req.params.id, req.user);
  incidents.assertOpen(inc);
  if (inc.droneId) {
    const existing = await drones.getDrone(inc.droneId);
    if (existing && existing.incidentId === inc.id && existing.status !== 'idle') return res.json(existing);
  }
  const { drone, repositioned } = await drones.assignDrone(inc);
  await incidents.setFields(inc.id, { status: 'dispatched', drone_id: drone.id });
  await incidents.addEvent(inc.id, 'drone_dispatched',
    `${drone.name} dispatched${repositioned ? ' from nearest regional station' : ''} · ETA ${Math.max(1, Math.round(drone.etaSeconds / 60))} min`,
    { droneId: drone.id, etaSeconds: drone.etaSeconds, repositioned, by: req.user.role });
  const updated = await incidents.getIncident(inc.id);
  const out = { ...drone, batteryPct: Math.round(drone.batteryPct * 100) / 100 };
  realtime.emitIncidentUpdated(updated);
  realtime.emitDroneUpdate(out, inc.userId);
  return res.json(out);
}));

router.post('/incidents/:id/resolve', requireRole('responder'), ah(async (req, res) => {
  const inc = await incidents.loadForUser(req.params.id, req.user);
  incidents.assertOpen(inc);
  await incidents.setFields(inc.id, { status: 'resolved' });
  await incidents.addEvent(inc.id, 'resolved', `Resolved by ${req.user.name}`, { responderId: req.user.id });
  await drones.releaseForIncident(inc.id, inc.userId);
  const updated = await incidents.getIncident(inc.id);
  realtime.emitIncidentUpdated(updated);
  res.json(updated);
}));

module.exports = router;
