'use strict';
const crypto = require('crypto');
const config = require('../config');

let cachedKey = null;
let cachedHex = null;

function key() {
  const hex = config.medicalKey;
  if (hex !== cachedHex) {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) throw new Error('MEDICAL_KEY must be 32 bytes (64 hex chars)');
    cachedKey = buf;
    cachedHex = hex;
  }
  return cachedKey;
}

/** Encrypt a JSON-serialisable value with AES-256-GCM. Returns base64 { iv, tag, ciphertext }. */
function encryptJson(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/** Decrypt the output of encryptJson. Throws if the data was tampered with. */
function decryptJson({ iv, tag, ciphertext }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { encryptJson, decryptJson, randomToken };
