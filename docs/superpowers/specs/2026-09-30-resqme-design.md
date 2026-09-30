# ResQMe — Design Spec & Interface Contract

Source: `ResQMe.docx` project proposal. Approved design decisions (2026-09-30):
full stack from the proposal (Node/Express + Python FastAPI + PostgreSQL), OpenRouter LLM,
Expo Go (SDK 54) mobile app, keep & polish the neumorphic orange style.

## 1. Repository layout

```
ResQMe/                  (git root)
├── mobile/              Expo SDK 54 mobile app (Expo Go + web preview)
├── backend/             Node 22 + Express + Socket.IO + PostgreSQL 16   → port 4100
├── ai-service/          Python 3.13 + FastAPI + OpenRouter               → port 8100
├── dashboard/           Responder web console (static, served by backend at /dashboard)
└── docs/
```

Local infra: PostgreSQL 16 on localhost:5432, user `postgres` / pw `postgres`,
databases `resqme` (dev) and `resqme_test` (tests).

## 2. Shared vocabulary

- **Trigger**: `sos | impact | route_deviation | timer_expired | manual`
- **Incident status**: `open | acknowledged | dispatched | resolved | cancelled`
- **Severity**: `low | medium | high | critical`
- **Hazard type**: `crime | weather | flood | heat | fog | storm | accident | other`
- **Hazard source**: `open-meteo | seed | user`
- **Drone status**: `idle | en_route | on_scene | returning`
- **Training/video ids** (catalog shared by mobile app and AI service):
  `cpr, bleeding, choking, burns, recovery_position, fracture, seizure, heatstroke`
- All JSON keys camelCase. Timestamps ISO-8601 strings. Coordinates WGS84 decimal degrees.

## 3. Backend REST API (`http://<host>:4100`)

Auth: `Authorization: Bearer <JWT>` (HS256, `JWT_SECRET`, 30-day expiry).
Errors: `{ "error": "<message>" }` with appropriate 4xx/5xx status.

### Health
- `GET /health` → `{ ok: true, db: boolean, ai: boolean }`

### Auth / user
- `POST /api/auth/register` `{ name, email, password (>=8), phone? }` → `201 { token, user }`
- `POST /api/auth/login` `{ email, password }` → `{ token, user }`
- `GET /api/me` → `User`
- `PATCH /api/me` `{ name?, phone?, country?, settings? }` → `User` (settings merged shallowly)

`User = { id, name, email, phone, role: 'user'|'responder', country: 'IN', settings: {}, createdAt }`

### Medical ID (stored AES-256-GCM encrypted at rest, key from `MEDICAL_KEY` hex 32 bytes)
- `GET /api/medical-id` → `MedicalID | null`
- `PUT /api/medical-id` `MedicalID` → `MedicalID` (with `updatedAt`)
- `POST /api/medical-id/share-token` → `{ token, url, expiresAt }` (24h, url = `/m/<token>`)
- `GET /api/medical-id/public/:token` (no auth) → `{ name, phone, medical: MedicalID, contacts: Contact[] }`
- `GET /m/:token` (no auth) → responder-friendly HTML page of the above

```
MedicalID = {
  bloodType: 'A+'|'A-'|'B+'|'B-'|'AB+'|'AB-'|'O+'|'O-'|'Unknown',
  allergies: string[], conditions: string[],
  medications: { name, dosage?, frequency? }[],
  organDonor: boolean, dateOfBirth?: 'YYYY-MM-DD', heightCm?: number, weightKg?: number,
  notes?: string, updatedAt?: string
}
```

### Contacts
- `GET /api/contacts` → `Contact[]`
- `POST /api/contacts` `{ name, phone, relation?, isPrimary? }` → `201 Contact`
- `PATCH /api/contacts/:id` → `Contact`;  `DELETE /api/contacts/:id` → `204`
- Setting `isPrimary: true` clears it on the user's other contacts.

`Contact = { id, name, phone, relation, isPrimary }`

