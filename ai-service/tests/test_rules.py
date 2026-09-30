import pytest

from app.catalog import VIDEO_IDS, match_videos, validate_video_ids
from app.rules import TOPICS, emergency_number, match_topic, rules_reply


@pytest.mark.parametrize("text,topic", [
    ("my friend is bleeding heavily from the leg", "bleeding"),
    ("He is NOT BREATHING", "cpr"),
    ("she collapsed and is unresponsive", "cpr"),
    ("my baby is choking on a grape", "choking"),
    ("I burned my hand on the stove", "burns"),
    ("I think his arm is broken", "fracture"),
    ("he hit his head on the pavement", "head_injury"),
    ("my son is having a seizure", "seizure"),
    ("dad has crushing chest pain", "chest_pain"),
    ("I'm having a panic attack", "panic"),
    ("there's been a car accident on the highway", "road_accident"),
    ("a man has been following me for 10 minutes", "assault"),
    ("the kitchen is on fire", "fire"),
    ("flood water is rising in our street", "flood"),
    ("she has heatstroke and is confused", "heatstroke"),
])
def test_keyword_routing(text, topic):
    assert match_topic(text).id == topic


def test_priority_bleeding_over_accident():
    assert match_topic("car crash, the driver is bleeding").id == "bleeding"


def test_priority_not_breathing_over_heatstroke():
    assert match_topic("grandma collapsed from heatstroke").id == "cpr"


def test_no_false_positive_word_starts():
    assert match_topic("that was a benefit") is None


def test_default_reply():
    r = rules_reply([{"role": "user", "content": "hello"}], {"country": "IN"})
    assert r["source"] == "rules"
    assert r["severity"] is None
    assert "112" in r["reply"]
    assert 1 <= len(r["suggestions"]) <= 4


def test_latest_message_wins_and_follow_up_keeps_topic():
    msgs = [{"role": "user", "content": "he's bleeding"},
            {"role": "assistant", "content": "Press on it"},
            {"role": "user", "content": "someone is choking"}]
    assert rules_reply(msgs)["videoIds"][0] == "choking"
    msgs2 = msgs[:2] + [{"role": "user", "content": "ok what now?"}]
    assert rules_reply(msgs2)["videoIds"] == ["bleeding"]


def test_country_number():
    assert emergency_number("US") == "911"
    assert emergency_number("gb") == "999"
    assert emergency_number(None) == "112"
    r = rules_reply([{"role": "user", "content": "not breathing"}], {"country": "US"})
    assert "911" in r["reply"] and r["severity"] == "critical"


def test_all_topics_valid():
    for t in TOPICS:
        assert set(t.video_ids) <= set(VIDEO_IDS)
        assert len(t.suggestions) <= 4
        assert t.severity in ("low", "medium", "high", "critical")
        assert "?" in t.reply  # asks one key question
        assert "{num}" in t.reply  # every topic steers to emergency services


def test_life_threatening_topics_mention_number():
    for text in ["bleeding", "not breathing", "choking", "chest pain", "fire", "flood", "followed"]:
        assert "112" in rules_reply([{"role": "user", "content": text}])["reply"]


def test_aspirin_allergy_warning():
    r = rules_reply([{"role": "user", "content": "chest pain"}],
                    {"medical": {"allergies": ["Aspirin"]}, "incidentActive": True})
    assert "do NOT give aspirin" in r["reply"]
    assert "SOS is active" in r["reply"]


def test_catalog_helpers():
    assert validate_video_ids(["CPR", "bogus", "cpr", 3, "burns"]) == ["cpr", "burns"]
    assert validate_video_ids("cpr") == []
    assert match_videos("he is bleeding and not breathing") == ["cpr", "bleeding"]
    assert set(VIDEO_IDS) == {"cpr", "bleeding", "choking", "burns", "recovery_position",
                              "fracture", "seizure", "heatstroke"}
