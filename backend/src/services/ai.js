'use strict';
/**
 * Client for the FastAPI AI service (spec section 4) with local rule-based fallbacks,
 * so incidents and chat keep working when the AI service is down or slow.
 */
const config = require('../config');
const { SEVERITIES } = require('../util');

const TIMEOUTS = { triage: 4000, motion: 4000, chat: 15000, health: 1500 };
const VIDEO_IDS = ['cpr', 'bleeding', 'choking', 'burns', 'recovery_position', 'fracture', 'seizure', 'heatstroke'];

async function postJson(path, body, timeoutMs) {
  const res = await fetch(`${config.aiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`AI ${path} responded ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- triage
const CRITICAL_CONDITIONS = [
  'diabet', 'epilep', 'seizure', 'heart', 'cardiac', 'asthma', 'copd', 'stroke', 'hemophilia',
  'haemophilia', 'anaphyla', 'pregnan', 'arrhythm', 'pacemaker',
];
const CRITICAL_KEYWORDS = [
  'bleeding', 'blood', 'unconscious', 'not breathing', "can't breathe", 'cant breathe', 'chest pain',
  'unresponsive', 'seizure', 'stroke', 'heart attack', 'choking', 'fire', 'gun', 'knife', 'stabbed',
  'overdose', 'drowning',
];
const bump = (sev) => SEVERITIES[Math.min(SEVERITIES.indexOf(sev) + 1, SEVERITIES.length - 1)];

const ACTIONS = {
  sos: ['Call the user immediately and confirm their safety', 'Alert nearest police / emergency unit (112)', 'Notify emergency contacts with live location'],
  impact: ['Call the user to check responsiveness', 'Dispatch ambulance (108) if no response within 2 minutes', 'Dispatch drone for aerial visual on scene'],
  route_deviation: ['Call the user to confirm they are safe', 'Share live location with emergency contacts', 'Escalate to police (112) if unreachable'],
  timer_expired: ['Call the user to confirm they arrived safely', 'Notify emergency contacts', 'Escalate if unreachable for 5 minutes'],
  manual: ['Contact the user to assess the situation', 'Notify emergency contacts', 'Escalate to emergency services if needed'],
};
const SUMMARIES = {
  sos: 'User pressed SOS and needs urgent assistance.',
  impact: 'Possible fall or crash detected by phone motion sensors.',
  route_deviation: 'User deviated from their planned route for an extended period.',
  timer_expired: 'User did not check in before their journey timer expired.',
  manual: 'User manually reported an emergency.',
};

function rulesTriage({ trigger, impact, impactScore, note, medical } = {}) {
  let severity = ['sos', 'impact'].includes(trigger) ? 'high' : 'medium';
  const reasons = [];
  const classification = (impactScore && impactScore.classification) || (impact && impact.classification);
  const peakG = Math.max(Number(impact && impact.peakG) || 0, Number(impactScore && impactScore.peakG) || 0);
  if (classification === 'vehicle_crash' || peakG >= 8) {
    severity = 'critical';
    reasons.push(classification === 'vehicle_crash' ? 'vehicle crash signature' : `high impact force (${peakG.toFixed(1)} g)`);
  }
  const medText = medical ? [...(medical.conditions || []), ...(medical.medications || []).map((m) => m && m.name)].join(' ').toLowerCase() : '';
  const risky = CRITICAL_CONDITIONS.filter((c) => medText.includes(c));
  if (risky.length) {
    severity = bump(severity);
    reasons.push('pre-existing high-risk medical condition');
  }
  const noteText = (note || '').toLowerCase();
  if (CRITICAL_KEYWORDS.some((k) => noteText.includes(k))) {
    severity = 'critical';
    reasons.push('life-threatening keywords in note');
  }
  const base = SUMMARIES[trigger] || SUMMARIES.manual;
  const actions = [...(ACTIONS[trigger] || ACTIONS.manual)];
  if (severity === 'critical') actions.unshift('Dispatch ambulance (108) immediately');
  if (medical && medical.allergies && medical.allergies.length) actions.push(`Inform paramedics of allergies: ${medical.allergies.join(', ')}`);
  return {
    severity,
    summary: reasons.length ? `${base} Escalated due to ${reasons.join('; ')}.` : base,
    recommendedActions: actions.slice(0, 5),
    confidence: 0.6,
    source: 'rules',
  };
}

function normalizeTriage(t) {
  if (!t || !SEVERITIES.includes(t.severity) || typeof t.summary !== 'string') return null;
  return {
    severity: t.severity,
    summary: t.summary,
    recommendedActions: Array.isArray(t.recommendedActions) ? t.recommendedActions.filter((a) => typeof a === 'string') : [],
    confidence: typeof t.confidence === 'number' ? Math.max(0, Math.min(1, t.confidence)) : 0.5,
    source: t.source === 'llm' ? 'llm' : 'rules',
  };
}

async function triage(payload) {
  try {
    const t = normalizeTriage(await postJson('/triage', payload, TIMEOUTS.triage));
    if (t) return t;
    throw new Error('invalid triage response');
  } catch (err) {
    if (!config.isTest) console.warn(`[ai] triage fallback: ${err.message}`);
    return rulesTriage(payload);
  }
}

// ---------------------------------------------------------------- motion
/** Local port of the /motion/score algorithm (spec section 4). */
function rulesMotionScore({ samples = [], sampleRateHz } = {}) {
  const empty = { impactDetected: false, score: 0, peakG: 0, freeFallMs: 0, stillnessAfter: false, rotationPeak: 0, classification: 'none' };
  if (!Array.isArray(samples) || samples.length < 2) return empty;
  const t = samples.map((s, i) => (typeof s.t === 'number' ? s.t : (i * 1000) / (sampleRateHz || 50)));
  const mag = samples.map((s) => Math.sqrt((s.ax || 0) ** 2 + (s.ay || 0) ** 2 + (s.az || 0) ** 2));
  const rot = samples.map((s) => Math.sqrt((s.gx || 0) ** 2 + (s.gy || 0) ** 2 + (s.gz || 0) ** 2));
  let peakIdx = 0;
  mag.forEach((m, i) => { if (m > mag[peakIdx]) peakIdx = i; });
  const peakG = mag[peakIdx];
  const rotationPeak = Math.max(...rot);
  // longest contiguous free-fall run (|a| < 0.4 g) before the peak
  let freeFallMs = 0;
  let runStart = null;
  for (let i = 0; i <= peakIdx; i++) {
    if (mag[i] < 0.4) {
      if (runStart === null) runStart = i;
      freeFallMs = Math.max(freeFallMs, t[i] - t[runStart]);
    } else runStart = null;
  }
  // stillness: std(|a|) < 0.15 g over >= 1 s after peak (skip 200 ms of bounce)
  const after = [];
  for (let i = peakIdx + 1; i < mag.length; i++) if (t[i] - t[peakIdx] >= 200) after.push(i);
  let stillnessAfter = false;
  if (after.length && t[after[after.length - 1]] - t[after[0]] >= 1000) {
    const vals = after.map((i) => mag[i]);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    stillnessAfter = std < 0.15;
  }
  const impactDetected = peakG >= 2.5;
  let classification = 'none';
  if (impactDetected) {
    if (peakG >= 6 && freeFallMs === 0) classification = 'vehicle_crash';
    else if (freeFallMs > 0 && !stillnessAfter) classification = 'drop';
    else if (freeFallMs >= 150) classification = 'fall';
    else classification = stillnessAfter ? 'fall' : 'drop';
  }
  const score = impactDetected
    ? Math.min(1, 0.4 + Math.min(peakG, 10) / 20 + (freeFallMs >= 150 ? 0.15 : 0) + (stillnessAfter ? 0.2 : 0))
    : Math.min(0.3, peakG / 10);
  return { impactDetected, score: Number(score.toFixed(3)), peakG: Number(peakG.toFixed(2)), freeFallMs: Math.round(freeFallMs), stillnessAfter, rotationPeak: Number(rotationPeak.toFixed(2)), classification };
}

async function scoreMotion(payload) {
  try {
    const r = await postJson('/motion/score', payload, TIMEOUTS.motion);
    if (!r || typeof r.impactDetected !== 'boolean') throw new Error('invalid motion response');
    return r;
  } catch (err) {
    if (!config.isTest) console.warn(`[ai] motion fallback: ${err.message}`);
    return rulesMotionScore(payload);
  }
}

// ---------------------------------------------------------------- chat
const CHAT_TOPICS = [
  { words: ['cpr', 'not breathing', 'no pulse', 'unconscious', 'unresponsive'], video: 'cpr' },
  { words: ['bleed', 'blood', 'cut', 'wound'], video: 'bleeding' },
  { words: ['chok'], video: 'choking' },
  { words: ['burn', 'scald'], video: 'burns' },
  { words: ['faint', 'recovery position', 'passed out'], video: 'recovery_position' },
  { words: ['fracture', 'broken', 'bone', 'sprain'], video: 'fracture' },
  { words: ['seizure', 'fit', 'convuls', 'epilep'], video: 'seizure' },
  { words: ['heat', 'sunstroke', 'dehydrat'], video: 'heatstroke' },
];

function rulesChat({ messages = [], context = {} } = {}) {
  const last = [...messages].reverse().find((m) => m && m.role === 'user');
  const text = ((last && last.content) || '').toLowerCase();
  const videoIds = [...new Set(CHAT_TOPICS.filter((t) => t.words.some((w) => text.includes(w))).map((t) => t.video))].filter((v) => VIDEO_IDS.includes(v)).slice(0, 2);
  const lifeThreat = /not breathing|unconscious|unresponsive|chest pain|severe bleeding|choking|stroke|seizure/.test(text);
  const number = (context && context.country && context.country !== 'IN') ? 'your local emergency number' : '112 (or 108 for an ambulance)';
  let reply = `I'm here with you. Stay as calm as you can. If anyone is in danger or has life-threatening signs, call ${number} right now.`;
  if (context && context.incidentActive) reply += ' Your emergency alert is active and responders can see your location.';
  if (videoIds.length) reply += ' I have added a short first-aid guide below that may help while help is on the way.';
  else reply += ' Tell me what is happening and I will guide you step by step.';
  return {
    reply,
    suggestions: ['Call 112 now', 'Someone is injured', 'I feel unsafe', 'Show first-aid guides'],
    videoIds,
    severity: lifeThreat ? 'critical' : null,
    source: 'rules',
  };
}

async function chat(payload) {
  try {
    const r = await postJson('/chat', payload, TIMEOUTS.chat);
    if (!r || typeof r.reply !== 'string') throw new Error('invalid chat response');
    return {
      reply: r.reply,
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.slice(0, 4) : [],
      videoIds: Array.isArray(r.videoIds) ? r.videoIds.filter((v) => VIDEO_IDS.includes(v)) : [],
      severity: SEVERITIES.includes(r.severity) ? r.severity : null,
      source: r.source === 'llm' ? 'llm' : 'rules',
    };
  } catch (err) {
    if (!config.isTest) console.warn(`[ai] chat fallback: ${err.message}`);
    return rulesChat(payload);
  }
}

async function health() {
  try {
    const res = await fetch(`${config.aiUrl}/health`, { signal: AbortSignal.timeout(TIMEOUTS.health) });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { triage, scoreMotion, chat, health, rulesTriage, rulesMotionScore, rulesChat, TIMEOUTS };
