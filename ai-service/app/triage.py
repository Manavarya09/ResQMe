"""/triage: deterministic rule-based severity, optional LLM-enriched summary."""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Optional

from .chat import extract_json_object
from .llm import LLMClient

log = logging.getLogger("resqme.triage")

LEVELS = ["low", "medium", "high", "critical"]

BASE_BY_TRIGGER = {
    "sos": "high",
    "impact": "high",
    "route_deviation": "medium",
    "timer_expired": "medium",
    "manual": "medium",
}

CRITICAL_PEAK_G = 8.0

# Medical conditions that make any emergency riskier (substring match, lower-case).
RISK_CONDITIONS = [
    "diabet", "epilep", "seizure", "heart", "cardiac", "arrhythm", "angina", "pacemaker",
    "asthma", "copd", "stroke", "hypertension", "pregnan", "hemophilia", "haemophilia",
    "anaphyla", "kidney", "dialysis", "sickle",
]
RISK_MEDICATIONS = ["warfarin", "apixaban", "rivaroxaban", "dabigatran", "heparin", "clopidogrel",
                    "insulin", "blood thinner", "anticoagul"]

CRITICAL_KEYWORDS = [
    "bleeding", "bleed", "blood", "unconscious", "unresponsive", "not breathing", "can't breathe",
    "cant breathe", "cannot breathe", "chest pain", "heart attack", "stroke", "seizure", "choking",
    "stabbed", "stab", "gunshot", "shot", "fire", "drowning", "overdose", "not moving", "no pulse",
    "collapsed", "head injury", "trapped", "kidnap", "rape", "attacked",
]
_CRIT_RE = [re.compile(r"\b" + re.escape(k), re.IGNORECASE) for k in CRITICAL_KEYWORDS]

TRIGGER_LABEL = {
    "sos": "Manual SOS",
    "impact": "Impact detected",
    "route_deviation": "Route deviation",
    "timer_expired": "Safety timer expired",
    "manual": "Manual report",
}


def _bump(level: str, n: int = 1) -> str:
    return LEVELS[min(LEVELS.index(level) + n, len(LEVELS) - 1)]


def _num(x: Any) -> Optional[float]:
    try:
        return float(x) if x is not None else None
    except (TypeError, ValueError):
        return None


def _risk_factors(medical: Any) -> list[str]:
    if not isinstance(medical, dict):
        return []
    found: list[str] = []
    for c in medical.get("conditions") or []:
        cl = str(c).lower()
        if any(k in cl for k in RISK_CONDITIONS):
            found.append(str(c))
    for m in medical.get("medications") or []:
        name = m.get("name") if isinstance(m, dict) else m
        if name and any(k in str(name).lower() for k in RISK_MEDICATIONS):
            found.append(f"on {name}")
    return found


def _critical_keywords(texts: list[str]) -> list[str]:
    hits: list[str] = []
    for text in texts:
        for kw, pat in zip(CRITICAL_KEYWORDS, _CRIT_RE):
            if pat.search(text) and kw not in hits:
                hits.append(kw)
    return hits


def rules_triage(req: dict[str, Any]) -> dict[str, Any]:
    trigger = req.get("trigger") or "manual"
    impact = req.get("impact") or {}
    impact_score = req.get("impactScore") or {}
    medical = req.get("medical")
    note = req.get("note") or ""
    user_texts = [str(m.get("content", "")) for m in (req.get("messages") or [])
                  if isinstance(m, dict) and m.get("role") == "user"]

    reasons: list[str] = []
    severity = BASE_BY_TRIGGER.get(trigger, "medium")
    reasons.append(f"{TRIGGER_LABEL.get(trigger, trigger)} (base {severity})")
    confidence = 0.6

    classification = impact_score.get("classification") or impact.get("classification")
    peaks = [p for p in (_num(impact.get("peakG")), _num(impact_score.get("peakG"))) if p is not None]
    peak_g = max(peaks) if peaks else None

    if classification == "vehicle_crash":
        severity = "critical"
        reasons.append("vehicle crash signature")
        confidence += 0.15
    if peak_g is not None and peak_g >= CRITICAL_PEAK_G:
        severity = "critical"
        reasons.append(f"peak {peak_g:.1f} g")
        confidence += 0.1
    if classification == "fall":
        reasons.append("fall detected")
        confidence += 0.05

    risks = _risk_factors(medical)
    if risks:
        severity = _bump(severity)
        reasons.append("medical risk: " + ", ".join(risks[:3]))
        confidence += 0.05

    kw_hits = _critical_keywords([note] + user_texts)
    if kw_hits:
        severity = "critical"
        reasons.append("reported: " + ", ".join(kw_hits[:4]))
        confidence += 0.15

    confidence = round(min(confidence, 0.95), 2)

    summary = f"{severity.upper()}: " + "; ".join(reasons) + "."
    if note:
        summary += f' Note: "{note.strip()[:160]}"'

    return {
        "severity": severity,
        "summary": summary,
        "recommendedActions": _actions(trigger, severity, classification, kw_hits, medical, risks),
        "confidence": confidence,
        "source": "rules",
    }


