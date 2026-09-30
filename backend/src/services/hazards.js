'use strict';
const db = require('../db');
const weather = require('./weather');
const { toIso, haversineM, destinationPoint, seededRandom, SEVERITIES } = require('../util');

const SEED_TEMPLATES = [
  { type: 'crime', severity: 'high', title: 'Chain-snatching reported', description: 'Multiple chain-snatching incidents reported by two-wheeler riders. Keep jewellery concealed and stay on busy roads.' },
  { type: 'crime', severity: 'high', title: 'Poorly lit stretch – women safety alert', description: 'Street lights not working on this stretch. Avoid walking alone after dark; share live location with a contact.' },
  { type: 'crime', severity: 'medium', title: 'Vehicle theft hotspot', description: 'Frequent two-wheeler and car thefts. Use steering/disc locks and park in lit, guarded areas.' },
  { type: 'crime', severity: 'medium', title: 'Pickpocketing reported near market', description: 'Crowded market area with pickpocketing complaints. Keep phone and wallet in front pockets.' },
  { type: 'crime', severity: 'medium', title: 'Harassment complaints – stay alert', description: 'Recent street-harassment complaints. Prefer well-populated routes and keep emergency dial ready.' },
  { type: 'accident', severity: 'high', title: 'Accident-prone junction', description: 'Signal-free junction with frequent collisions. Slow down and watch for cross traffic.' },
  { type: 'accident', severity: 'high', title: 'Blackspot: frequent two-wheeler crashes', description: 'Identified road-accident blackspot. Wear a helmet and avoid overtaking.' },
  { type: 'accident', severity: 'medium', title: 'Sharp blind turn – slow down', description: 'Blind curve with poor visibility of oncoming traffic, especially at night.' },
];
const SEED_COUNT = 4;
const MIN_NEARBY = 3;

function rowToHazard(r) {
  return {
    id: r.id, type: r.type, severity: r.severity, title: r.title, description: r.description,
    lat: r.lat, lng: r.lng, radiusM: r.radius_m, source: r.source,
    createdAt: toIso(r.created_at), expiresAt: toIso(r.expires_at),
  };
}

async function queryNearby(lat, lng, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const { rows } = await db.query(
    `SELECT * FROM hazards
      WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4
        AND (expires_at IS NULL OR expires_at > now())`,
    [lat - dLat, lat + dLat, lng - dLng, lng + dLng]
  );
  return rows.map(rowToHazard).filter((h) => haversineM(lat, lng, h.lat, h.lng) <= radiusM);
}

/** Deterministic seeded crime/accident hazards around the rounded query point (stable, persisted). */
function generateSeedHazards(lat, lng, radiusM) {
  const rLat = lat.toFixed(2);
  const rLng = lng.toFixed(2);
  const rand = seededRandom(`resqme:${rLat},${rLng}`);
  const centerLat = Number(rLat);
  const centerLng = Number(rLng);
  const maxDist = Math.max(200, Math.min(2500, radiusM * 0.6));
  const used = new Set();
  const out = [];
  for (let i = 0; i < SEED_COUNT; i++) {
    let idx = Math.floor(rand() * SEED_TEMPLATES.length);
    while (used.has(idx)) idx = (idx + 1) % SEED_TEMPLATES.length;
    used.add(idx);
    const tpl = SEED_TEMPLATES[idx];
    const p = destinationPoint(centerLat, centerLng, rand() * 360, 150 + rand() * (maxDist - 150));
    out.push({
      ...tpl,
      lat: Number(p.lat.toFixed(6)),
      lng: Number(p.lng.toFixed(6)),
      radiusM: 150 + Math.round(rand() * 250),
      seedKey: `seed:${rLat}:${rLng}:${i}`,
    });
  }
  return out;
}

async function ensureSeeded(lat, lng, radiusM) {
  for (const h of generateSeedHazards(lat, lng, radiusM)) {
    await db.query(
      `INSERT INTO hazards (type, severity, title, description, lat, lng, radius_m, source, seed_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'seed',$8) ON CONFLICT (seed_key) DO NOTHING`,
      [h.type, h.severity, h.title, h.description, h.lat, h.lng, h.radiusM, h.seedKey]
    );
  }
}

async function getHazards(lat, lng, radiusKm = 10) {
  const radiusM = radiusKm * 1000;
  let stored = await queryNearby(lat, lng, radiusM);
  if (stored.length < MIN_NEARBY) {
    await ensureSeeded(lat, lng, radiusM);
    stored = await queryNearby(lat, lng, radiusM);
  }
  const wx = await weather.getWeatherHazards(lat, lng);
  const all = [...wx, ...stored];
  const rank = (h) => SEVERITIES.indexOf(h.severity);
  return all.sort((a, b) => rank(b) - rank(a) || haversineM(lat, lng, a.lat, a.lng) - haversineM(lat, lng, b.lat, b.lng));
}

async function createHazard({ type, title, description = '', lat, lng, severity = 'medium', radiusM = 300, userId = null, ttlHours = 6 }) {
  const { rows } = await db.query(
    `INSERT INTO hazards (type, severity, title, description, lat, lng, radius_m, source, user_id, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'user',$8, now() + make_interval(hours => $9)) RETURNING *`,
    [type, severity, title, description, lat, lng, radiusM, userId, ttlHours]
  );
  return rowToHazard(rows[0]);
}

module.exports = { getHazards, createHazard, generateSeedHazards, rowToHazard, SEED_TEMPLATES };
