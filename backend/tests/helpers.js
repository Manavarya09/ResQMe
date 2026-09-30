'use strict';
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const drones = require('../src/services/drones');
const { signToken, rowToUser } = require('../src/auth');

const TABLES = ['audit_log', 'mfa_recovery_codes', 'incident_events', 'incidents', 'share_tokens', 'contacts', 'medical_ids', 'hazards', 'drones', 'users'];

async function resetDb() {
  await db.migrate();
  await db.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await drones.ensureFleet();
}

let counter = 0;
async function registerUser(app, overrides = {}) {
  counter += 1;
  const body = {
    name: `Test User ${counter}`,
    email: `user${counter}.${Date.now()}@example.com`,
    password: 'Password123',
    phone: '+91 90000 0000' + (counter % 10),
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, password: body.password };
}

async function createResponder() {
  counter += 1;
  const hash = await bcrypt.hash('Responder@123', 4);
  const { rows } = await db.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'responder') RETURNING *",
    [`Responder ${counter}`, `responder${counter}.${Date.now()}@resqme.app`, hash]
  );
  const user = rowToUser(rows[0]);
  return { token: signToken(user), user };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { resetDb, registerUser, createResponder, auth };