def _actions(trigger: str, severity: str, classification: Optional[str], kw_hits: list[str],
             medical: Any, risks: list[str]) -> list[str]:
    acts: list[str] = []
    if severity == "critical":
        acts.append("Dispatch ambulance / emergency services immediately")
    elif severity == "high":
        acts.append("Call the user now; dispatch help if no answer within 60 s")
    else:
        acts.append("Call the user to check on their safety")

    if classification == "vehicle_crash" or trigger == "impact":
        acts.append("Assume possible neck/spine injury; advise bystanders not to move the casualty")
    if classification == "fall":
        acts.append("Check for head injury and ability to move")
    if any(k in kw_hits for k in ("bleeding", "bleed", "blood", "stabbed", "stab", "gunshot", "shot")):
        acts.append("Coach direct pressure / tourniquet for severe bleeding")
    if any(k in kw_hits for k in ("unconscious", "unresponsive", "not breathing", "no pulse", "collapsed")):
        acts.append("Coach bystander CPR and locate nearest AED")
    if any(k in kw_hits for k in ("chest pain", "heart attack")):
        acts.append("Treat as possible heart attack; check aspirin allergy before advising aspirin")
    if trigger in ("route_deviation", "timer_expired"):
        acts.append("Contact the user and their primary contact; share live location with police if unreachable")
    if trigger == "sos":
        acts.append("Notify emergency contacts with live location")
    if isinstance(medical, dict):
        bt = medical.get("bloodType")
        if bt and bt != "Unknown":
            acts.append(f"Share blood type {bt} with paramedics")
        allergies = [str(a) for a in (medical.get("allergies") or []) if a]
        if allergies:
            acts.append("Inform responders of allergies: " + ", ".join(allergies[:4]))
    if risks:
        acts.append("Brief responders on medical risk: " + ", ".join(risks[:3]))
    if severity in ("high", "critical") and trigger != "manual":
        acts.append("Consider drone dispatch for first-aid kit / AED and live view")

    seen, out = set(), []
    for a in acts:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out[:6]


async def triage(req: dict[str, Any], llm: Optional[LLMClient]) -> dict[str, Any]:
    result = rules_triage(req)
    if llm is None or not llm.enabled:
        return result
    try:
        prompt = [
            {"role": "system", "content": (
                "You write one-sentence incident summaries for emergency responders. "
                "Be factual, under 40 words, no speculation or diagnosis. "
                'Answer only a JSON object: {"summary": string}.')},
            {"role": "user", "content": (
                f"Trigger: {req.get('trigger')}. Rule severity: {result['severity']}. "
                f"Signals: {result['summary']} Impact: {req.get('impactScore') or req.get('impact')}.")},
        ]
        raw = await asyncio.wait_for(llm.complete(prompt, json_mode=True, timeout_s=5, max_tokens=120),
                                     timeout=5.5)
        summary = extract_json_object(raw).get("summary")
        if isinstance(summary, str) and summary.strip():
            result = {**result, "summary": summary.strip()[:400], "source": "llm"}
    except Exception as exc:
        log.warning("LLM triage summary failed: %s", type(exc).__name__)
    return result
