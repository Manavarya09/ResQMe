import { whenVisible } from './lib/kit.js';

// ---------------------------------------------------------------- KaTeX
function renderMath() {
  if (!window.renderMathInElement) return false;
  window.renderMathInElement(document.querySelector('main'), {
    delimiters: [
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
  return true;
}
if (!renderMath()) window.addEventListener('load', renderMath, { once: true });

// ---------------------------------------------------------------- nav: scroll spy + progress
const links = [...document.querySelectorAll('#navLinks a')];
const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
const navLinks = document.getElementById('navLinks');
const progress = document.getElementById('progress');
let active = -1;
let ticking = false;

function onScroll() {
  ticking = false;
  const docH = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${docH > 0 ? Math.min(1, scrollY / docH) : 0})`;
  const y = innerHeight * 0.35;
  let idx = -1;
  sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= y) idx = i; });
  if (idx !== active) {
    if (active >= 0) { links[active].classList.remove('active'); links[active].removeAttribute('aria-current'); }
    if (idx >= 0) {
      const a = links[idx];
      a.classList.add('active');
      a.setAttribute('aria-current', 'true');
      // keep the active link visible in the horizontally scrolling nav (mobile)
      const l = a.offsetLeft - navLinks.offsetLeft, r = l + a.offsetWidth;
      if (l < navLinks.scrollLeft + 16 || r > navLinks.scrollLeft + navLinks.clientWidth - 16) {
        navLinks.scrollTo({ left: l - navLinks.clientWidth / 2 + a.offsetWidth / 2, behavior: 'smooth' });
      }
    }
    active = idx;
  }
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
addEventListener('resize', onScroll);
onScroll();

// ---------------------------------------------------------------- reveals
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.rv').forEach((n) => io.observe(n));

// ---------------------------------------------------------------- API reference (design spec + routes)
const API = [
  ['GET', '/health', 'Liveness plus database and AI reachability', 'public'],
  ['GET', '/ready', 'Ready only when the database answers', 'public'],
  ['POST', '/api/auth/register', 'Create an account', 'rate limited'],
  ['POST', '/api/auth/login', 'Sign in; returns a token or a two-factor challenge', 'rate limited'],
  ['POST', '/api/auth/mfa/verify', 'Finish sign-in with an authenticator or recovery code', 'rate limited'],
  ['POST', '/api/auth/mfa/setup, enable, disable', 'Manage two-factor sign-in', ''],
  ['POST', '/api/auth/logout-all', 'Sign out of every device', ''],
  ['POST', '/api/auth/change-password', 'Change password and end other sessions', 'rate limited'],
  ['GET, PATCH', '/api/me', 'Profile and settings', ''],
  ['GET', '/api/me/audit', 'Your audit log', ''],
  ['GET', '/api/me/export', 'Export all your data', ''],
  ['DELETE', '/api/me', 'Delete your account', ''],
  ['GET, PUT', '/api/medical-id', 'Medical ID (encrypted at rest)', ''],
  ['POST', '/api/medical-id/share-token', 'Create a 24 hour responder link', ''],
  ['GET', '/api/medical-id/public/:token', 'Medical card for responders', 'public'],
  ['GET', '/m/:token', 'Printable medical card page (QR code target)', 'public'],
  ['GET, POST', '/api/contacts', 'Emergency contacts', ''],
  ['PATCH, DELETE', '/api/contacts/:id', 'Edit or remove a contact', ''],
  ['POST', '/api/incidents', 'Raise an incident', '10 per minute'],
  ['GET', '/api/incidents', 'Your incidents, or all of them for responders', 'paginated'],
  ['GET', '/api/incidents/:id', 'One incident with its timeline', ''],
  ['POST', '/api/incidents/:id/location', 'Send a new position', 'owner'],
  ['POST', '/api/incidents/:id/cancel', 'Cancel a false alarm', 'owner'],
  ['POST', '/api/incidents/:id/ack', 'Acknowledge with an ETA', 'responder'],
  ['POST', '/api/incidents/:id/drone', 'Send the nearest idle drone', 'owner or responder'],
  ['POST', '/api/incidents/:id/resolve', 'Close the incident', 'responder'],
  ['GET, POST', '/api/hazards', 'Nearby hazards, or report one', ''],
  ['GET', '/api/drones', 'Fleet status', ''],
  ['POST', '/api/chat', 'AI crisis chat (with rules fallback)', '30 per minute'],
  ['POST', 'AI service: /chat, /triage, /motion/score', 'Chat, triage and motion scoring on port 8100', 'internal'],
];
document.querySelector('#apiTable tbody').innerHTML = API.map(([m, p, d, n]) =>
  `<tr><td class="verb">${m}</td><td><code>${p}</code></td><td>${d}</td><td class="dim">${n}</td></tr>`).join('');

// ---------------------------------------------------------------- figures (lazy, isolated)
const FIGS = [
  ['heroScope', './figs/hero.js'],
  ['sysSvg', './figs/system.js'],
  ['pgScope', './figs/playground.js'],
  ['fsmSvg', './figs/fsm.js'],
  ['corCanvas', './figs/corridor.js'],
  ['seqSvg', './figs/sequence.js'],
  ['schema', './figs/schema.js'],
  ['aesOut', './figs/cryptolab.js'],
  ['pipe', './figs/ai.js'],
  ['droneMap', './figs/drone.js'],
  ['ci', './figs/ci.js'],
];
FIGS.forEach(([id, mod]) => {
  const node = document.getElementById(id);
  if (!node) return;
  whenVisible(node, () => {
    import(mod).then((m) => m.default(node)).catch((e) => console.error(`[fig] ${mod}`, e));
  }, '600px 0px 600px 0px');
});
