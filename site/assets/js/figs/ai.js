import { visibleLoop, reduced } from '../lib/kit.js';

// ------------------------------------------------------------ rules_triage (port of ai-service/app/triage.py)
const LEVELS = ['low', 'medium', 'high', 'critical'];
const BASE_BY_TRIGGER = { sos: 'high', impact: 'high', route_deviation: 'medium', timer_expired: 'medium', manual: 'medium' };
const CRITICAL_PEAK_G = 8.0;
const RISK_CONDITIONS = ['diabet', 'epilep', 'seizure', 'heart', 'cardiac', 'arrhythm', 'angina', 'pacemaker', 'asthma', 'copd', 'stroke',
  'hypertension', 'pregnan', 'hemophilia', 'haemophilia', 'anaphyla', 'kidney', 'dialysis', 'sickle'];
const RISK_MEDICATIONS = ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'heparin', 'clopidogrel', 'insulin', 'blood thinner', 'anticoagul'];
const CRITICAL_KEYWORDS = ['bleeding', 'bleed', 'blood', 'unconscious', 'unresponsive', 'not breathing', "can't breathe", 'cant breathe',
  'cannot breathe', 'chest pain', 'heart attack', 'stroke', 'seizure', 'choking', 'stabbed', 'stab', 'gunshot', 'shot', 'fire', 'drowning',
  'overdose', 'not moving', 'no pulse', 'collapsed', 'head injury', 'trapped', 'kidnap', 'rape', 'attacked'];
