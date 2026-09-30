import json

import pytest
from fastapi.testclient import TestClient

from app.llm import get_llm
from app.main import app
from tests import samples
from tests.conftest import FakeLLM


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["provider"] == "rules"  # LLM disabled in tests
    assert isinstance(body["model"], str)


def test_chat_rules_shape(client):
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "someone is choking"}],
                                   "context": {"country": "IN", "incidentActive": False}})
    assert r.status_code == 200
    b = r.json()
    assert set(b) == {"reply", "suggestions", "videoIds", "severity", "source"}
    assert b["source"] == "rules" and b["videoIds"][0] == "choking" and len(b["suggestions"]) <= 4


def test_chat_llm_mocked(client):
    app.dependency_overrides[get_llm] = lambda: FakeLLM(json.dumps(
        {"reply": "Call 112. Press hard.", "suggestions": ["OK"], "videoIds": ["bleeding"], "severity": "critical"}))
    b = client.post("/chat", json={"messages": [{"role": "user", "content": "bleeding"}]}).json()
    assert b["source"] == "llm" and b["videoIds"] == ["bleeding"]


def test_chat_llm_error_fallback(client):
    app.dependency_overrides[get_llm] = lambda: FakeLLM(ConnectionError("down"))
    b = client.post("/chat", json={"messages": [{"role": "user", "content": "bleeding"}]}).json()
    assert b["source"] == "rules"


def test_chat_empty_messages(client):
    b = client.post("/chat", json={"messages": []}).json()
    assert b["source"] == "rules" and b["severity"] is None


def test_triage_endpoint(client):
    r = client.post("/triage", json={"trigger": "impact",
                                     "impactScore": {"impactDetected": True, "score": 0.9, "peakG": 9.1,
                                                     "classification": "vehicle_crash"},
                                     "medical": {"bloodType": "A+", "allergies": [], "conditions": [],
                                                 "medications": [], "organDonor": False}})
    assert r.status_code == 200
    b = r.json()
    assert set(b) == {"severity", "summary", "recommendedActions", "confidence", "source"}
    assert b["severity"] == "critical" and b["source"] == "rules"


@pytest.mark.parametrize("name,expected", [("none", "none"), ("drop", "drop"),
                                           ("fall", "fall"), ("crash", "vehicle_crash")])
def test_motion_endpoint(client, name, expected):
    r = client.post("/motion/score", json={"samples": getattr(samples, f"{name}_window")(), "sampleRateHz": 50})
    assert r.status_code == 200
    b = r.json()
    assert set(b) == {"impactDetected", "score", "peakG", "freeFallMs", "stillnessAfter",
                      "rotationPeak", "classification"}
    assert b["classification"] == expected


def test_cors(client):
    r = client.options("/chat", headers={"Origin": "http://localhost:8081",
                                         "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") in ("*", "http://localhost:8081")
