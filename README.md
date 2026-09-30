# ResQMe — Intelligent Cyber-Physical Emergency Response System

ResQMe turns a phone into an emergency responder's best friend. It **detects** crashes and falls with motion
sensors, **escalates** automatically if you don't respond, **transmits** your live location and encrypted medical ID
to responders, **dispatches** a (simulated) drone for reconnaissance, and **guides** you or bystanders with an AI
crisis chatbot and 2-minute first-aid videos — while warning you about nearby crime and climate hazards.

```
┌──────────────┐   REST + Socket.IO   ┌──────────────────┐   HTTP   ┌──────────────────┐
│  mobile/     │ ───────────────────▶ │  backend/        │ ───────▶ │  ai-service/     │
│  Expo app    │ ◀─── live updates ── │  Node + Express  │          │  FastAPI         │
│  (Expo Go)   │                      │  PostgreSQL 16   │          │  OpenRouter LLM  │
└──────────────┘                      │  drone simulator │          │  triage + motion │
                                      └────────┬─────────┘          └──────────────────┘
                     responder console ◀───────┘  /dashboard  (Leaflet map, live queue)
```

| Layer (proposal) | Implementation |
|---|---|
| **Physical / sensing** | GPS (`expo-location`), accelerometer + gyroscope at 50 Hz (`expo-sensors`), Open-Meteo weather, crime/accident feed, simulated drone fleet |
| **Cyber / intelligence** | On-device impact detector + server motion scoring, AI triage, OpenRouter crisis chatbot with rule-based offline fallback, AES-256-GCM medical records, Socket.IO alert routing |
| **Actuation / response** | Hold-to-SOS, quick dial (country presets), SMS to contacts, responder dashboard, drone dispatch, route corridor + safety timer, CPR pacer |

## Features

- **SOS** — hold for 1.5 s; a 5 s cancel window, then responders get your location, medical ID and AI triage.
- **Crash & fall detection** — free-fall → impact → stillness analysis; a 30 s "Are you OK?" countdown with vibration filters false alarms before auto-escalating.
- **Walk with me** — tap a route on the map, set a time limit; leaving the 150 m safety corridor for 60 s or running late escalates automatically.
- **AI crisis guide** — calm, step-by-step guidance (bleeding, CPR, choking, seizures, assault, panic…), severity badges, quick replies, linked training videos, read-aloud mode, incident-aware context (your medical ID, trigger, country).
- **Medical ID** — blood type, allergies, conditions, medications; encrypted at rest; QR code opens a 24 h responder link; consent toggle for auto-transmit.
- **Hazard alerts** — real weather hazards (heat, flood, fog, storm/hail) from Open-Meteo, crime/accident zones, community reports, local notifications.
- **Drone reconnaissance** — nearest drone dispatched, streamed live to the app and dashboard until on scene.
- **First-aid micro-training** — 8 modules with official British Red Cross / St John Ambulance videos and a 110 bpm CPR pacer.
- **Responder console** — live severity-sorted queue, map, triage, impact score, medical card, timeline, acknowledge with ETA, dispatch drone, resolve.
- **Resilience** — works offline for detection, countdown, quick dial and SMS; restores active incidents after restart; biometric app lock.

## Quick start (Windows / macOS / Linux)

Prerequisites: Node 20+, Python 3.11+, PostgreSQL 16 running locally, and the **Expo Go** app on your phone (SDK 54).

```bash
# 1. databases (once)
createdb -U postgres resqme && createdb -U postgres resqme_test

# 2. configuration (copy and fill in)
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env      # add your OPENROUTER_API_KEY

# 3. install everything + seed demo data
npm install && npm run setup

# 4. run AI service + API + Expo together
npm run dev
```

Scan the QR code from the Expo output with Expo Go (phone and PC on the same Wi-Fi). The app finds the API
automatically on your PC's LAN IP; override with `EXPO_PUBLIC_API_URL` if needed.

- Web preview of the app: `npm run dev:web` → http://localhost:8082
- Responder console: http://localhost:4100/dashboard

**Demo accounts** (created by `npm run seed`)

| Role | Email | Password |
|---|---|---|
| User | `demo@resqme.app` | `Demo@1234` |
| Responder | `responder@resqme.app` | `Responder@123` |

## Testing

```bash
npm test        # backend (Jest + Supertest) · ai-service (pytest) · mobile logic (Jest)
npm run e2e     # full accident workflow against the running stack (14 steps)
```

## Repository layout

```
mobile/       Expo SDK 54 app — src/{screens,components,context,hooks,lib}
backend/      Express API, Socket.IO, migrations, drone simulator, tests
ai-service/   FastAPI — /chat, /triage, /motion/score, rules engine, tests
dashboard/    Responder console (static, served by the backend)
scripts/      e2e.js, cross-platform Python launcher
docs/         Design spec & interface contract
```

## Ethics, privacy & limits

- Medical data is encrypted with AES-256-GCM; location is only streamed during an emergency you trigger (consent toggle).
- The AI supports and never replaces emergency services — every critical answer tells you to call your emergency number.
- No IMEI tracking. Satellite fallback is a future-phase hook.
- Platform limits: iOS/Android don't allow silent SMS or calls, so the SMS composer opens pre-filled; live video calls and
  closed-app push notifications need a development build rather than Expo Go; drones are simulated.
