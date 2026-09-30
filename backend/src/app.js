'use strict';
const config = require('./config');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const ai = require('./services/ai');
const { HttpError } = require('./util');
const { logger, requestLogger } = require('./logger');

const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'dashboard');

/**
 * Build the Express app (no listen) — used by server.js and by supertest.
 * @param {object} [options]
 * @param {{enabled?: boolean, limits?: Record<string, number>}} [options.rateLimits]
 *   Rate limiters are off under NODE_ENV=test; pass { enabled: true } to exercise them.
 */
function createApp(options = {}) {
  const app = express();
  app.locals.rateLimits = options.rateLimits || null;
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://unpkg.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https://unpkg.com', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'],
        'connect-src': ["'self'", 'ws:', 'wss:'],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(requestLogger());
  const corsOrigin = config.corsOriginOption();
  app.use(cors({ origin: corsOrigin === true ? '*' : corsOrigin, exposedHeaders: ['X-Next-Cursor', 'RateLimit', 'RateLimit-Policy'] }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (req, res) => {
    const [dbOk, aiOk] = await Promise.all([db.ping(), ai.health()]);
    res.json({ ok: true, db: dbOk, ai: aiOk });
  });

  // Readiness: only report ready when the database answers (load balancers / orchestrators).
  app.get('/ready', async (req, res) => {
    const dbOk = await db.ping();
    res.set('Cache-Control', 'no-store');
    res.status(dbOk ? 200 : 503).json({ ready: dbOk, db: dbOk });
  });

  app.use('/api', require('./routes/auth'));
  app.use('/api', require('./routes/account'));
  app.use('/api', require('./routes/medical').api);
  app.use('/api', require('./routes/contacts'));
  app.use('/api', require('./routes/incidents'));
  app.use('/api', require('./routes/misc'));
  app.use('/', require('./routes/medical').page);

  app.use('/dashboard', express.static(DASHBOARD_DIR, { index: 'index.html', maxAge: 0 }));
  app.get('/', (req, res) => res.redirect('/dashboard/'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid identifier' });
    logger.error({ err, method: req.method, path: req.path }, 'unhandled request error');
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
