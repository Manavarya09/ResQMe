# ResQMe AI service

FastAPI service (port 8100) providing crisis-support chat (OpenRouter LLM with a deterministic
first-aid rules fallback), incident triage, and motion/impact scoring.
Contract: `docs/superpowers/specs/2026-09-30-resqme-design.md` section 4.

## Setup

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env   # then set OPENROUTER_API_KEY (optional; without it the rules engine is used)
```

## Run

```powershell
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8100
# or: .\run.ps1
```

## Test

```powershell
.venv\Scripts\python -m pytest -q
```

Tests never touch the network (LLM disabled via `RESQME_DISABLE_LLM=1`, HTTP blocked, LLM mocked).

## Endpoints

- `GET /health` → `{ ok, provider: 'openrouter'|'rules', model }`
- `POST /chat` `{ messages, context? }` → `{ reply, suggestions, videoIds, severity, source }`
- `POST /triage` `{ trigger, impact?, impactScore?, note?, medical?, messages? }` → `{ severity, summary, recommendedActions, confidence, source }`
- `POST /motion/score` `{ samples, sampleRateHz? }` → `{ impactDetected, score, peakG, freeFallMs, stillnessAfter, rotationPeak, classification }`
