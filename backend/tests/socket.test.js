'use strict';
jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, triage: jest.fn(async (p) => actual.rulesTriage(p)) };
});

const http = require('http');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const db = require('../src/db');
const realtime = require('../src/services/realtime');
const { createApp } = require('../src/app');
const { resetDb, registerUser, createResponder, auth } = require('./helpers');

let server;
let url;
let owner;
let other;
let responder;
const sockets = [];

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.on('hello', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor(socket, event, pred = () => true, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.on(event, (payload) => {
      if (pred(payload)) { clearTimeout(timer); resolve(payload); }
    });
  });
}

beforeAll(async () => {
  await resetDb();
  const app = createApp();
  server = http.createServer(app);
  realtime.init(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
  owner = await registerUser(app);
  other = await registerUser(app);
  responder = await createResponder();
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await realtime.close();
  await db.close();
});

describe('socket.io', () => {
  test('rejects connections without a valid token', async () => {
    await expect(connect('bad-token')).rejects.toThrow(/unauthorized/);
  });

  test('responder receives incident:new, owner gets incident:updated, strangers get nothing', async () => {
    const r = await connect(responder.token);
    const o = await connect(owner.token);
    const x = await connect(other.token);
    const strangerEvents = [];
    x.onAny((ev) => strangerEvents.push(ev));
    const ownerNew = [];
    o.on('incident:new', (p) => ownerNew.push(p));

    const gotNew = waitFor(r, 'incident:new');
    const res = await request(server).post('/api/incidents').set(auth(owner.token)).send({ trigger: 'sos', lat: 28.61, lng: 77.2 });
    expect(res.status).toBe(201);
    const payload = await gotNew;
    expect(payload).toMatchObject({ id: res.body.id, trigger: 'sos', status: 'open', user: { name: owner.user.name } });

    const ownerUpdated = waitFor(o, 'incident:updated', (p) => p.id === res.body.id);
    const respUpdated = waitFor(r, 'incident:updated', (p) => p.id === res.body.id);
    await request(server).post(`/api/incidents/${res.body.id}/ack`).set(auth(responder.token)).send({ etaMinutes: 4 }).expect(200);
    expect((await ownerUpdated).status).toBe('acknowledged');
    expect((await respUpdated).responderEtaMinutes).toBe(4);

    const loc = waitFor(r, 'incident:location');
    await request(server).post(`/api/incidents/${res.body.id}/location`).set(auth(owner.token)).send({ lat: 28.62, lng: 77.21 }).expect(204);
    expect(await loc).toEqual({ incidentId: res.body.id, lat: 28.62, lng: 77.21 });

    const drone = waitFor(o, 'drone:update', (d) => d.incidentId === res.body.id);
    await request(server).post(`/api/incidents/${res.body.id}/drone`).set(auth(responder.token)).expect(200);
    expect((await drone).status).toBe('en_route');

    const hz = waitFor(x, 'hazard:new');
    await request(server).post('/api/hazards').set(auth(owner.token)).send({ type: 'crime', title: 'Mugging', lat: 28.6, lng: 77.2 }).expect(201);
    expect((await hz).title).toBe('Mugging');

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(ownerNew).toHaveLength(0);
    expect(strangerEvents).toEqual(['hazard:new']);
  });
});
