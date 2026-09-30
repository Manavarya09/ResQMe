'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/resqme_test';
// Any un-mocked AI call goes to a closed port and fails fast → exercises the rules fallback.
process.env.AI_URL = 'http://127.0.0.1:9';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret';
if (!process.env.MEDICAL_KEY) process.env.MEDICAL_KEY = '11'.repeat(32);
