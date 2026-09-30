'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getMedicalId, putMedicalId, listContacts } = require('../services/medical');
const { randomToken } = require('../services/crypto');
const audit = require('../services/audit');
const config = require('../config');
const { ah, parse, HttpError, toIso } = require('../util');

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const SHARE_TTL_MS = 24 * 60 * 60 * 1000;

const str = z.string().trim().min(1).max(200);
const medicalSchema = z.object({
  bloodType: z.enum(BLOOD_TYPES),
  allergies: z.array(str).max(50).default([]),
  conditions: z.array(str).max(50).default([]),
  medications: z.array(z.object({
    name: str,
    dosage: z.string().trim().max(100).optional().nullable(),
    frequency: z.string().trim().max(100).optional().nullable(),
  })).max(50).default([]),
  organDonor: z.boolean().default(false),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD').optional().nullable(),
  heightCm: z.number().positive().max(300).optional().nullable(),
  weightKg: z.number().positive().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  updatedAt: z.string().optional().nullable(),
});

const dropNulls = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
const clean = (obj) => ({ ...dropNulls(obj), medications: (obj.medications || []).map(dropNulls) });

async function loadShare(token, req, via) {
  if (!token || token.length > 100) return null;
  const { rows } = await db.query(
    `SELECT s.user_id, s.expires_at, s.created_at, u.name, u.phone FROM share_tokens s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`, [token]
  );
  if (!rows[0]) return null;
  // transparency: the owner can see every time their medical ID was opened, and from where
  await audit.record('medical_share_viewed', {
    userId: rows[0].user_id, actorId: null, ip: req.ip || null,
    meta: { via, shareCreatedAt: toIso(rows[0].created_at), userAgent: String(req.get('user-agent') || '').slice(0, 200) },
  });
  const [medical, contacts] = await Promise.all([getMedicalId(rows[0].user_id), listContacts(rows[0].user_id)]);
  return { name: rows[0].name, phone: rows[0].phone, medical, contacts, expiresAt: toIso(rows[0].expires_at) };
}

// ------------------------------------------------------------------ API
const api = express.Router();

api.get('/medical-id', requireAuth, ah(async (req, res) => {
  res.json(await getMedicalId(req.user.id));
}));

api.put('/medical-id', requireAuth, ah(async (req, res) => {
  const body = parse(medicalSchema, req.body || {});
  const { updatedAt, ...data } = body; // eslint-disable-line no-unused-vars
  const saved = await putMedicalId(req.user.id, clean(data));
  await audit.fromReq(req, 'medical_id_updated');
  res.json(saved);
}));

api.post('/medical-id/share-token', requireAuth, ah(async (req, res) => {
  const token = randomToken(18);
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS);
  await db.query('INSERT INTO share_tokens (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, req.user.id, expiresAt]);
  const url = `/m/${token}`;
  const base = config.publicUrl || `${req.protocol}://${req.get('host')}`;
  await audit.fromReq(req, 'medical_share_created', { meta: { expiresAt: expiresAt.toISOString() } });
  res.json({ token, url, absoluteUrl: `${base}${url}`, expiresAt: expiresAt.toISOString() });
}));

api.get('/medical-id/public/:token', ah(async (req, res) => {
  const data = await loadShare(req.params.token, req, 'api');
  if (!data) throw new HttpError(404, 'Share link is invalid or has expired');
  const { expiresAt, ...rest } = data; // eslint-disable-line no-unused-vars
  res.json(rest);
}));

// ------------------------------------------------------------------ HTML page /m/:token
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`;

function age(dob) {
  if (!dob) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) a -= 1;
  return a;
}

const PAGE_CSS = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f4f1ee;color:#1f2328;line-height:1.4}
.wrap{max-width:560px;margin:0 auto;padding:16px}
header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.logo{width:36px;height:36px;border-radius:10px;background:#f48c25;color:#fff;display:grid;place-items:center;font-weight:800}
header h1{font-size:16px;margin:0;letter-spacing:.02em}header small{display:block;color:#6b7280;font-weight:500}
.card{background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 16px rgba(0,0,0,.05)}
.name{font-size:24px;font-weight:800;margin:0}.meta{color:#6b7280;font-size:14px;margin-top:2px}
.hero{display:flex;gap:12px;align-items:stretch}
.blood{flex:0 0 120px;background:#ef4444;color:#fff;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px}
.blood b{font-size:44px;line-height:1;font-weight:900}.blood span{font-size:12px;text-transform:uppercase;letter-spacing:.08em;opacity:.9;margin-top:4px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin:0 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:6px 10px;border-radius:999px;font-weight:700;font-size:15px}
.allergy{background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5}.cond{background:#fff4e8;color:#9a4a00;border:1px solid #fbd0a2}
.none{color:#9ca3af;font-style:italic}ul{margin:0;padding-left:18px}li{margin:4px 0}
.contact{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:1px solid #f0ebe6}.contact:first-of-type{border-top:0}
.contact small{color:#6b7280;display:block}.call{background:#f48c25;color:#fff;text-decoration:none;padding:10px 14px;border-radius:12px;font-weight:700;white-space:nowrap}
.sos{display:block;text-align:center;background:#ef4444;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:14px;font-size:18px;margin-bottom:12px}
.badge{display:inline-block;background:#dcfce7;color:#166534;border-radius:8px;padding:2px 8px;font-size:12px;font-weight:700;margin-left:6px}
footer{color:#9ca3af;font-size:12px;text-align:center;padding:8px 0 24px}`;

