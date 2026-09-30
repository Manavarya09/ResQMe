'use strict';
require('./config');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db');
const ai = require('./services/ai');
const { HttpError } = require('./util');

const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'dashboard');

/** Build the Express app (no listen) — used by server.js and by supertest. */
function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
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
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (req, res) => {
    const [dbOk, aiOk] = await Promise.all([db.ping(), ai.health()]);
    res.json({ ok: true, db: dbOk, ai: aiOk });
  });

  app.use('/api', require('./routes/auth'));
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
    console.error('[app] unhandled error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
