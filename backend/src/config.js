'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

module.exports = {
  get port() { return Number(process.env.PORT || 4100); },
  get jwtSecret() { return required('JWT_SECRET'); },
  get medicalKey() { return required('MEDICAL_KEY'); },
  get aiUrl() { return (process.env.AI_URL || 'http://localhost:8100').replace(/\/+$/, ''); },
  get isTest() { return process.env.NODE_ENV === 'test'; },
};