function renderPage(data) {
  const m = data.medical || { bloodType: 'Unknown', allergies: [], conditions: [], medications: [] };
  const a = age(m.dateOfBirth);
  const metaBits = [a !== null ? `${a} yrs` : null, m.dateOfBirth ? `DOB ${esc(m.dateOfBirth)}` : null,
    m.heightCm ? `${esc(m.heightCm)} cm` : null, m.weightKg ? `${esc(m.weightKg)} kg` : null].filter(Boolean);
  const chips = (arr, cls) => (arr && arr.length ? `<div class="chips">${arr.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join('')}</div>` : '<div class="none">None reported</div>');
  const meds = m.medications && m.medications.length
    ? `<ul>${m.medications.map((x) => `<li><b>${esc(x.name)}</b>${x.dosage ? ` – ${esc(x.dosage)}` : ''}${x.frequency ? ` <span class="meta">(${esc(x.frequency)})</span>` : ''}</li>`).join('')}</ul>`
    : '<div class="none">None reported</div>';
  const contacts = data.contacts && data.contacts.length
    ? data.contacts.map((c) => `<div class="contact"><div><b>${esc(c.name)}</b>${c.isPrimary ? '<span class="badge">Primary</span>' : ''}<small>${esc(c.relation || 'Contact')} · ${esc(c.phone)}</small></div><a class="call" href="${esc(telHref(c.phone))}">Call</a></div>`).join('')
    : '<div class="none">No emergency contacts</div>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Medical ID – ${esc(data.name)}</title><style>${PAGE_CSS}</style></head>
<body><div class="wrap">
<header><div class="logo">R</div><h1>ResQMe Medical ID<small>Shared for emergency responders</small></h1></header>
<a class="sos" href="tel:112">Call 112 – Emergency</a>
<div class="card hero"><div class="blood"><b>${esc(m.bloodType || 'Unknown')}</b><span>Blood type</span></div>
<div><p class="name">${esc(data.name)}</p><div class="meta">${metaBits.join(' · ') || '&nbsp;'}</div>
${data.phone ? `<div style="margin-top:10px"><a class="call" href="${esc(telHref(data.phone))}">Call ${esc(data.phone)}</a></div>` : ''}
${m.organDonor ? '<div class="meta" style="margin-top:8px">Organ donor</div>' : ''}</div></div>
<div class="card"><h2>Allergies</h2>${chips(m.allergies, 'allergy')}</div>
<div class="card"><h2>Conditions</h2>${chips(m.conditions, 'cond')}</div>
<div class="card"><h2>Medications</h2>${meds}</div>
${m.notes ? `<div class="card"><h2>Notes</h2><div>${esc(m.notes)}</div></div>` : ''}
<div class="card"><h2>Emergency contacts</h2>${contacts}</div>
<footer>Link expires ${esc(new Date(data.expiresAt).toUTCString())}${m.updatedAt ? ` · Updated ${esc(new Date(m.updatedAt).toUTCString())}` : ''}</footer>
</div></body></html>`;
}

function renderMissing() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expired – ResQMe</title><style>${PAGE_CSS}</style></head>
<body><div class="wrap"><header><div class="logo">R</div><h1>ResQMe Medical ID</h1></header><div class="card"><p class="name">Link expired</p><p class="meta">This medical ID link is invalid or has expired. Ask the person to share a new one.</p></div><a class="sos" href="tel:112">Call 112 – Emergency</a></div></body></html>`;
}

const page = express.Router();
page.get('/m/:token', ah(async (req, res) => {
  const data = await loadShare(req.params.token, req, 'page');
  res.set('Cache-Control', 'no-store');
  if (!data) return res.status(404).type('html').send(renderMissing());
  return res.type('html').send(renderPage(data));
}));

module.exports = { api, page, medicalSchema, BLOOD_TYPES };
