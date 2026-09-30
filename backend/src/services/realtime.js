'use strict';
/**
 * Socket.IO wiring (spec section 3, "Socket.IO"). Emit helpers are no-ops until init()
 * is called, so routes can be exercised through supertest without a live socket server.
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.query && socket.handshake.query.token);
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(String(token).replace(/^Bearer\s+/i, ''), config.jwtSecret, { algorithms: ['HS256'] });
      const { rows } = await db.query('SELECT id, role FROM users WHERE id = $1', [payload.sub]);
      if (!rows[0]) return next(new Error('unauthorized'));
      socket.data.user = rows[0];
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(`user:${id}`);
    if (role === 'responder') socket.join('responders');
    socket.emit('hello', { userId: id, role });
  });
  return io;
}

function toRooms(rooms, event, payload) {
  if (!io) return;
  const list = rooms.filter(Boolean);
  if (!list.length) return;
  io.to(list).emit(event, payload);
}

const emitIncidentNew = (incident) => toRooms(['responders'], 'incident:new', incident);
const emitIncidentUpdated = (incident) => toRooms(['responders', `user:${incident.userId}`], 'incident:updated', incident);
const emitIncidentLocation = (ownerId, payload) => toRooms(['responders', `user:${ownerId}`], 'incident:location', payload);
const emitDroneUpdate = (drone, ownerId) => toRooms(['responders', ownerId && `user:${ownerId}`], 'drone:update', drone);
const emitHazardNew = (hazard) => { if (io) io.emit('hazard:new', hazard); };

async function close() {
  if (io) {
    const s = io;
    io = null;
    await new Promise((resolve) => s.close(() => resolve()));
  }
}

module.exports = {
  init, close, emitIncidentNew, emitIncidentUpdated, emitIncidentLocation, emitDroneUpdate, emitHazardNew,
  get io() { return io; },
};
