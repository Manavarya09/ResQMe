"""Deterministic rule-based first-aid / crisis-support engine.

Used when the LLM is unavailable, times out, or returns something unusable.
Guidance follows mainstream lay first-aid practice (Red Cross / St John / AHA style)
and always steers the user to emergency services for life-threatening signs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Emergency numbers
# ---------------------------------------------------------------------------
EMERGENCY_NUMBERS: dict[str, str] = {
    "IN": "112", "US": "911", "CA": "911", "MX": "911", "GB": "999", "UK": "999",
    "IE": "112", "AU": "000", "NZ": "111", "AE": "999", "SA": "997", "SG": "995",
    "MY": "999", "PK": "15", "BD": "999", "LK": "119", "NP": "100", "PH": "911",
    "JP": "119", "KR": "119", "CN": "120", "HK": "999", "ZA": "112", "NG": "112",
    "KE": "999", "BR": "192", "AR": "107",
}
DEFAULT_EMERGENCY_NUMBER = "112"  # works on GSM phones in most countries


def emergency_number(country: Optional[str]) -> str:
    if not country:
        return DEFAULT_EMERGENCY_NUMBER
    return EMERGENCY_NUMBERS.get(str(country).strip().upper(), DEFAULT_EMERGENCY_NUMBER)


# ---------------------------------------------------------------------------
# Topics
# ---------------------------------------------------------------------------
@dataclass
class Topic:
    id: str
    keywords: list[str]
    reply: str  # may contain {num}
    suggestions: list[str]
    video_ids: list[str] = field(default_factory=list)
    severity: Optional[str] = None
    patterns: list[re.Pattern] = field(default_factory=list, repr=False)

    def __post_init__(self) -> None:
        self.patterns = [re.compile(r"\b" + re.escape(k), re.IGNORECASE) for k in self.keywords]

    def matches(self, text: str) -> bool:
        return any(p.search(text) for p in self.patterns)


# Order == priority: the most time-critical conditions are checked first.
TOPICS: list[Topic] = [
    Topic(
        id="cpr",
        keywords=["not breathing", "isn't breathing", "isnt breathing", "stopped breathing",
                  "no pulse", "no heartbeat", "unconscious", "unresponsive", "not responding",
                  "won't wake", "wont wake", "not waking", "collapsed", "cardiac arrest",
                  "cpr", "gasping", "passed out", "fainted"],
        reply=(
            "Call {num} now and put the phone on speaker.\n"
            "1. Tap their shoulders and shout. Check for normal breathing for no more than 10 seconds.\n"
            "2. If they are NOT breathing normally (or only gasping): start CPR. Kneel beside them, "
            "heel of one hand in the centre of the chest, other hand on top.\n"
            "3. Push hard and fast: 5-6 cm deep, 100-120 pushes a minute (to the beat of 'Stayin' Alive'). "
            "Let the chest come fully back up each time.\n"
            "4. Don't stop until help arrives or they start breathing. Send someone to find an AED "
            "(defibrillator) and switch it on - it talks you through it.\n"
            "5. If they ARE breathing but unresponsive: roll them onto their side (recovery position) "
            "and keep watching their breathing.\n"
            "Are they breathing normally right now?"
        ),
        suggestions=["They're not breathing", "They're breathing", "Found an AED", "How deep do I push?"],
        video_ids=["cpr", "recovery_position"],
        severity="critical",
    ),
    Topic(
        id="choking",
        keywords=["choking", "choke", "chok", "stuck in throat", "stuck in his throat",
                  "stuck in her throat", "something in throat", "heimlich", "can't swallow"],
        reply=(
            "1. Ask: 'Are you choking?' If they can cough or speak, encourage them to keep coughing hard.\n"
            "2. If they can't breathe, speak or cough: stand behind them, lean them forward and give up to "
            "5 firm back blows between the shoulder blades with the heel of your hand.\n"
            "3. Still stuck? Give up to 5 abdominal thrusts: fist just above the belly button, other hand over it, "
            "pull sharply in and up.\n"
            "4. Keep alternating 5 back blows and 5 thrusts. Call {num} if it hasn't cleared after 3 cycles.\n"
            "5. If they become unresponsive: call {num}, lay them down and start CPR.\n"
            "For babies under 1: back blows face-down along your forearm, then 5 chest thrusts with 2 fingers.\n"
            "Can they cough or make any sound?"
        ),
        suggestions=["They can't cough", "It's a baby", "It cleared", "They passed out"],
        video_ids=["choking", "cpr"],
        severity="critical",
    ),
    Topic(
        id="bleeding",
        keywords=["bleed", "blood", "stab", "gash", "deep cut", "cut", "wound", "laceration",
                  "amputat", "spurting", "gunshot", "shot"],
        reply=(
            "Call {num} now if the blood is spurting, pooling, or won't slow down.\n"
            "1. Wear gloves or use a plastic bag if you can. Lay the person down.\n"
            "2. Press firmly and directly on the wound with a clean cloth, pad or your hand. Don't let go.\n"
            "3. If blood soaks through, add more cloth on top - don't remove the first layer - and press harder.\n"
            "4. If it's an arm or leg and pressure isn't stopping life-threatening bleeding, tie a tourniquet "
            "5-7 cm above the wound (not on a joint) and twist until the bleeding stops. Note the time.\n"
            "5. If something is stuck in the wound, don't pull it out - press around it.\n"
            "6. Keep them warm and still; raise their legs if they feel faint.\n"
            "Is the bleeding slowing with pressure?"
        ),
        suggestions=["It won't stop", "It's slowing down", "They feel faint", "Object is stuck in wound"],
        video_ids=["bleeding"],
        severity="critical",
    ),
    Topic(
        id="chest_pain",
        keywords=["chest pain", "chest hurts", "chest tight", "tight chest", "pain in chest",
                  "pain in my chest", "heart attack", "crushing", "pain in left arm", "left arm pain"],
        reply=(
            "Chest pain can be a heart attack - call {num} now, don't drive yourself.\n"
            "1. Sit them down, leaning back comfortably (half-sitting). Loosen tight clothing.\n"
            "2. If they are not allergic to aspirin, not on blood thinners and an adult, they can slowly chew "
            "one regular aspirin (300 mg) unless a doctor has said not to.\n"
            "3. If they have their own angina spray/tablets (GTN), help them take it.\n"
            "4. Keep them calm and still. Stay with them and watch their breathing.\n"
            "5. If they collapse and stop breathing normally, start CPR and get an AED.\n"
            "Is the pain spreading to the arm, jaw or back, or are they sweaty or short of breath?"
        ),
        suggestions=["Yes, it's spreading", "They're short of breath", "They collapsed", "Pain is easing"],
        video_ids=["cpr"],
        severity="critical",
    ),
    Topic(
        id="seizure",
        keywords=["seizure", "fitting", "having a fit", "convuls", "epilep", "shaking uncontrollably",
                  "jerking"],
        reply=(
            "1. Stay calm and note the time the seizure started.\n"
            "2. Move hard or sharp objects away. Cushion their head with something soft.\n"
            "3. Do NOT hold them down and do NOT put anything in their mouth.\n"
            "4. Loosen anything tight around the neck.\n"
            "5. When the shaking stops, roll them onto their side (recovery position) and check breathing.\n"
            "Call {num} if it lasts more than 5 minutes, it's their first seizure, they're injured, pregnant, "
            "in water, or don't wake up / breathe normally afterwards.\n"
            "How long has the seizure been going on?"
        ),
        suggestions=["Over 5 minutes", "It stopped", "First seizure ever", "They're not waking up"],
        video_ids=["seizure", "recovery_position"],
        severity="high",
    ),
    Topic(
        id="head_injury",
        keywords=["head injury", "hit his head", "hit her head", "hit my head", "hit their head",
                  "head wound", "banged head", "concussion", "skull", "fell on head", "knocked out"],
        reply=(
            "1. Keep them still. If they may have hurt their neck (fall from height, crash), don't move their "
            "head or neck unless they're in danger.\n"
            "2. Press a clean cloth on any bleeding - gently if the skull feels soft or dented.\n"
            "3. Hold something cold (wrapped ice) on a swelling for up to 20 minutes.\n"
            "4. Watch them closely for the next few hours.\n"
            "Call {num} now if they were knocked out, are confused, very sleepy, vomiting, have a seizure, "
            "clear fluid from nose/ears, unequal pupils, weakness, or trouble speaking.\n"
            "Did they lose consciousness at any point?"
        ),
        suggestions=["Yes, they blacked out", "They're vomiting", "They seem confused", "They seem okay"],
        video_ids=["recovery_position"],
        severity="high",
    ),
    Topic(
        id="road_accident",
        keywords=["accident", "crash", "collision", "hit by a car", "hit by car", "run over",
                  "car overturned", "bike fell", "vehicle", "rear-ended", "pile-up"],
        reply=(
            "Your safety comes first. Call {num} and give the exact location.\n"
            "1. Park safely away, hazard lights on. Watch for traffic; don't stand in the road.\n"
            "2. Switch off crashed vehicles' engines if you safely can. No smoking - fuel may leak.\n"
            "3. Don't move injured people unless there's fire or other immediate danger - neck/back injuries "
            "are common. Don't remove a motorcyclist's helmet unless they aren't breathing.\n"
            "4. Check each person: responsive? breathing? major bleeding? Treat bleeding with firm pressure.\n"
            "5. Keep them warm, talk to them, and reassure them until help arrives.\n"
            "How many people are hurt, and is anyone unconscious or bleeding badly?"
        ),
        suggestions=["Someone is bleeding", "Someone is unconscious", "Car is smoking", "No one badly hurt"],
        video_ids=["bleeding", "cpr"],
        severity="high",
    ),
    Topic(
        id="fire",
        keywords=["fire", "on fire", "flames", "smoke", "burning building", "house burning", "blaze"],
        reply=(
            "Get out, stay out, and call {num} (fire services) once you're safe.\n"
            "1. Alert everyone and leave immediately - don't stop for belongings.\n"
            "2. Stay low under smoke; cover nose and mouth with cloth.\n"
            "3. Feel doors with the back of your hand before opening - if hot, use another way out.\n"
            "4. Don't use lifts. Close doors behind you to slow the fire.\n"
            "5. If trapped: seal door gaps with cloth, go to a window, signal and call for help.\n"
            "6. If clothes catch fire: STOP, DROP and ROLL.\n"
            "Are you out of the building and safe right now?"
        ),
        suggestions=["I'm trapped", "We're outside", "Someone is burned", "Lots of smoke"],
        video_ids=["burns"],
        severity="critical",
    ),
    Topic(
        id="flood",
        keywords=["flood", "water rising", "rising water", "flash flood", "swept away", "drowning",
                  "submerged", "waterlogged"],
        reply=(
            "Move to higher ground now and call {num} if anyone is trapped or in the water.\n"
            "1. Never walk, swim or drive through flood water - 15 cm can knock you down, 60 cm can float a car.\n"
            "2. If your car is caught in rising water, get out and move to high ground if it's safe.\n"
            "3. If trapped in a building, go to the highest floor (not a closed attic) and signal for help.\n"
            "4. Turn off electricity and gas if you can do it safely; stay away from power lines.\n"
            "5. If someone is in the water: reach or throw something that floats - don't go in yourself.\n"
            "Are you on high ground right now, or is someone in the water?"
        ),
        suggestions=["We're trapped", "Someone is in the water", "We're on high ground", "Car is in water"],
        video_ids=["cpr"],
        severity="high",
    ),
    Topic(
        id="assault",
        keywords=["followed", "following me", "stalk", "assault", "attacked", "attacking me", "attacker", "harass",
                  "someone is chasing", "chasing me", "threaten", "robbed", "robbery", "mugged",
                  "kidnap", "unsafe", "being watched", "grabbed me", "rape", "abuse", "intruder",
                  "break in", "broke in"],
        reply=(
            "If you're in immediate danger, call {num} now (in India you can also dial 1091 women's helpline "
            "or 100 police). Your SOS button alerts your contacts with your location.\n"
            "1. Move toward people and light - a shop, petrol station, restaurant or police post.\n"
            "2. Don't go home if you're being followed; don't enter isolated areas.\n"
            "3. Call someone and stay on the line, speaking your location out loud.\n"
            "4. If someone grabs you, shout loudly ('FIRE' or 'HELP'), make noise and run as soon as you can.\n"
            "5. Hand over belongings if threatened - your life matters more.\n"
            "Are you somewhere safe or public right now?"
        ),
        suggestions=["I'm still being followed", "I'm in a safe place", "Send SOS", "I've been hurt"],
        video_ids=[],
        severity="high",
    ),
    Topic(
        id="burns",
        keywords=["burn", "scald", "boiling water", "hot oil", "hot water", "acid", "chemical splash",
                  "electric shock", "electrocut"],
        reply=(
            "1. Stop the burning: move away from the heat. For electric shock, switch off the power before touching them.\n"
            "2. Cool the burn under cool running water for 20 minutes. No ice, butter, toothpaste or creams.\n"
            "3. Remove rings, watches and clothing near the burn - unless stuck to the skin.\n"
            "4. Cover loosely with cling film or a clean non-fluffy cloth. Don't burst blisters.\n"
            "5. Keep the person warm (cool the burn, not the person).\n"
            "Call {num} for large burns (bigger than their hand), burns to face, hands, feet, genitals or airway, "
            "chemical or electrical burns, or if they're a child or elderly.\n"
            "How big is the burn and where is it?"
        ),
        suggestions=["It's a large burn", "Burn on face", "Chemical burn", "Small burn on hand"],
        video_ids=["burns"],
        severity="medium",
    ),
    Topic(
        id="fracture",
        keywords=["fractur", "broken", "broke", "bone", "sprain", "dislocat", "twisted ankle",
                  "can't move my", "cannot move my", "bent leg", "deformed"],
        reply=(
            "1. Keep the injured part still in the position you found it - don't try to straighten it.\n"
            "2. Support it with padding, a rolled towel or a sling. A splint can be tied above and below the injury.\n"
            "3. If bone is through the skin, cover it with a clean cloth and press around (not on) it to stop bleeding.\n"
            "4. Apply wrapped ice for up to 20 minutes to reduce swelling.\n"
            "5. Check fingers/toes stay warm and pink.\n"
            "Call {num} for a suspected neck, back, hip or thigh fracture, bone through the skin, "
            "or if the limb is cold, blue or numb.\n"
            "Where is the injury, and can they move their fingers or toes?"
        ),
        suggestions=["Bone is showing", "It's the leg", "Neck or back pain", "They can move it"],
        video_ids=["fracture"],
        severity="medium",
    ),
    Topic(
        id="heatstroke",
        keywords=["heatstroke", "heat stroke", "sunstroke", "heat exhaustion", "overheat", "too hot",
                  "dehydrat", "hot and confused", "stopped sweating"],
        reply=(
            "Heatstroke is an emergency - call {num} if they're confused, not sweating, very hot, or collapse.\n"
            "1. Move them to shade or a cool room right away.\n"
            "2. Remove extra clothing. Cool them fast: wet their skin with cool water and fan them; "
            "place cold packs or wet cloths on neck, armpits and groin.\n"
            "3. If they're alert and can swallow, give small sips of cool water or an oral rehydration drink.\n"
            "4. If they become unresponsive but are breathing, put them in the recovery position.\n"
            "Are they confused, or is their skin hot and dry?"
        ),
        suggestions=["They're confused", "They're sweating a lot", "They fainted", "Feeling better"],
        video_ids=["heatstroke", "recovery_position"],
        severity="high",
    ),
    Topic(
        id="panic",
        keywords=["panic", "anxiety", "anxious", "scared", "terrified", "freaking out", "can't calm",
                  "cant calm", "shaking", "can't breathe", "cant breathe", "hyperventilat", "overwhelmed",
                  "afraid", "frightened", "help me"],
        reply=(
            "I'm here with you. You're not alone, and we'll take this one step at a time.\n"
            "1. Breathe with me: in through your nose for 4... hold for 4... out slowly through your mouth for 6.\n"
            "2. Repeat that 5 times. Let your shoulders drop.\n"
            "3. Ground yourself: name 5 things you can see, 4 you can touch, 3 you can hear.\n"
            "4. Press your feet into the floor and feel it holding you.\n"
            "If you have chest pain, fainting, or real trouble breathing, or anyone is in danger, call {num} now.\n"
            "Are you physically safe right now?"
        ),
        suggestions=["I'm safe", "I'm not safe", "Still panicking", "Someone is hurt"],
        video_ids=[],
        severity="low",
    ),
]

DEFAULT_REPLY = (
    "I'm ResQMe's emergency assistant. I'm here to help you stay calm and take the right next step.\n"
    "If anyone is unconscious, not breathing, bleeding heavily or in danger, call {num} right now.\n"
    "What's happening - is someone hurt, or are you feeling unsafe?"
)
DEFAULT_SUGGESTIONS = ["Someone is bleeding", "Someone isn't breathing", "I've had an accident", "I feel unsafe"]

TOPICS_BY_ID = {t.id: t for t in TOPICS}


def match_topic(text: str) -> Optional[Topic]:
    if not text:
        return None
    for topic in TOPICS:
        if topic.matches(text):
            return topic
    return None


def _latest_user_texts(messages: list[dict[str, Any]]) -> list[str]:
    return [str(m.get("content", "")) for m in reversed(messages or [])
            if m.get("role") == "user" and m.get("content")]


def rules_reply(messages: list[dict[str, Any]], context: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Return a ChatResponse-shaped dict with source='rules'."""
    context = context or {}
    num = emergency_number(context.get("country"))
    user_texts = _latest_user_texts(messages)

    topic = match_topic(user_texts[0]) if user_texts else None
    # If the latest message is a short follow-up ("yes", "it won't stop"...), keep the earlier topic.
    if topic is None:
        for earlier in user_texts[1:]:
            topic = match_topic(earlier)
            if topic:
                break

    if topic is None:
        reply = DEFAULT_REPLY.format(num=num)
        result = {"reply": reply, "suggestions": list(DEFAULT_SUGGESTIONS), "videoIds": [],
                  "severity": None, "source": "rules"}
    else:
        result = {"reply": topic.reply.format(num=num), "suggestions": list(topic.suggestions[:4]),
                  "videoIds": list(topic.video_ids), "severity": topic.severity, "source": "rules"}

    prefix = _context_prefix(context, topic)
    if prefix:
        result["reply"] = prefix + result["reply"]
    return result


def _context_prefix(context: dict[str, Any], topic: Optional[Topic]) -> str:
    parts: list[str] = []
    if context.get("incidentActive"):
        parts.append("Your SOS is active - your contacts and responders have your location.")
    medical = context.get("medical") or {}
    if isinstance(medical, dict) and topic is not None and topic.id in {"chest_pain", "bleeding"}:
        allergies = [str(a).lower() for a in (medical.get("allergies") or [])]
        if topic.id == "chest_pain" and any("aspirin" in a or "nsaid" in a for a in allergies):
            parts.append("Medical ID lists an aspirin allergy - do NOT give aspirin.")
    return (" ".join(parts) + "\n") if parts else ""
