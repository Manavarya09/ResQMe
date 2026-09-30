from app.motion import score_motion
from tests import samples


def test_none_classification():
    r = score_motion(samples.none_window())
    assert r["classification"] == "none"
    assert r["impactDetected"] is False
    assert r["score"] <= 0.25


def test_drop_classification():
    r = score_motion(samples.drop_window())
    assert r["impactDetected"] is True
    assert r["freeFallMs"] >= 150
    assert r["stillnessAfter"] is False
    assert r["classification"] == "drop"
    assert 0.25 <= r["score"] <= 0.5


def test_fall_classification():
    r = score_motion(samples.fall_window())
    assert r["impactDetected"] is True
    assert r["freeFallMs"] >= 150
    assert r["stillnessAfter"] is True
    assert r["classification"] == "fall"
    assert r["score"] >= 0.6


def test_vehicle_crash_classification():
    r = score_motion(samples.crash_window())
    assert r["peakG"] >= 6
    assert r["freeFallMs"] == 0
    assert r["classification"] == "vehicle_crash"
    assert r["score"] >= 0.8
    assert r["rotationPeak"] == 6.0


def test_free_fall_duration_measured():
    r = score_motion(samples.fall_window())
    assert r["freeFallMs"] == 400  # 20 samples * 20 ms


def test_empty_window():
    r = score_motion([])
    assert r == {"impactDetected": False, "score": 0.0, "peakG": 0.0, "freeFallMs": 0,
                 "stillnessAfter": False, "rotationPeak": 0.0, "classification": "none"}


def test_missing_timestamps_use_sample_rate():
    win = samples.fall_window()
    for s in win:
        s["t"] = 0
    r = score_motion(win, sample_rate_hz=50)
    assert r["classification"] == "fall"
    assert r["freeFallMs"] == 400


def test_free_fall_with_big_impact_is_not_crash():
    mags = [1.0] * 25 + [0.1] * 15 + [7.0] + [1.0 + 0.5 * ((i % 2) * 2 - 1) for i in range(75)]
    win = [{"t": i * 20, "ax": 0, "ay": 0, "az": m} for i, m in enumerate(mags)]
    assert score_motion(win)["classification"] == "drop"


def test_scores_are_ordered():
    s = {k: score_motion(getattr(samples, f"{k}_window")())["score"]
         for k in ("none", "drop", "fall", "crash")}
    assert s["none"] < s["drop"] < s["fall"] < s["crash"]
