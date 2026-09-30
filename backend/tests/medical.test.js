'use strict';
const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');

const app = createApp();

const MEDICAL = {
  bloodType: 'O-',
  allergies: ['Penicillin', 'Latex'],
  conditions: ['Type 1 diabetes'],
  medications: [{ name: 'Insulin', dosage: '10 units', frequency: 'twice daily' }],
  organDonor: true,
  dateOfBirth: '1990-05-01',
  heightCm: 175,
  weightKg: 70,
  notes: 'Carries glucose tablets',
};

let user;
beforeAll(async () => {
  await resetDb();
  user = await registerUser(app, { name: 'Meera <script>' });
});
afterAll(() => db.close());

describe('medical ID', () => {
  test('GET returns null before anything is saved', async () => {
    const res = await request(app).get('/api/medical-id').set(auth(user.token));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('PUT validates bloodType', async () => {
    const res = await request(app).put('/api/medical-id').set(auth(user.token)).send({ ...MEDICAL, bloodType: 'Z+' });
    expect(res.status).toBe(400);
  });

  test('PUT/GET round-trips and ciphertext in the DB is not plaintext', async () => {
    const put = await request(app).put('/api/medical-id').set(auth(user.token)).send(MEDICAL);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ...MEDICAL, updatedAt: expect.any(String) });

    const get = await request(app).get('/api/medical-id').set(auth(user.token));
    expect(get.body).toEqual(put.body);

    const { rows } = await db.query('SELECT * FROM medical_ids WHERE user_id = $1', [user.user.id]);
    expect(rows).toHaveLength(1);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toMatch(/Penicillin|Insulin|diabetes|O-"/);
    expect(Buffer.from(rows[0].iv, 'base64')).toHaveLength(12);
    expect(Buffer.from(rows[0].tag, 'base64')).toHaveLength(16);
    const decoded = Buffer.from(rows[0].ciphertext, 'base64').toString('utf8');
    expect(decoded).not.toMatch(/Penicillin/);
  });

  test('tampered ciphertext fails authentication (GCM)', () => {
    const { encryptJson, decryptJson } = require('../src/services/crypto');
    const enc = encryptJson({ a: 1 });
    const buf = Buffer.from(enc.ciphertext, 'base64');
    buf[0] ^= 0xff;
    expect(() => decryptJson({ ...enc, ciphertext: buf.toString('base64') })).toThrow();
  });

  test('share token gives public JSON + HTML page; unknown/expired tokens 404', async () => {
    await request(app).post('/api/contacts').set(auth(user.token)).send({ name: 'Dad', phone: '+91 98000 11111', relation: 'Father', isPrimary: true });
    const share = await request(app).post('/api/medical-id/share-token').set(auth(user.token));
    expect(share.status).toBe(200);
    expect(share.body.url).toBe(`/m/${share.body.token}`);
    const ttl = new Date(share.body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * 3600e3);
    expect(ttl).toBeLessThanOrEqual(24 * 3600e3);

    const pub = await request(app).get(`/api/medical-id/public/${share.body.token}`);
    expect(pub.status).toBe(200);
    expect(pub.body.name).toBe('Meera <script>');
    expect(pub.body.medical.bloodType).toBe('O-');
    expect(pub.body.contacts).toEqual([expect.objectContaining({ name: 'Dad', isPrimary: true })]);

    const html = await request(app).get(share.body.url);
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toMatch(/html/);
    expect(html.text).toContain('O-');
    expect(html.text).toContain('Penicillin');
    expect(html.text).toContain('href="tel:+919800011111"');
    expect(html.text).toContain('Meera &lt;script&gt;');
    expect(html.text).not.toContain('Meera <script>');

    expect((await request(app).get('/api/medical-id/public/nope')).status).toBe(404);
    expect((await request(app).get('/m/nope')).status).toBe(404);

    await db.query("UPDATE share_tokens SET expires_at = now() - interval '1 minute' WHERE token = $1", [share.body.token]);
    expect((await request(app).get(`/api/medical-id/public/${share.body.token}`)).status).toBe(404);
  });
});
