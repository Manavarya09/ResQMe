'use strict';
const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { resetDb, registerUser, auth } = require('./helpers');

const app = createApp();
let a;
let b;

beforeAll(async () => {
  await resetDb();
  a = await registerUser(app);
  b = await registerUser(app);
});
afterAll(() => db.close());

describe('contacts', () => {
  test('create, list, and primary flag is exclusive per user', async () => {
    const c1 = await request(app).post('/api/contacts').set(auth(a.token)).send({ name: 'Mom', phone: '+91 1', relation: 'Mother', isPrimary: true });
    expect(c1.status).toBe(201);
    expect(c1.body).toEqual({ id: expect.any(String), name: 'Mom', phone: '+91 1', relation: 'Mother', isPrimary: true });

    const c2 = await request(app).post('/api/contacts').set(auth(a.token)).send({ name: 'Dad', phone: '+91 2', isPrimary: true });
    expect(c2.status).toBe(201);
    expect(c2.body.relation).toBe('');

    // another user's primary contact must not be affected
    const other = await request(app).post('/api/contacts').set(auth(b.token)).send({ name: 'Friend', phone: '+91 3', isPrimary: true });

    let list = (await request(app).get('/api/contacts').set(auth(a.token))).body;
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.id === c1.body.id).isPrimary).toBe(false);
    expect(list.find((c) => c.id === c2.body.id).isPrimary).toBe(true);

    const patched = await request(app).patch(`/api/contacts/${c1.body.id}`).set(auth(a.token)).send({ isPrimary: true, phone: '+91 11' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ isPrimary: true, phone: '+91 11', name: 'Mom' });
    list = (await request(app).get('/api/contacts').set(auth(a.token))).body;
    expect(list.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([c1.body.id]);

    const bList = (await request(app).get('/api/contacts').set(auth(b.token))).body;
    expect(bList).toEqual([expect.objectContaining({ id: other.body.id, isPrimary: true })]);
  });

  test('validation, ownership and delete', async () => {
    expect((await request(app).post('/api/contacts').set(auth(a.token)).send({ name: 'No phone' })).status).toBe(400);
    const c = await request(app).post('/api/contacts').set(auth(a.token)).send({ name: 'Temp', phone: '+91 9' });
    expect((await request(app).patch(`/api/contacts/${c.body.id}`).set(auth(b.token)).send({ name: 'hijack' })).status).toBe(404);
    expect((await request(app).delete(`/api/contacts/${c.body.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).delete('/api/contacts/not-a-uuid').set(auth(a.token))).status).toBe(404);
    const del = await request(app).delete(`/api/contacts/${c.body.id}`).set(auth(a.token));
    expect(del.status).toBe(204);
    const list = (await request(app).get('/api/contacts').set(auth(a.token))).body;
    expect(list.find((x) => x.id === c.body.id)).toBeUndefined();
  });
});
