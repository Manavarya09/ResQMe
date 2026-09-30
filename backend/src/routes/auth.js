'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { signToken, rowToUser, requireAuth } = require('../auth');
const { ah, parse, HttpError } = require('../util');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts, please try again later' }),
});

const registerSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  email: z.string().trim().toLowerCase().email('invalid email'),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'email is required'),
  password: z.string().min(1, 'password is required'),
});

router.post('/auth/register', authLimiter, ah(async (req, res) => {
  const body = parse(registerSchema, req.body || {});
  const hash = await bcrypt.hash(body.password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password_hash, phone) VALUES ($1,$2,$3,$4) RETURNING *',
      [body.name, body.email, hash, body.phone || null]
    );
    const user = rowToUser(rows[0]);
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}));

router.post('/auth/login', authLimiter, ah(async (req, res) => {
  const body = parse(loginSchema, req.body || {});
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [body.email]);
  const ok = rows[0] && (await bcrypt.compare(body.password, rows[0].password_hash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');
  const user = rowToUser(rows[0]);
  res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, (req, res) => res.json(req.user));

const patchMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter ISO code').transform((s) => s.toUpperCase()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.patch('/me', requireAuth, ah(async (req, res) => {
  const body = parse(patchMeSchema, req.body || {});
  const { rows } = await db.query(
    `UPDATE users SET
       name = COALESCE($2, name),
       phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
       country = COALESCE($5, country),
       settings = settings || $6::jsonb
     WHERE id = $1 RETURNING *`,
    [req.user.id, body.name ?? null, body.phone !== undefined, body.phone ?? null, body.country ?? null, JSON.stringify(body.settings || {})]
  );
  res.json(rowToUser(rows[0]));
}));

module.exports = router;
