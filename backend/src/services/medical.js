'use strict';
const db = require('../db');
const { encryptJson, decryptJson } = require('./crypto');
const { toIso } = require('../util');

async function getMedicalId(userId) {
  const { rows } = await db.query('SELECT * FROM medical_ids WHERE user_id = $1', [userId]);
  if (!rows[0]) return null;
  try {
    return { ...decryptJson(rows[0]), updatedAt: toIso(rows[0].updated_at) };
  } catch (err) {
    console.error('[medical] failed to decrypt medical ID for', userId, err.message);
    return null;
  }
}

async function putMedicalId(userId, medical) {
  const { updatedAt, ...data } = medical; // eslint-disable-line no-unused-vars
  const enc = encryptJson(data);
  const { rows } = await db.query(
    `INSERT INTO medical_ids (user_id, iv, tag, ciphertext, updated_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (user_id) DO UPDATE SET iv=EXCLUDED.iv, tag=EXCLUDED.tag, ciphertext=EXCLUDED.ciphertext, updated_at=now()
     RETURNING updated_at`,
    [userId, enc.iv, enc.tag, enc.ciphertext]
  );
  return { ...data, updatedAt: toIso(rows[0].updated_at) };
}

const rowToContact = (r) => ({ id: r.id, name: r.name, phone: r.phone, relation: r.relation, isPrimary: r.is_primary });

async function listContacts(userId) {
  const { rows } = await db.query(
    'SELECT * FROM contacts WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC', [userId]
  );
  return rows.map(rowToContact);
}

module.exports = { getMedicalId, putMedicalId, listContacts, rowToContact };