const CRIT_RE = CRITICAL_KEYWORDS.map((k) => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
const TRIGGER_LABEL = { sos: 'Manual SOS', impact: 'Impact detected', route_deviation: 'Route deviation', timer_expired: 'Safety timer expired', manual: 'Manual report' };
const bump = (l, n = 1) => LEVELS[Math.min(LEVELS.indexOf(l) + n, LEVELS.length - 1)];

function riskFactors(medical) {
  const found = [];
  (medical.conditions || []).forEach((c) => { if (RISK_CONDITIONS.some((k) => c.toLowerCase().includes(k))) found.push(c); });
  (medical.medications || []).forEach((m) => { if (RISK_MEDICATIONS.some((k) => m.name.toLowerCase().includes(k))) found.push(`on ${m.name}`); });
  return found;
}

export function rulesTriage({ trigger, classification, peakG, medical, note }) {
  const reasons = [];
  let severity = BASE_BY_TRIGGER[trigger] || 'medium';
  reasons.push(`${TRIGGER_LABEL[trigger] || trigger} (base ${severity})`);
  let confidence = 0.6;
  if (classification === 'vehicle_crash') { severity = 'critical'; reasons.push('vehicle crash signature'); confidence += 0.15; }
  if (peakG != null && peakG >= CRITICAL_PEAK_G) { severity = 'critical'; reasons.push(`peak ${peakG.toFixed(1)} g`); confidence += 0.1; }
  if (classification === 'fall') { reasons.push('fall detected'); confidence += 0.05; }
  const risks = riskFactors(medical);
  if (risks.length) { severity = bump(severity); reasons.push('medical risk: ' + risks.slice(0, 3).join(', ')); confidence += 0.05; }
  const hits = [];
  CRITICAL_KEYWORDS.forEach((k, i) => { if (CRIT_RE[i].test(note) && !hits.includes(k)) hits.push(k); });
  if (hits.length) { severity = 'critical'; reasons.push('reported: ' + hits.slice(0, 4).join(', ')); confidence += 0.15; }
  confidence = Math.round(Math.min(confidence, 0.95) * 100) / 100;
  let summary = `${severity.toUpperCase()}: ${reasons.join('; ')}.`;
  if (note) summary += ` Note: "${note.trim().slice(0, 160)}"`;
  return { severity, summary, confidence, actions: actions(trigger, severity, classification, hits, risks), source: 'rules' };
}

function actions(trigger, severity, classification, kw, risks) {
  const a = [];
  if (severity === 'critical') a.push('Dispatch ambulance / emergency services immediately');
  else if (severity === 'high') a.push('Call the user now; dispatch help if no answer within 60 s');
  else a.push('Call the user to check on their safety');
  if (classification === 'vehicle_crash' || trigger === 'impact') a.push('Assume possible neck/spine injury; advise bystanders not to move the casualty');
  if (classification === 'fall') a.push('Check for head injury and ability to move');
  if (kw.some((k) => ['bleeding', 'bleed', 'blood', 'stabbed', 'stab', 'gunshot', 'shot'].includes(k))) a.push('Coach direct pressure / tourniquet for severe bleeding');
  if (kw.some((k) => ['unconscious', 'unresponsive', 'not breathing', 'no pulse', 'collapsed'].includes(k))) a.push('Coach bystander CPR and locate nearest AED');
  if (kw.some((k) => ['chest pain', 'heart attack'].includes(k))) a.push('Treat as possible heart attack; check aspirin allergy before advising aspirin');
  if (trigger === 'route_deviation' || trigger === 'timer_expired') a.push('Contact the user and their primary contact; share live location with police if unreachable');
  if (trigger === 'sos') a.push('Notify emergency contacts with live location');
  if (risks.length) a.push('Brief responders on medical risk: ' + risks.slice(0, 3).join(', '));
  if ((severity === 'high' || severity === 'critical') && trigger !== 'manual') a.push('Consider drone dispatch for first-aid kit / AED and live view');
  return [...new Set(a)].slice(0, 6);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function initTriage() {
  const $ = (id) => document.getElementById(id);
  const out = $('triOut');
  if (!out) return;
  const ins = ['triTrigger', 'triClass', 'triPeak', 'triMed', 'triNote'].map($);
  const run = () => {
    const parts = $('triMed').value.split(',').map((s) => s.trim()).filter(Boolean);
    const medical = { conditions: [], medications: [] };
    parts.forEach((p) => (RISK_MEDICATIONS.some((k) => p.toLowerCase().includes(k)) ? medical.medications.push({ name: p }) : medical.conditions.push(p)));
    const peakG = +$('triPeak').value;
    $('triPeako').textContent = `${peakG.toFixed(1)} g`;
    const r = rulesTriage({ trigger: $('triTrigger').value, classification: $('triClass').value || null, peakG: peakG > 0 ? peakG : null, medical, note: $('triNote').value });
    out.innerHTML = `
      <div class="sev-scale">${LEVELS.map((l) => `<span data-l="${l}" class="${l === r.severity ? 'on' : ''}">${l}</span>`).join('')}</div>
      <div class="conf">Confidence ${Math.round(r.confidence * 100)}% · decided by rules</div>
      <div class="sum">${esc(r.summary)}</div>
      <ol>${r.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`;
  };
  ins.forEach((i) => i.addEventListener('input', run));
  run();
}

// ------------------------------------------------------------ pipeline animation
export default function ai(list) {
  initTriage();
  const stages = [...list.querySelectorAll('li')];
  const fb = document.getElementById('pipeFb');
  const btn = document.getElementById('pipeFail');
  const status = document.getElementById('pipeStatus');
  let fail = false;
  let t = 0;

  btn.addEventListener('click', () => {
    fail = !fail;
    btn.setAttribute('aria-pressed', String(fail));
    status.textContent = fail ? 'Path: model fails, rules engine answers' : 'Path: language model';
    t = 0;
    if (reduced()) paintStatic();
  });

  const STEP = 0.6;
  function paint(time) {
    const k = Math.floor(time / STEP);
    stages.forEach((s) => s.classList.remove('lit', 'fault', 'skip'));
    fb.classList.remove('lit');
    if (!fail) {
      stages.forEach((s, i) => { if (i <= k && k < 9) s.classList.add('lit'); });
    } else {
      stages.forEach((s, i) => {
        if (i < 2 && i <= k) s.classList.add('lit');
        if (i === 2 && k >= 2) s.classList.add(k >= 3 ? 'fault' : 'lit');
        if (i > 2 && k >= 3) s.classList.add('skip');
      });
      if (k >= 4 && k < 9) fb.classList.add('lit');
    }
  }
  function paintStatic() {
    paint(fail ? 4 * STEP : 5 * STEP);
  }
  if (reduced()) { paintStatic(); return; }
  visibleLoop(list, (dt) => {
    t += dt;
    if (t > STEP * 10) t = 0;
    paint(t);
  });
}
