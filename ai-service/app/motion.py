"""/motion/score: impact / fall / crash detection from an accelerometer + gyro window.

Algorithm (spec section 4):
  |a| = sqrt(ax^2 + ay^2 + az^2) in g
  free-fall  = contiguous run of |a| < 0.4 g (the longest run preceding the peak)
  impact     = peak |a| >= 2.5 g
  stillness  = std(|a|) < 0.15 g over a window >= 1 s after the peak
  vehicle_crash : peak >= 6 g with no free-fall
  fall          : free-fall >= 150 ms, then impact, then stillness
  drop          : free-fall + impact but no stillness (phone dropped and picked up)
"""
from __future__ import annotations

import math
from typing import Any, Optional

FREE_FALL_G = 0.4
IMPACT_G = 2.5
CRASH_G = 6.0
FALL_MIN_FREE_FALL_MS = 150.0
FREE_FALL_PRESENT_MS = 60.0      # shorter runs are treated as noise ("no free-fall")
FREE_FALL_LOOKBACK_MS = 1500.0   # free-fall must end within this window before the peak
STILL_STD_G = 0.15
STILL_WINDOW_MS = 1000.0
DEFAULT_RATE_HZ = 50.0


def _get(s: Any, k: str) -> float:
    v = s.get(k, 0.0) if isinstance(s, dict) else getattr(s, k, 0.0)
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _timestamps(samples: list, rate_hz: float) -> list[float]:
    ts = [_get(s, "t") for s in samples]
    increasing = all(b > a for a, b in zip(ts, ts[1:]))
    if len(ts) > 1 and increasing:
        return ts
    dt = 1000.0 / rate_hz
    return [i * dt for i in range(len(samples))]


def _std(vals: list[float]) -> float:
    n = len(vals)
    if n < 2:
        return 0.0
    m = sum(vals) / n
    return math.sqrt(sum((v - m) ** 2 for v in vals) / n)


def score_motion(samples: list, sample_rate_hz: Optional[float] = None) -> dict[str, Any]:
    rate = float(sample_rate_hz) if sample_rate_hz and sample_rate_hz > 0 else DEFAULT_RATE_HZ
    empty = {"impactDetected": False, "score": 0.0, "peakG": 0.0, "freeFallMs": 0,
             "stillnessAfter": False, "rotationPeak": 0.0, "classification": "none"}
    if not samples:
        return empty

    ts = _timestamps(samples, rate)
    n = len(samples)
    dt = (ts[-1] - ts[0]) / (n - 1) if n > 1 else 1000.0 / rate
    mags = [math.sqrt(_get(s, "ax") ** 2 + _get(s, "ay") ** 2 + _get(s, "az") ** 2) for s in samples]
    rots = [math.sqrt(_get(s, "gx") ** 2 + _get(s, "gy") ** 2 + _get(s, "gz") ** 2) for s in samples]

    peak_idx = max(range(n), key=lambda i: mags[i])
    peak_g = mags[peak_idx]
    rotation_peak = max(rots) if rots else 0.0
    impact = peak_g >= IMPACT_G

    # Longest free-fall run that ends before the peak and within the lookback window.
    free_fall_ms = 0.0
    i = 0
    while i < peak_idx:
        if mags[i] < FREE_FALL_G:
            j = i
            while j + 1 < peak_idx and mags[j + 1] < FREE_FALL_G:
                j += 1
            if ts[peak_idx] - ts[j] <= FREE_FALL_LOOKBACK_MS:
                free_fall_ms = max(free_fall_ms, ts[j] - ts[i] + dt)
            i = j + 1
        else:
            i += 1

    # Stillness: any window of >= 1 s after the peak with std(|a|) below threshold.
    stillness = False
    end = peak_idx + 1
    for start in range(peak_idx + 1, n):
        end = max(end, start)
        while end < n and ts[end] - ts[start] + dt < STILL_WINDOW_MS:
            end += 1
        if end >= n:
            break  # not enough data left for a full window
        if _std(mags[start:end + 1]) < STILL_STD_G:
            stillness = True
            break

    has_free_fall = free_fall_ms >= FREE_FALL_PRESENT_MS
    if not impact:
        classification = "none"
    elif peak_g >= CRASH_G and not has_free_fall:
        classification = "vehicle_crash"
    elif free_fall_ms >= FALL_MIN_FREE_FALL_MS and stillness:
        classification = "fall"
    elif has_free_fall and not stillness:
        classification = "drop"
    elif stillness:
        # Hard impact followed by lying still, without a clean free-fall phase (e.g. a collapse).
        classification = "fall"
    else:
        classification = "none"

    score = _score(classification, peak_g, free_fall_ms, stillness, rotation_peak)
    return {
        "impactDetected": impact,
        "score": score,
        "peakG": round(peak_g, 3),
        "freeFallMs": int(round(free_fall_ms)),
        "stillnessAfter": stillness,
        "rotationPeak": round(rotation_peak, 3),
        "classification": classification,
    }


_BANDS = {"none": (0.0, 0.25), "drop": (0.25, 0.5), "fall": (0.6, 0.95), "vehicle_crash": (0.8, 1.0)}


def _score(classification: str, peak_g: float, free_fall_ms: float, stillness: bool, rot: float) -> float:
    intensity = (0.5 * min(peak_g / 10.0, 1.0) + 0.2 * min(free_fall_ms / 500.0, 1.0)
                 + 0.2 * (1.0 if stillness else 0.0) + 0.1 * min(rot / 10.0, 1.0))
    lo, hi = _BANDS[classification]
    return round(lo + (hi - lo) * max(0.0, min(intensity, 1.0)), 3)
