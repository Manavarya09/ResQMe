#!/usr/bin/env node
// Procedurally generates the Safety-tools audio (no third-party assets, no licensing concerns).
//   assets/sounds/siren.wav    — 2 s wail: 600 -> 1400 -> 600 Hz sweep, loops seamlessly
//   assets/sounds/ringtone.wav — 3 s classic phone ring (two bursts + pause), loops
// Format: 16-bit PCM, mono, 22050 Hz.  Run: node scripts/generate-sounds.js
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); // PCM chunk size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); // byte rate
  h.writeUInt16LE(2, 32); // block align
  h.writeUInt16LE(16, 34); // bits
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// Siren: triangle-shaped frequency sweep (up then down) so the loop point is continuous.
// A little 3rd/5th harmonic makes it cut through like a real siren; soft-clipped for loudness.
function siren(seconds = 2, lo = 600, hi = 1400) {
  const n = RATE * seconds;
  const out = new Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n; // 0..1
    const tri = p < 0.5 ? p * 2 : 2 - p * 2;
    const f = lo + (hi - lo) * tri;
    phase += (2 * Math.PI * f) / RATE;
    const s = Math.sin(phase) + 0.35 * Math.sin(3 * phase) + 0.15 * Math.sin(5 * phase);
    out[i] = Math.tanh(1.6 * s) * 0.95;
  }
  // Fade the last/first few ms to avoid a click at the loop seam.
  const fade = Math.round(RATE * 0.004);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[n - 1 - i] *= g;
  }
  return out;
}

// Ringtone: a bell-like trill (two tones alternating at 25 Hz) in two 0.4 s bursts, then silence.
function ringtone(seconds = 3) {
  const n = RATE * seconds;
  const out = new Array(n).fill(0);
  const bursts = [[0, 0.4], [0.6, 1.0]];
  for (const [a, b] of bursts) {
    for (let i = Math.round(a * RATE); i < Math.round(b * RATE); i++) {
      const t = i / RATE;
      const local = t - a;
      const env = Math.min(1, local / 0.01) * Math.min(1, (b - t) / 0.02);
      const f = Math.floor(t * 25) % 2 ? 1320 : 1760;
      out[i] = env * 0.7 * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * 2 * f * t));
    }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'siren.wav'), wav(siren()));
fs.writeFileSync(path.join(OUT, 'ringtone.wav'), wav(ringtone()));
console.log('Wrote', path.join(OUT, 'siren.wav'), 'and ringtone.wav');