### Incidents
- `POST /api/incidents`
  `{ trigger, lat, lng, accuracy?, note?, sensorWindow?: Sample[], impact?: { peakG, freeFallMs?, classification? } }`
  → `201 Incident`. Server snapshots the user's medical ID + contacts, calls AI `/triage`
  (and `/motion/score` when `sensorWindow` present) with a 4 s timeout and rule-based fallback,
  then emits `incident:new`.
- `GET /api/incidents?status=` → user: own incidents; responder: all. Newest first.
- `GET /api/incidents/:id` → `Incident & { events: IncidentEvent[] }`
- `POST /api/incidents/:id/location` `{ lat, lng }` → `204`, emits `incident:location`
- `POST /api/incidents/:id/cancel` (owner) → `Incident` (status `cancelled`)
- `POST /api/incidents/:id/ack` (responder) `{ etaMinutes }` → `Incident` (status `acknowledged`)
- `POST /api/incidents/:id/drone` (owner or responder) → `Drone` (status `dispatched` on incident)
- `POST /api/incidents/:id/resolve` (responder) → `Incident`

```
Incident = {
  id, userId, trigger, status, severity, lat, lng, accuracy, note,
  triage: { severity, summary, recommendedActions: string[], confidence, source: 'llm'|'rules' },
  impactScore: null | { impactDetected, score, peakG, classification },
  medicalSnapshot: MedicalID | null, contactsSnapshot: Contact[],
  user: { name, phone }, droneId: string|null, responderEtaMinutes: number|null,
  createdAt, updatedAt
}
IncidentEvent = { id, incidentId, type, message, data, createdAt }
Sample = { t (ms), ax, ay, az (g), gx, gy, gz (rad/s) }
```

### Hazards
- `GET /api/hazards?lat=&lng=&radiusKm=10` → `Hazard[]` (weather from Open-Meteo, 10-min cache;
  seeded crime/accident hazards generated deterministically near the query point if fewer than 3 exist
  within radius; plus user reports; expired ones excluded)
- `POST /api/hazards` `{ type, title, description?, lat, lng, severity? }` → `201 Hazard`, emits `hazard:new`

Weather → hazard rules: temp ≥ 40 °C → `heat`; precipitation ≥ 10 mm/h → `flood`;
visibility < 1000 m → `fog`; wind gusts ≥ 60 km/h → `storm`; WMO codes 95/96/99 → `storm` (hail/thunder).

```
Hazard = { id, type, severity, title, description, lat, lng, radiusM, source, createdAt, expiresAt }
```

### Drones (simulated)
- `GET /api/drones` → `Drone[]`
- Fleet of 3 seeded drones. On dispatch, nearest idle drone is used; if none within 25 km it is
  "repositioned" to a base 2–4 km from the incident (regional station simulation).
  Simulation tick 1 s, speed 15 m/s, `on_scene` within 30 m, battery −0.05 %/s en route.
  On incident resolve/cancel the drone goes `returning` → `idle` at base.

`Drone = { id, name, status, lat, lng, baseLat, baseLng, batteryPct, incidentId, etaSeconds }`

### Chat proxy
- `POST /api/chat` `{ messages: {role:'user'|'assistant', content}[], incidentId?, context? }`
  → forwards to AI `/chat` (15 s timeout); if the AI service is down returns a minimal rules reply.
  Response = AI `/chat` response.

### Socket.IO (same port)
Handshake `auth: { token }`. Rooms: `user:<id>`, `responders` (role responder).
Server → client events:
- `incident:new` Incident → `responders`
- `incident:updated` Incident → `responders` + `user:<ownerId>`
- `incident:location` `{ incidentId, lat, lng }` → `responders` + owner
- `drone:update` Drone → `responders` + owner of drone's incident
- `hazard:new` Hazard → everyone

### Seed data
- Responder: `responder@resqme.app` / `Responder@123`
- Demo user: `demo@resqme.app` / `Demo@1234` (with medical ID + 2 contacts)

