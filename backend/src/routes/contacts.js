'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../auth');
const { listContacts, rowToContact } = require('../services/medical');
const { ah, parse, HttpError } = require('../util');

const router = express.Router();
router.use('/contacts', requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100),
  phone: z.string().trim().min(3, 'phone is required').max(30),
  relation: z.string().trim().max(50).optional().nullable(),
  isPrimary: z.boolean().optional(),
});
const patchSchema = createSchema.partial();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/contacts', ah(async (req, res) => {
  res.json(await listContacts(req.user.id));
}));

router.post('/contacts', ah(async (req, res) => {
  const body = parse(createSchema, req.body || {});
  const contact = await db.tx(async (client) => {
    if (body.isPrimary) await client.query('UPDATE contacts SET is_primary = false WHERE user_id = $1', [req.user.id]);
    const { rows } = await client.query(
      'INSERT INTO contacts (user_id, name, phone, relation, is_primary) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, body.name, body.phone, body.relation || '', !!body.isPrimary]
    );
    return rowToContact(rows[0]);
  });
  res.status(201).json(contact);
}));

router.patch('/contacts/:id', ah(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Contact not found');
  const body = parse(patchSchema, req.body || {});
  const contact = await db.tx(async (client) => {
    const { rows: existing } = await client.query('SELECT * FROM contacts WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    if (!existing[0]) throw new HttpError(404, 'Contact not found');
    if (body.isPrimary === true) {
      await client.query('UPDATE contacts SET is_primary = false WHERE user_id = $1 AND id <> $2', [req.user.id, req.params.id]);
    }
    const cur = existing[0];
    const { rows } = await client.query(
      'UPDATE contacts SET name=$2, phone=$3, relation=$4, is_primary=$5 WHERE id=$1 RETURNING *',
      [cur.id, body.name ?? cur.name, body.phone ?? cur.phone, body.relation ?? cur.relation,
        body.isPrimary === undefined ? cur.is_primary : body.isPrimary]
    );
    return rowToContact(rows[0]);
  });
  res.json(contact);
}));

router.delete('/contacts/:id', ah(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(404, 'Contact not found');
  const { rowCount } = await db.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Contact not found');
  res.status(204).end();
}));

module.exports = router;
