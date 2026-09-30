'use strict';
const http = require('http');
const os = require('os');
const config = require('./config');
const db = require('./db');
const { createApp } = require('./app');
const { logger } = require('./logger');
const realtime = require('./services/realtime');
const drones = require('./services/drones');

async function start({ port = config.port, host = '0.0.0.0' } = {}) {
  config.assertProductionSafe(); // throws (→ exit 1) on unsafe production config
  await db.migrate({ log: !config.isTest });
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
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason instanceof Error ? reason : new Error(String(reason)) }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception — exiting');
    process.exit(1);
  });

  start()
    .then((server) => {
      const { port } = server.address();
      const lan = Object.values(os.networkInterfaces()).flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${port}`);
      logger.info({ port, env: config.nodeEnv, lan, publicUrl: config.publicUrl, corsOrigins: config.corsOrigins }, 'ResQMe API listening');
      if (!config.isProduction) {
        console.log(`[resqme] API listening on http://localhost:${port}${lan.length ? ` (LAN: ${lan.join(', ')})` : ''}`);
        console.log(`[resqme] Dashboard: http://localhost:${port}/dashboard/`);
      }
      let stopping = false;
      const shutdown = (signal) => {
        if (stopping) return;
        stopping = true;
        logger.info({ signal }, 'shutting down');
        drones.stopSimulation();
        realtime.close().finally(() => db.close().finally(() => process.exit(0)));
        setTimeout(() => process.exit(0), 3000).unref();
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      logger.fatal({ err: { message: err.message } }, 'failed to start');
      console.error(`[resqme] failed to start: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { start };