## 4. AI service (`http://<host>:8100`)

Env: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`), `LLM_TIMEOUT_S` (default 12).
No key / error / timeout → deterministic rules engine. LLM is support, not a medical replacement:
every reply must steer to calling emergency services for life-threatening signs.

- `GET /health` → `{ ok: true, provider: 'openrouter'|'rules', model }`
- `POST /chat` `{ messages, context?: { incidentActive?, trigger?, medical?, location?, country? } }`
  → `{ reply, suggestions: string[] (≤4 short quick-replies), videoIds: string[] (from catalog),
       severity: Severity|null, source: 'llm'|'rules' }`
- `POST /triage` `{ trigger, impact?, impactScore?, note?, medical?, messages? }`
  → `{ severity, summary, recommendedActions: string[], confidence (0..1), source }`
  Rules: base by trigger (impact/sos → high, route_deviation/timer_expired → medium, manual → medium);
  vehicle_crash or peakG ≥ 8 → critical; critical conditions in medical (e.g. diabetes, epilepsy,
  heart, asthma) bump one level; keywords in note (bleeding, unconscious, not breathing, chest pain…) → critical.
- `POST /motion/score` `{ samples: Sample[], sampleRateHz? }`
  → `{ impactDetected, score (0..1), peakG, freeFallMs, stillnessAfter, rotationPeak,
       classification: 'none'|'drop'|'fall'|'vehicle_crash' }`
  Algorithm: magnitude |a|; free-fall = contiguous |a| < 0.4 g; impact = peak ≥ 2.5 g;
  stillness = std(|a|) < 0.15 g over ≥ 1 s after the peak. vehicle_crash if peak ≥ 6 g with no
  free-fall; fall if free-fall ≥ 150 ms then impact; drop if free-fall + impact but no stillness.

## 5. Mobile app (Expo Go, SDK 54)

Tabs: **SOS** (home), **Map**, **AI Chat**, **Medical ID**, **Settings**. Stack screens: onboarding/auth,
Training library + module detail, Incident (active emergency) screen, Contacts editor, Medical ID editor.

- API base URL derived from `Constants.expoConfig.hostUri` (LAN IP) → `http://<ip>:4100`,
  overridable with `EXPO_PUBLIC_API_URL`. Web preview uses `http://localhost:4100`.
- Impact detection on-device (`expo-sensors` 50 Hz) using the same algorithm as `/motion/score`;
  web/no-sensor builds show a "Simulate impact" control.
- Escalation: confirm modal with 30 s countdown + vibration → incident POST → SMS composer
  (`expo-sms`) to contacts with a maps link → incident screen with live status, drone, responder ETA,
  and AI chat in incident mode.
- Route tracking: `expo-location` watch, user-drawn waypoints, corridor 150 m, deviation > 60 s or
  duration limit exceeded → escalation flow with trigger `route_deviation` / `timer_expired`.
- Map: `react-native-maps` on native, Leaflet (CDN) on web.
- Quick dial (country presets; IN default: 112 national, 100 police, 101 fire, 108 ambulance, 1091 women).
- Local notifications (`expo-notifications`) for hazards within radius.
- Biometric app lock (`expo-local-authentication`), consent toggle for location sharing.
- Session + cached medical ID in `expo-secure-store` (AsyncStorage on web).

## 6. Out of scope (documented)
Silent auto-SMS/calls (OS-blocked), WebRTC video calls (not in Expo Go), real drones/satellite/IMEI
(simulated/hooks), remote push while app is closed (Expo Go limitation).

## 7. Testing
- backend: Jest + Supertest against `resqme_test`, AI calls mocked.
- ai-service: pytest, LLM mocked.
- mobile: Jest for pure logic (`lib/impactDetector`, `lib/geo`).
- E2E script: register → medical ID → incident → responder sees it via socket → ack → drone → resolve.
- Visual: Expo web + dashboard in the browser pane; final check in Expo Go.
