'use strict';
const http = require('http');
const os = require('os');
const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');
const realtime = require('./services/realtime');
const drones = require('./services/drones');

async function start({ port = config.port, host = '0.0.0.0' } = {}) {
  await db.migrate({ log: true });
  await drones.ensureFleet();
  const app = createApp();
  const server = http.createServer(app);
  realtime.init(server);
  drones.startSimulation();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

if (require.main === module) {
  start()
    .then((server) => {
      const { port } = server.address();
      const lan = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${port}`);
      console.log(`[resqme] API listening on http://localhost:${port}${lan.length ? ` (LAN: ${lan.join(', ')})` : ''}`);
      console.log(`[resqme] Dashboard: http://localhost:${port}/dashboard/`);
      const shutdown = () => {
        drones.stopSimulation();
        realtime.close().finally(() => db.close().finally(() => process.exit(0)));
        setTimeout(() => process.exit(0), 3000).unref();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[resqme] failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { start };
