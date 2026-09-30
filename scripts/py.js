#!/usr/bin/env node
// Runs the ai-service virtualenv's Python cross-platform: `node scripts/py.js -m pytest -q`.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const dir = path.join(__dirname, '..', 'ai-service');
const win = process.platform === 'win32';
const venvPy = path.join(dir, '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
const args = process.argv.slice(2);

if (args[0] === '--create-venv') {
  const sys = win ? 'python' : 'python3';
  let r = spawnSync(sys, ['-m', 'venv', '.venv'], { cwd: dir, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
  r = spawnSync(venvPy, ['-m', 'pip', 'install', '-r', 'requirements-dev.txt'], { cwd: dir, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
if (!fs.existsSync(venvPy)) {
  console.error('ai-service virtualenv missing — run `npm run setup:ai` first.');
  process.exit(1);
}
const r = spawnSync(venvPy, args, { cwd: dir, stdio: 'inherit' });
process.exit(r.status ?? 1);
