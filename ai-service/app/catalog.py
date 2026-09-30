"""Training video catalog shared with the mobile app (spec section 2)."""
from __future__ import annotations

import re

VIDEO_CATALOG: dict[str, dict] = {
    "cpr": {
        "title": "Hands-only CPR",
        "keywords": ["cpr", "not breathing", "no pulse", "unconscious", "unresponsive",
                     "cardiac arrest", "collapsed", "heart stopped", "resuscitat"],
    },
    "bleeding": {
        "title": "Stop severe bleeding",
        "keywords": ["bleed", "blood", "cut", "wound", "laceration", "stab", "gash",
                     "tourniquet", "amputat"],
    },
    "choking": {
        "title": "Choking: back blows & abdominal thrusts",
        "keywords": ["chok", "stuck in throat", "heimlich", "swallowed"],
    },
    "burns": {
        "title": "Treating burns",
        "keywords": ["burn", "scald", "boiling", "hot oil", "chemical splash"],
    },
    "recovery_position": {
        "title": "Recovery position",
        "keywords": ["recovery position", "breathing but unconscious", "passed out",
                     "fainted", "drowsy", "vomit"],
    },
    "fracture": {
        "title": "Fractures & immobilisation",
        "keywords": ["fractur", "broken", "broke", "bone", "sprain", "dislocat", "splint"],
    },
    "seizure": {
        "title": "Seizure first aid",
        "keywords": ["seizure", "fit", "convuls", "epilep", "shaking uncontrollably"],
    },
    "heatstroke": {
        "title": "Heatstroke & heat exhaustion",
        "keywords": ["heatstroke", "heat stroke", "heat exhaustion", "sunstroke",
                     "overheat", "too hot", "dehydrat"],
    },
}

VIDEO_IDS: tuple[str, ...] = tuple(VIDEO_CATALOG.keys())


def _kw_regex(kw: str) -> re.Pattern:
    # Word-start boundary so stems like "bleed" match "bleeding", but "fit" doesn't match "benefit".
    return re.compile(r"\b" + re.escape(kw), re.IGNORECASE)


_COMPILED = {vid: [_kw_regex(k) for k in meta["keywords"]] for vid, meta in VIDEO_CATALOG.items()}


def match_videos(text: str, limit: int = 2) -> list[str]:
    """Return catalog ids whose keywords appear in text (catalog order)."""
    if not text:
        return []
    out = [vid for vid, pats in _COMPILED.items() if any(p.search(text) for p in pats)]
    return out[:limit]


def validate_video_ids(ids) -> list[str]:
    """Keep only known catalog ids, de-duplicated, order preserved."""
    if not isinstance(ids, list):
        return []
    seen: list[str] = []
    for v in ids:
        if isinstance(v, str):
            key = v.strip().lower()
            if key in VIDEO_CATALOG and key not in seen:
                seen.append(key)
    return seen
