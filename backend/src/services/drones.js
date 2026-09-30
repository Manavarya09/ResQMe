'use strict';
/**
 * Simulated drone fleet (spec section 3, "Drones").
 * Tick 1 s, speed 15 m/s, on_scene within 30 m, battery −0.05 %/s while flying.
 * `stepDrone` is pure; `tick` loads active drones from the DB, steps them and persists/emits.
 */
const db = require('../db');
const realtime = require('./realtime');
const { HttpError, haversineM, destinationPoint } = require('../util');

const SPEED_MPS = 15;
const ON_SCENE_M = 30;
const AT_BASE_M = 5;
const BATTERY_DRAIN_PER_S = 0.05;
const MAX_DIRECT_RANGE_M = 25000;
const TICK_MS = 1000;

const DEFAULT_FLEET = [
  { id: 'drone-1', name: 'Garuda-1', lat: 28.6315, lng: 77.2167 }, // Connaught Place
  { id: 'drone-2', name: 'Garuda-2', lat: 28.5245, lng: 77.2066 }, // Saket
  { id: 'drone-3', name: 'Garuda-3', lat: 28.5921, lng: 77.0460 }, // Dwarka
];

function rowToDrone(r) {
  return {
    id: r.id, name: r.name, status: r.status, lat: r.lat, lng: r.lng,
    baseLat: r.base_lat, baseLng: r.base_lng,
    batteryPct: Math.round(r.battery_pct * 100) / 100,
    incidentId: r.incident_id, etaSeconds: r.eta_seconds,
  };
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

function moveToward(d, tLat, tLng, dtSec) {
  const dist = haversineM(d.lat, d.lng, tLat, tLng);
  const step = SPEED_MPS * dtSec;
  if (dist <= step) return { lat: tLat, lng: tLng, remaining: 0 };
  const p = destinationPoint(d.lat, d.lng, bearingDeg(d.lat, d.lng, tLat, tLng), step);
  return { lat: p.lat, lng: p.lng, remaining: haversineM(p.lat, p.lng, tLat, tLng) };
}

/**
 * Pure simulation step.
 * @param {object} drone  Drone (API shape)
 * @param {{lat:number,lng:number}|null} target  incident location for en_route / on_scene
 * @param {number} dtSec
 * @returns {{ drone: object, changed: boolean, event: null|'arrived_scene'|'arrived_base' }}
 */
function stepDrone(drone, target, dtSec = 1) {
  const d = { ...drone };
  const drain = () => { d.batteryPct = Math.max(0, Math.round((d.batteryPct - BATTERY_DRAIN_PER_S * dtSec) * 1000) / 1000); };

  if (d.status === 'en_route' && target) {
    const m = moveToward(d, target.lat, target.lng, dtSec);
    d.lat = m.lat; d.lng = m.lng;
    drain();
    if (m.remaining <= ON_SCENE_M) {
      d.status = 'on_scene';
      d.etaSeconds = 0;
      return { drone: d, changed: true, event: 'arrived_scene' };
    }
    d.etaSeconds = Math.ceil(m.remaining / SPEED_MPS);
    return { drone: d, changed: true, event: null };
  }
  if (d.status === 'on_scene' && target) {
    // hover; if the incident location moved away, resume flight
    if (haversineM(d.lat, d.lng, target.lat, target.lng) > ON_SCENE_M) {
      d.status = 'en_route';
      return stepDrone(d, target, dtSec);
    }
    return { drone: d, changed: false, event: null };
  }
  if (d.status === 'returning') {
    const m = moveToward(d, d.baseLat, d.baseLng, dtSec);
    d.lat = m.lat; d.lng = m.lng;
    drain();
    if (m.remaining <= AT_BASE_M) {
      d.lat = d.baseLat; d.lng = d.baseLng;
      d.status = 'idle';
      d.incidentId = null;
      d.etaSeconds = null;
      d.batteryPct = 100; // battery swap at base
      return { drone: d, changed: true, event: 'arrived_base' };
    }
    d.etaSeconds = Math.ceil(m.remaining / SPEED_MPS);
    return { drone: d, changed: true, event: null };
  }
  return { drone: d, changed: false, event: null };
}

async function ensureFleet() {
  for (const f of DEFAULT_FLEET) {
    await db.query(
      `INSERT INTO drones (id, name, status, lat, lng, base_lat, base_lng, battery_pct)
       VALUES ($1,$2,'idle',$3,$4,$3,$4,100) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.name, f.lat, f.lng]
    );
  }
}

async function listDrones() {
  const { rows } = await db.query('SELECT * FROM drones ORDER BY id');
  return rows.map(rowToDrone);
}

async function getDrone(id) {
  const { rows } = await db.query('SELECT * FROM drones WHERE id = $1', [id]);
  return rows[0] ? rowToDrone(rows[0]) : null;
}

async function saveDrone(client, d) {
  await client.query(
    `UPDATE drones SET status=$2, lat=$3, lng=$4, base_lat=$5, base_lng=$6, battery_pct=$7,
       incident_id=$8, eta_seconds=$9, updated_at=now() WHERE id=$1`,
    [d.id, d.status, d.lat, d.lng, d.baseLat, d.baseLng, d.batteryPct, d.incidentId, d.etaSeconds]
  );
}

/**
 * Assign the nearest idle drone to an incident (repositioning it to a regional base 2–4 km away if
 * none is within 25 km). Returns { drone, repositioned }. Caller updates the incident.
 */
async function assignDrone(incident, rand = Math.random) {
  return db.tx(async (client) => {
    const { rows } = await client.query("SELECT * FROM drones WHERE status = 'idle' ORDER BY id FOR UPDATE");
    if (!rows.length) throw new HttpError(409, 'No drones available right now');
    const candidates = rows.map(rowToDrone)
      .map((d) => ({ d, dist: haversineM(d.lat, d.lng, incident.lat, incident.lng) }))
      .sort((a, b) => a.dist - b.dist);
    let { d: drone, dist } = candidates[0];
    let repositioned = false;
    if (dist > MAX_DIRECT_RANGE_M) {
      const base = destinationPoint(incident.lat, incident.lng, rand() * 360, 2000 + rand() * 2000);
      drone = { ...drone, lat: base.lat, lng: base.lng, baseLat: base.lat, baseLng: base.lng };
      dist = haversineM(base.lat, base.lng, incident.lat, incident.lng);
      repositioned = true;
    }
    drone = { ...drone, status: 'en_route', incidentId: incident.id, etaSeconds: Math.ceil(Math.max(0, dist - ON_SCENE_M) / SPEED_MPS) };
    if (dist <= ON_SCENE_M) { drone.status = 'on_scene'; drone.etaSeconds = 0; }
    await saveDrone(client, drone);
    return { drone, repositioned };
  });
}

/** Send any drone attached to the incident back to base. Returns updated drones. */
async function releaseForIncident(incidentId, ownerId) {
  const { rows } = await db.query(
    `UPDATE drones SET status='returning', eta_seconds=NULL, updated_at=now()
      WHERE incident_id=$1 AND status IN ('en_route','on_scene') RETURNING *`,
    [incidentId]
  );
  const out = rows.map(rowToDrone);
  out.forEach((d) => realtime.emitDroneUpdate(d, ownerId));
  return out;
}

/** One simulation tick over all active drones. */
async function tick(dtSec = TICK_MS / 1000) {
  const { rows } = await db.query(
    `SELECT d.*, i.lat AS i_lat, i.lng AS i_lng, i.user_id AS i_user_id, i.status AS i_status
       FROM drones d LEFT JOIN incidents i ON i.id = d.incident_id
      WHERE d.status <> 'idle'`
  );
  const results = [];
  for (const r of rows) {
    let drone = rowToDrone(r);
    drone.batteryPct = r.battery_pct; // keep full precision internally
    const closed = !r.i_status || ['resolved', 'cancelled'].includes(r.i_status);
    if (closed && (drone.status === 'en_route' || drone.status === 'on_scene')) drone.status = 'returning';
    const target = r.i_lat != null ? { lat: r.i_lat, lng: r.i_lng } : null;
    const res = stepDrone(drone, target, dtSec);
    if (!res.changed) continue;
    await saveDrone(db, res.drone);
    const out = { ...res.drone, batteryPct: Math.round(res.drone.batteryPct * 100) / 100 };
    realtime.emitDroneUpdate(out, r.i_user_id);
    if (res.event === 'arrived_scene' && r.incident_id) {
      // lazy require to avoid a module cycle
      const incidents = require('./incidents');
      await incidents.addEventAndBroadcast(r.incident_id, 'drone_on_scene', `${drone.name} is on scene`, { droneId: drone.id });
    }
    results.push({ drone: out, event: res.event });
  }
  return results;
}

let timer = null;
let running = false;
function startSimulation(intervalMs = TICK_MS) {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(intervalMs / 1000); } catch (err) { console.error('[drones] tick failed:', err.message); } finally { running = false; }
  }, intervalMs);
  if (timer.unref) timer.unref();
}
function stopSimulation() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  stepDrone, tick, ensureFleet, listDrones, getDrone, assignDrone, releaseForIncident,
  startSimulation, stopSimulation, rowToDrone, DEFAULT_FLEET,
  SPEED_MPS, ON_SCENE_M, BATTERY_DRAIN_PER_S, MAX_DIRECT_RANGE_M,
};
