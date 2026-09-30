import asyncio

from app.triage import rules_triage, triage
from tests.conftest import FakeLLM


def sev(**req):
    return rules_triage(req)["severity"]


def test_base_by_trigger():
    assert sev(trigger="sos") == "high"
    assert sev(trigger="impact") == "high"
    assert sev(trigger="route_deviation") == "medium"
    assert sev(trigger="timer_expired") == "medium"
    assert sev(trigger="manual") == "medium"


def test_vehicle_crash_is_critical():
    assert sev(trigger="impact", impactScore={"classification": "vehicle_crash", "peakG": 6.5}) == "critical"
    assert sev(trigger="impact", impact={"peakG": 4, "classification": "vehicle_crash"}) == "critical"


def test_peak_g_threshold():
    assert sev(trigger="impact", impact={"peakG": 8.0}) == "critical"
    assert sev(trigger="impact", impact={"peakG": 7.9}) == "high"


def test_medical_conditions_bump_one_level():
    assert sev(trigger="manual", medical={"conditions": ["Type 1 Diabetes"]}) == "high"
    assert sev(trigger="sos", medical={"conditions": ["Asthma"]}) == "critical"
    assert sev(trigger="route_deviation", medical={"conditions": ["Epilepsy", "heart disease"]}) == "high"
    assert sev(trigger="manual", medical={"conditions": ["myopia"]}) == "medium"


def test_note_keywords_make_critical():
    assert sev(trigger="manual", note="He is bleeding a lot") == "critical"
    assert sev(trigger="timer_expired", note="friend is unconscious") == "critical"
    assert sev(trigger="manual", note="not breathing!") == "critical"
    assert sev(trigger="manual", note="Chest pain since 10 min") == "critical"
    assert sev(trigger="manual", note="lost my way") == "medium"


def test_keywords_from_messages():
    assert sev(trigger="manual", messages=[{"role": "user", "content": "she collapsed"}]) == "critical"


def test_output_shape_and_determinism():
    req = {"trigger": "impact", "impactScore": {"classification": "fall", "peakG": 5},
           "medical": {"bloodType": "O+", "allergies": ["penicillin"], "conditions": ["asthma"]}}
    a, b = rules_triage(req), rules_triage(req)
    assert a == b
    assert set(a) == {"severity", "summary", "recommendedActions", "confidence", "source"}
    assert a["severity"] == "critical"
    assert a["source"] == "rules"
    assert 0 <= a["confidence"] <= 1
    assert any("O+" in x for x in a["recommendedActions"])
    assert any("penicillin" in x for x in a["recommendedActions"])


def test_llm_can_only_change_summary():
    llm = FakeLLM('{"summary": "Driver in crash, unresponsive.", "severity": "low"}')
    r = asyncio.run(triage({"trigger": "impact", "impact": {"peakG": 9}}, llm))
    assert r["severity"] == "critical"
    assert r["summary"] == "Driver in crash, unresponsive."
    assert r["source"] == "llm"
    assert llm.calls[0]["timeout_s"] == 5


def test_llm_failure_keeps_rules():
    llm = FakeLLM(TimeoutError())
    r = asyncio.run(triage({"trigger": "sos"}, llm))
    assert r["source"] == "rules" and r["severity"] == "high"
