'use strict';
/**
 * Tiny structured JSON logger (one line per entry on stdout/stderr) — pino-compatible field names
 * (level, time, msg) so log shippers parse it the same way. Level comes from LOG_LEVEL.
 */
const config = require('./config');

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60, silent: Infinity };

function serializeError(err) {
  if (!(err instanceof Error)) return err;
  return { type: err.name, message: err.message, code: err.code, stack: err.stack };
}

function write(level, fields, msg) {
  const threshold = LEVELS[config.logLevel] ?? LEVELS.info;
  if (LEVELS[level] < threshold) return;
  const entry = { level, time: new Date().toISOString(), msg };
  for (const [k, v] of Object.entries(fields || {})) {
    if (v !== undefined) entry[k] = k === 'err' ? serializeError(v) : v;
  }
  let line;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ level, time: entry.time, msg, note: 'unserializable log fields' });
  }
  (LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout).write(`${line}\n`);
}

function make(bindings = {}) {
  const log = {};
  for (const level of Object.keys(LEVELS)) {
    if (level === 'silent') continue;
    // log.info('msg') or log.info({ fields }, 'msg')
    log[level] = (a, b) => (typeof a === 'string' ? write(level, bindings, a) : write(level, { ...bindings, ...a }, b));
  }
  log.child = (more) => make({ ...bindings, ...more });
  return log;
}

const logger = make();

/** Strip query strings and redact bearer-secret path segments (medical share tokens). */
function safePath(url) {
  const p = String(url || '').split('?')[0];
  return p
    .replace(/^\/m\/[^/]+/, '/m/:token')
    .replace(/^\/api\/medical-id\/public\/[^/]+/, '/api/medical-id/public/:token');
}

/**
 * Request logging middleware. Logs method, path (redacted), status, duration, userId, ip.
 * Never logs headers (Authorization), bodies, passwords or medical data.
 */
function requestLogger() {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      write(level, {
        method: req.method,
        path: safePath(req.originalUrl),
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
        userId: req.user ? req.user.id : undefined,
        ip: req.ip,
      }, 'request');
    });
    next();
  };
}

module.exports = { logger, requestLogger, safePath, LEVELS };
