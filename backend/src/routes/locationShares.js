'use strict';
/**
 * Live location sharing links.
 *   Owner API (auth):  POST/GET /api/location-shares, POST /api/location-shares/:id/location, DELETE /api/location-shares/:id
 *   Public (no auth):  GET /api/public/track/:token (JSON), GET /t/:token (HTML page), GET /share-assets/track.js
 * The public side follows the /m/:token posture: unguessable token, no-store, noindex, rate limited,
 * and a deliberately tiny payload (first name + position + incident status only).
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../auth');
const shares = require('../services/locationShares');
const realtime = require('../services/realtime');
const audit = require('../services/audit');
const config = require('../config');
const { limiter } = require('../rateLimit');
const { ah, parse, HttpError } = require('../util');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_MINUTES = 15;
const MAX_MINUTES = 1440;

const createLimiter = limiter('locationShareCreate', { windowMs: 10 * 60 * 1000, limit: 30, by: 'user', message: 'Too many share links created, please wait a few minutes' });
const updateLimiter = limiter('locationShareUpdate', { windowMs: 60 * 1000, limit: 60, by: 'user', message: 'Too many location updates, please slow down' });
const publicLimiter = limiter('publicTrack', { windowMs: 60 * 1000, limit: 60, by: 'ip', message: 'Too many requests, please slow down' });

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const accuracy = z.number().min(0).max(100000).optional().nullable();

const createSchema = z.object({
  durationMinutes: z.number().int().min(MIN_MINUTES).max(MAX_MINUTES).optional().default(60),
  incidentId: z.string().regex(UUID_RE, 'incidentId must be a UUID').optional().nullable(),
  lat: lat.optional().nullable(),
  lng: lng.optional().nullable(),
  accuracy,
}).refine((b) => (b.lat == null) === (b.lng == null), { message: 'lat and lng must be sent together', path: ['lat'] });

const locationSchema = z.object({ lat, lng, accuracy });

function baseUrl(req) {
  return config.publicUrl || `${req.protocol}://${req.get('host')}`;
}

// ------------------------------------------------------------------ owner API
const api = express.Router();
api.use('/location-shares', requireAuth);
api.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) return next(new HttpError(404, 'Share not found'));
  return next();
});

api.post('/location-shares', createLimiter, ah(async (req, res) => {
  const body = parse(createSchema, req.body || {});
  if (body.incidentId) {
    const { rows } = await db.query('SELECT user_id FROM incidents WHERE id = $1', [body.incidentId]);
    if (!rows[0] || rows[0].user_id !== req.user.id) throw new HttpError(404, 'Incident not found');
  }
  const { token, share } = await shares.createShare(req.user.id, {
    durationMinutes: body.durationMinutes,
    incidentId: body.incidentId || null,
    lat: body.lat ?? null, lng: body.lng ?? null, accuracy: body.accuracy ?? null,
  });
  await audit.fromReq(req, 'location_share_created', {
    meta: { shareId: share.id, incidentId: share.incidentId, durationMinutes: body.durationMinutes, expiresAt: share.expiresAt },
  });
  const url = `/t/${token}`;
  res.status(201).json({ id: share.id, token, url, absoluteUrl: `${baseUrl(req)}${url}`, expiresAt: share.expiresAt, incidentId: share.incidentId });
}));

api.get('/location-shares', ah(async (req, res) => {
  res.json(await shares.listActive(req.user.id));
}));

api.post('/location-shares/:id/location', updateLimiter, ah(async (req, res) => {
  const body = parse(locationSchema, req.body || {});
  const row = await shares.getOwned(req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Share not found');
  if (!shares.isActive(row)) throw new HttpError(410, 'This share has ended');
  const updated = await shares.updateLocation(row.id, { lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null });
  realtime.emitShareLocation(row.id, {
    shareId: row.id, lat: updated.lat, lng: updated.lng, accuracy: updated.accuracy, updatedAt: updated.updatedAt,
  });
  res.status(204).end();
}));

api.delete('/location-shares/:id', ah(async (req, res) => {
  const row = await shares.getOwned(req.params.id, req.user.id);
  if (!row) throw new HttpError(404, 'Share not found');
  if (!row.revoked_at) {
    await shares.revoke(row.id);
    await audit.fromReq(req, 'location_share_revoked', { meta: { shareId: row.id, incidentId: row.incident_id } });
  }
  res.status(204).end();
}));

// ------------------------------------------------------------------ public JSON
api.get('/public/track/:token', publicLimiter, ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  const row = await shares.findByToken(req.params.token);
  if (!row) throw new HttpError(404, 'Share link is invalid');
  if (!shares.isActive(row)) throw new HttpError(410, 'Location sharing has ended');
  res.json(shares.toPublic(row));
}));

// ------------------------------------------------------------------ public HTML page /t/:token
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PAGE_CSS = `
*{box-sizing:border-box}html,body{margin:0}
body{font-family:Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#eef0f5;color:#1e293b;line-height:1.45;-webkit-font-smoothing:antialiased}
.wrap{max-width:560px;margin:0 auto;padding:16px 16px 28px}
header{display:flex;align-items:center;gap:12px;margin:4px 0 16px}
.logo{width:40px;height:40px;border-radius:12px;background:#f48c25;color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;box-shadow:4px 4px 10px rgba(163,177,198,.6),-4px -4px 10px rgba(255,255,255,.9)}
header h1{font-size:15px;font-weight:800;margin:0;color:#1e293b}header small{display:block;color:#94a3b8;font-weight:600;font-size:12px}
.card{background:#eef0f5;border-radius:20px;padding:16px;margin-bottom:14px;box-shadow:6px 6px 14px rgba(163,177,198,.55),-6px -6px 14px rgba(255,255,255,.95)}
.title{font-size:22px;font-weight:800;margin:0;color:#1e293b}.sub{color:#64748b;font-size:14px;font-weight:500;margin-top:2px}
.label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;margin:0 0 8px}
.mapwell{border-radius:16px;overflow:hidden;box-shadow:inset 4px 4px 10px rgba(163,177,198,.55),inset -4px -4px 10px rgba(255,255,255,.9);padding:6px;background:#eef0f5}
#map{height:360px;border-radius:12px;background:#e2e8f0}
.mapwell{position:relative}
.nofix{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:24px;color:#64748b;font-weight:600;pointer-events:none}
.nofix .pulse{width:14px;height:14px;border-radius:50%;background:#f48c25;box-shadow:0 0 0 0 rgba(244,140,37,.5);animation:nf 1.6s infinite}
@keyframes nf{to{box-shadow:0 0 0 18px rgba(244,140,37,0)}}
@media (prefers-reduced-motion:reduce){.nofix .pulse{animation:none}}
.row{display:flex;gap:12px}.row>div{flex:1}
.stat{border-radius:14px;padding:10px 12px;box-shadow:inset 3px 3px 8px rgba(163,177,198,.5),inset -3px -3px 8px rgba(255,255,255,.9)}
.stat b{display:block;font-size:15px;font-weight:800;color:#1e293b;font-variant-numeric:tabular-nums}.stat span{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
.live{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;color:#f48c25;text-transform:uppercase;letter-spacing:.08em}
.dot{width:8px;height:8px;border-radius:50%;background:#f48c25;box-shadow:0 0 0 0 rgba(244,140,37,.6);animation:pulse 1.8s infinite}
.live.stale{color:#94a3b8}.live.stale .dot{background:#94a3b8;animation:none}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(244,140,37,.55)}70%{box-shadow:0 0 0 10px rgba(244,140,37,0)}100%{box-shadow:0 0 0 0 rgba(244,140,37,0)}}
.pill{display:inline-block;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:800;margin:0 6px 6px 0;background:#eef0f5;color:#475569;box-shadow:2px 2px 5px rgba(163,177,198,.55),-2px -2px 5px rgba(255,255,255,.95)}
.pill.danger{color:#ef4444}.pill.ok{color:#16a34a}.pill.accent{color:#f48c25}
.incident{border-left:4px solid #ef4444}
.btns{display:flex;gap:12px}
.btn{flex:1;display:block;text-align:center;text-decoration:none;font-weight:800;font-size:15px;padding:14px;border-radius:16px;min-height:48px}
.btn.primary{background:#f48c25;color:#fff;box-shadow:4px 4px 12px rgba(244,140,37,.35),-4px -4px 10px rgba(255,255,255,.9)}
.btn.ghost{background:#eef0f5;color:#334155;box-shadow:4px 4px 10px rgba(163,177,198,.55),-4px -4px 10px rgba(255,255,255,.95)}
.btn.sos{background:#ef4444;color:#fff;box-shadow:4px 4px 12px rgba(239,68,68,.3),-4px -4px 10px rgba(255,255,255,.9)}
.muted{color:#94a3b8;font-size:13px;font-weight:600}
.hidden{display:none}
footer{color:#94a3b8;font-size:12px;font-weight:600;text-align:center;padding:8px 0}
.leaflet-container{font-family:inherit}`;

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap">`;

function head(title, extra = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title>${FONT_LINKS}${extra}<style>${PAGE_CSS}</style></head>`;
}

const HEADER = '<header><div class="logo">R</div><h1>ResQMe<small>Live location</small></h1></header>';

function renderPage(token, data) {
  const leaflet = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">';
  const incident = data.incident;
  return `${head(`${data.name} – live location · ResQMe`, leaflet)}
<body data-token="${esc(token)}"><div class="wrap">
${HEADER}
<div class="card">
  <span id="live" class="live"><span class="dot"></span><span id="liveText">Live</span></span>
  <p class="title" style="margin-top:6px">${esc(data.name)} is sharing their location</p>
  <div class="sub">This page refreshes automatically every 10 seconds.</div>
</div>
<div id="incident" class="card incident${incident ? '' : ' hidden'}">
  <p class="label">Emergency in progress</p>
  <div id="incidentPills"></div>
  <div class="muted" id="incidentHint">Emergency services and contacts have been alerted by ResQMe.</div>
</div>
<div class="card">
  <div class="mapwell"><div id="map" role="img" aria-label="Map showing ${esc(data.name)}'s last known location"></div>
    <div id="noFix" class="nofix${data.lat == null ? '' : ' hidden'}"><span class="pulse"></span>Waiting for ${esc(data.name)}'s phone to get a GPS fix…<br><small>The map appears automatically.</small></div></div>
</div>
<div class="card row">
  <div class="stat"><span>Location</span><b id="updated">–</b></div>
  <div class="stat"><span>Sharing ends</span><b id="expires">–</b></div>
</div>
<div class="btns" style="margin-bottom:14px">
  <a id="directions" class="btn primary" href="#" target="_blank" rel="noopener noreferrer">Open in Maps</a>
  <a class="btn sos" href="tel:112">Call 112</a>
</div>
<footer>Shared privately with ResQMe. Only people with this link can see it.</footer>
</div>
<script id="initial" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script src="/share-assets/track.js"></script>
</body></html>`;
}

function renderEnded(status) {
  const title = status === 410 ? 'Sharing has ended' : 'Link not found';
  const msg = status === 410
    ? 'This live location link has expired or was stopped by the person who shared it.'
    : 'This live location link is invalid. Check that you copied the whole link.';
  return `${head(`${title} – ResQMe`)}
<body><div class="wrap">${HEADER}
<div class="card"><p class="title">${title}</p><div class="sub">${msg}</div></div>
<div class="btns"><a class="btn sos" href="tel:112">Call 112 – Emergency</a></div>
</div></body></html>`;
}

const TRACK_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'track.js'), 'utf8');

const page = express.Router();
page.get('/share-assets/track.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(TRACK_JS);
});

page.get('/t/:token', publicLimiter, ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  const row = await shares.findByToken(req.params.token);
  if (!row) return res.status(404).type('html').send(renderEnded(404));
  if (!shares.isActive(row)) return res.status(410).type('html').send(renderEnded(410));
  return res.type('html').send(renderPage(req.params.token, shares.toPublic(row)));
}));

module.exports = { api, page, MIN_MINUTES, MAX_MINUTES };
