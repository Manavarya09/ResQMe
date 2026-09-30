'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

/** Run fn(client) inside a transaction. */
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const LOCK_ID = 41004100;

/** Apply pending SQL migrations in filename order (idempotent, tracked in `migrations`). */
async function migrate({ log = false } = {}) {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const { rows } = await client.query('SELECT name FROM migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    const ran = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
      ran.push(file);
      if (log) console.log(`[db] applied migration ${file}`);
    }
    return ran;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

async function ping() {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { query, tx, migrate, ping, close, getPool };
