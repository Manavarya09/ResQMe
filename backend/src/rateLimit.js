'use strict';
/**
 * Shared express-rate-limit factory.
 *
 * Limiters are disabled when NODE_ENV=test so the suite stays deterministic. A test (or any
 * embedder) can opt back in per app: createApp({ rateLimits: { enabled: true, limits: { incidents: 2 } } }).
 * The in-memory store is per-process; run a shared store (e.g. Redis) if you scale horizontally.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('./config');

function opts(req) {
  return (req.app && req.app.locals && req.app.locals.rateLimits) || null;
}

/**
 * @param {string} name   key used for per-app overrides (`limits[name]`)
 * @param {object} o
 * @param {number} o.windowMs
 * @param {number} o.limit
 * @param {'ip'|'user'|function} [o.by]  'user' keys by req.user.id (falls back to IP); a function returns a custom key
 * @param {string} [o.message]
 */
function limiter(name, { windowMs, limit, by = 'ip', message = 'Too many requests, please slow down' }) {
  return rateLimit({
    windowMs,
    limit: (req) => {
      const o = opts(req);
      return (o && o.limits && o.limits[name]) || limit;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => {
      const o = opts(req);
      if (o && typeof o.enabled === 'boolean') return !o.enabled;
      return config.isTest;
    },
    keyGenerator: (req) => {
      if (typeof by === 'function') {
        const k = by(req);
        if (k) return String(k);
      } else if (by === 'user' && req.user) {
        return `u:${req.user.id}`;
      }
      return `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
    },
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

module.exports = { limiter };
