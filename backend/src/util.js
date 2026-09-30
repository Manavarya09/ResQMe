'use strict';
const { z } = require('zod');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Wrap an async express handler so rejections reach the error middleware. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse `data` with a zod schema or throw a 400 HttpError with a readable message. */
function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path && issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, `${where}${issue.message}`);
  }
  return result.data;
}

const toIso = (d) => (d ? new Date(d).toISOString() : null);

// ---- Geo helpers ----
const EARTH_R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance in metres. */
function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Point reached travelling `distM` metres from (lat,lng) on `bearingDeg`. */
function destinationPoint(lat, lng, bearingDeg, distM) {
  const d = distM / EARTH_R;
  const b = rad(bearingDeg);
  const p1 = rad(lat);
  const l1 = rad(lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lng: ((deg(l2) + 540) % 360) - 180 };
}

/** Deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const TRIGGERS = ['sos', 'impact', 'route_deviation', 'timer_expired', 'manual'];
const HAZARD_TYPES = ['crime', 'weather', 'flood', 'heat', 'fog', 'storm', 'accident', 'other'];

module.exports = {
  HttpError, ah, parse, toIso, haversineM, destinationPoint, seededRandom,
  zLat: lat, zLng: lng, SEVERITIES, TRIGGERS, HAZARD_TYPES,
};
