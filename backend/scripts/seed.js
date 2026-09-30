'use strict';
/** Seed responder + demo accounts and the drone fleet (idempotent). Usage: npm run seed */
require('../src/config');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const drones = require('../src/services/drones');
const { putMedicalId } = require('../src/services/medical');

const RESPONDER = { name: 'Delhi Control Room', email: 'responder@resqme.app', password: 'Responder@123', phone: '+91 11 2345 6789', role: 'responder' };
const DEMO = { name: 'Priya Sharma', email: 'demo@resqme.app', password: 'Demo@1234', phone: '+91 98100 12345', role: 'user' };

async function upsertUser(u) {
  const hash = await bcrypt.hash(u.password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, phone=EXCLUDED.phone, role=EXCLUDED.role,
       -- demo accounts always come back with MFA off
       mfa_enabled=false, mfa_secret=NULL, mfa_pending_secret=NULL, mfa_last_step=NULL
     RETURNING id`,
    [u.name, u.email, hash, u.phone, u.role]
  );
  await db.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [rows[0].id]);
  return rows[0].id;
}

async function seed() {
  await db.migrate({ log: true });
  await upsertUser(RESPONDER);
  const demoId = await upsertUser(DEMO);

  await putMedicalId(demoId, {
    bloodType: 'B+',
    allergies: ['Penicillin', 'Peanuts'],
    conditions: ['Asthma'],
    medications: [{ name: 'Salbutamol inhaler', dosage: '100 mcg', frequency: 'as needed' }],
    organDonor: true,
    dateOfBirth: '1996-04-12',
    heightCm: 162,
    weightKg: 56,
    notes: 'Carries inhaler in bag (front pocket).',
  });

  await db.query('DELETE FROM contacts WHERE user_id = $1', [demoId]);
  await db.query(
    `INSERT INTO contacts (user_id, name, phone, relation, is_primary) VALUES
      ($1, 'Rahul Sharma', '+91 98100 54321', 'Brother', true),
      ($1, 'Anita Sharma', '+91 98111 22334', 'Mother', false)`,
    [demoId]
  );

  await drones.ensureFleet();
  await db.query(
    `UPDATE drones SET status='idle', incident_id=NULL, eta_seconds=NULL, battery_pct=100, lat=v.lat, lng=v.lng, base_lat=v.lat, base_lng=v.lng
       FROM (VALUES ${drones.DEFAULT_FLEET.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::float8, $${i * 3 + 3}::float8)`).join(',')}) AS v(id, lat, lng)
      WHERE drones.id = v.id AND drones.status = 'idle'`,
    drones.DEFAULT_FLEET.flatMap((d) => [d.id, d.lat, d.lng])
  );

  console.log('[seed] responder: responder@resqme.app / Responder@123');
  console.log('[seed] demo user: demo@resqme.app / Demo@1234 (medical ID + 2 contacts)');
  console.log(`[seed] drones: ${drones.DEFAULT_FLEET.map((d) => d.name).join(', ')}`);
}

seed()
  .then(() => db.close())
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    await db.close();
    process.exit(1);
  });
