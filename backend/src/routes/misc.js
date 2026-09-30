'use strict';
/** Hazards, drones and chat-proxy routes. */
const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../auth');
const hazards = require('../services/hazards');
const drones = require('../services/drones');
const incidents = require('../services/incidents');
const ai = require('../services/ai');
const realtime = require('../services/realtime');
const { limiter } = require('../rateLimit');
const { ah, parse, zLat, zLng, HAZARD_TYPES, SEVERITIES } = require('../util');

const router = express.Router();

const hazardLimiter = limiter('hazards', { windowMs: 10 * 60 * 1000, limit: 10, by: 'user', message: 'Too many hazard reports, please try again later' });
const chatLimiter = limiter('chat', { windowMs: 60 * 1000, limit: 30, by: 'user', message: 'Too many chat messages, please slow down' });

// ------------------------------------------------------------------ hazards
router.get('/hazards', requireAuth, ah(async (req, res) => {
  const q = parse(z.object({
    lat: zLat, lng: zLng,
    radiusKm: z.coerce.number().positive().max(100).optional().default(10),
  }), req.query);
  res.json(await hazards.getHazards(q.lat, q.lng, q.radiusKm));
}));

router.post('/hazards', requireAuth, hazardLimiter, ah(async (req, res) => {
  const body = parse(z.object({
    type: z.enum(HAZARD_TYPES),
    title: z.string().trim().min(1, 'title is required').max(140),
    description: z.string().trim().max(1000).optional().nullable(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    severity: z.enum(SEVERITIES).optional().nullable(),
  }), req.body || {});
  const hazard = await hazards.createHazard({
    type: body.type, title: body.title, description: body.description || '',
    lat: body.lat, lng: body.lng, severity: body.severity || 'medium', userId: req.user.id,
  });
  realtime.emitHazardNew(hazard);
  res.status(201).json(hazard);
}));

// ------------------------------------------------------------------ drones
router.get('/drones', requireAuth, ah(async (req, res) => {
  res.json(await drones.listDrones());
}));

// ------------------------------------------------------------------ chat proxy
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).min(1, 'messages must not be empty').max(50),
  incidentId: z.string().uuid().optional().nullable(),
  context: z.record(z.string(), z.any()).optional().nullable(),
});

router.post('/chat', requireAuth, chatLimiter, ah(async (req, res) => {
  const body = parse(chatSchema, req.body || {});
  const context = { country: req.user.country, ...(body.context || {}) };
  if (body.incidentId) {
    const inc = await incidents.getIncident(body.incidentId);
    if (inc && (inc.userId === req.user.id || req.user.role === 'responder')) {
      Object.assign(context, {
        incidentActive: !incidents.CLOSED.includes(inc.status),
        trigger: inc.trigger,
        location: { lat: inc.lat, lng: inc.lng },
      });
      if (inc.medicalSnapshot && context.medical === undefined) context.medical = inc.medicalSnapshot;
    }
  }
  res.json(await ai.chat({ messages: body.messages, context }));
}));

module.exports = router;
