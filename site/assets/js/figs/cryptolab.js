import { visibleLoop } from '../lib/kit.js';

const b64 = (u8) => btoa(String.fromCharCode(...u8));
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0'));
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function base32Decode(str) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.toUpperCase().replace(/[\s=-]/g, '')) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export default function cryptolab(out) {
  const subtle = window.crypto && window.crypto.subtle;
  const encBtn = document.getElementById('aesEnc');
  const tamperBtn = document.getElementById('aesTamper');
  const input = document.getElementById('aesIn');
  if (!subtle) {
    out.innerHTML = '<span class="bad">Web Crypto is only available in a secure context (https or localhost).</span>';
    encBtn.disabled = true;
    document.getElementById('totpMac').textContent = 'Web Crypto unavailable in this context.';
    return;
  }

  // ---------------- AES-256-GCM
  let sealed = null;
  encBtn.addEventListener('click', async () => {
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const pt = new TextEncoder().encode(input.value);
    const buf = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, pt));
    const ct = buf.slice(0, buf.length - 16), tag = buf.slice(buf.length - 16);
    sealed = { key, iv, ct, tag };
    out.innerHTML = `<span class="k">iv</span> ${b64(iv)}<br><span class="k">tag</span> ${b64(tag)}<br><span class="k">ciphertext</span> ${esc(b64(ct))}<br><span class="k">${pt.length} bytes of text became ${ct.length} bytes of ciphertext, plus a 16-byte tag and a 12-byte iv</span>`;
    tamperBtn.disabled = false;
  });
  tamperBtn.addEventListener('click', async () => {
    if (!sealed) return;
    const { key, iv, ct, tag } = sealed;
    const bad = new Uint8Array(ct);
    bad[0] ^= 0x01;
    const joined = new Uint8Array(bad.length + 16);
    joined.set(bad); joined.set(tag, bad.length);
    let line;
    try {
      await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, joined);
      line = '<span class="bad">decrypted (unexpected)</span>';
    } catch (e) {
      line = `<span class="bad">One bit changed: decryption refused (${esc(e.name || 'OperationError')}, the tag no longer matches)</span>`;
    }
    const ok = new Uint8Array(ct.length + 16);
    ok.set(ct); ok.set(tag, ct.length);
    const plain = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ok));
    out.innerHTML = `${line}<br><span class="good">Untouched: decrypts back to ${esc(plain.slice(0, 64))}${plain.length > 64 ? '...' : ''}</span>`;
  });

  // ---------------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s)
  const codeEl = document.getElementById('totpCode');
  const stepEl = document.getElementById('totpStep');
  const ring = document.getElementById('totpRing');
  const macEl = document.getElementById('totpMac');
  const C_LEN = 138.23;
  let keyP = subtle.importKey('raw', base32Decode('JBSWY3DPEHPK3PXP'), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  let lastStep = -1, busy = false;

  async function compute(step) {
    busy = true;
    const msg = new Uint8Array(8);
    let c = step;
    for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
    const mac = new Uint8Array(await subtle.sign('HMAC', await keyP, msg));
    const o = mac[19] & 0x0f;
    const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
    const code = String(bin % 1e6).padStart(6, '0');
    codeEl.textContent = `${code.slice(0, 3)} ${code.slice(3)}`;
    stepEl.textContent = `time step ${step} · offset ${o}`;
    const h = hex(mac);
    macEl.innerHTML = 'HMAC-SHA1: ' + h.map((b, i) => {
      if (i >= o && i < o + 4) return `<span class="off">${b}</span>`;
      if (i === 19) return `${b[0]}<span class="nib">${b[1]}</span>`;
      return b;
    }).join(' ');
    busy = false;
  }

  function tick() {
    const now = Date.now() / 1000;
    const step = Math.floor(now / 30);
    const frac = (now % 30) / 30;
    ring.setAttribute('stroke-dashoffset', (C_LEN * frac).toFixed(2));
    if (step !== lastStep && !busy) { lastStep = step; compute(step); }
  }
  tick();
  let acc = 0;
  visibleLoop(ring.ownerSVGElement || ring, (dt) => { acc += dt; if (acc > 0.2) { acc = 0; tick(); } });
}
