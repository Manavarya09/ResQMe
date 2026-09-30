'use strict';
require('../src/config');
const db = require('../src/db');

db.migrate({ log: true })
  .then((ran) => { console.log(`[migrate] ${ran.length} migration(s) applied`); return db.close(); })
  .catch(async (err) => { console.error('[migrate] failed:', err.message); await db.close(); process.exit(1); });
