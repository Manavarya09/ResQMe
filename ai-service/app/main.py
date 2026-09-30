"""ResQMe AI service (FastAPI). Contract: docs/superpowers/specs/2026-09-30-resqme-design.md section 4."""
from __future__ import annotations

import logging
from typing import Any, Literal, Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from . import config
from .chat import handle_chat
from .llm import LLMClient, get_llm
from .motion import score_motion
from .triage import triage as run_triage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

Severity = Literal["low", "medium", "high", "critical"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="allow")


class ChatMessage(_Model):
    role: str
    content: str = ""


class ChatContext(_Model):
    incidentActive: Optional[bool] = None
    trigger: Optional[str] = None
    medical: Optional[dict[str, Any]] = None
    location: Optional[dict[str, Any]] = None
    country: Optional[str] = None


class ChatRequest(_Model):
    messages: list[ChatMessage] = Field(default_factory=list)
    context: Optional[ChatContext] = None


class ChatResponse(BaseModel):
    reply: str
    suggestions: list[str]
    videoIds: list[str]
    severity: Optional[Severity]
    source: Literal["llm", "rules"]


class TriageRequest(_Model):
    trigger: str = "manual"
    impact: Optional[dict[str, Any]] = None
    impactScore: Optional[dict[str, Any]] = None
    note: Optional[str] = None
    medical: Optional[dict[str, Any]] = None
    messages: Optional[list[dict[str, Any]]] = None


class TriageResponse(BaseModel):
    severity: Severity
    summary: str
    recommendedActions: list[str]
    confidence: float
    source: Literal["llm", "rules"]


class Sample(_Model):
    t: float = 0
    ax: float = 0
    ay: float = 0
    az: float = 0
    gx: float = 0
    gy: float = 0
    gz: float = 0


class MotionRequest(_Model):
    samples: list[Sample] = Field(default_factory=list)
    sampleRateHz: Optional[float] = None


class MotionResponse(BaseModel):
    impactDetected: bool
    score: float
    peakG: float
    freeFallMs: int
    stillnessAfter: bool
    rotationPeak: float
    classification: Literal["none", "drop", "fall", "vehicle_crash"]


app = FastAPI(title="ResQMe AI service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "provider": "openrouter" if config.llm_enabled() else "rules", "model": config.model()}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, llm: LLMClient = Depends(get_llm)) -> dict[str, Any]:
    messages = [m.model_dump() for m in req.messages]
    context = req.context.model_dump(exclude_none=True) if req.context else {}
    return await handle_chat(messages, context, llm)


@app.post("/triage", response_model=TriageResponse)
async def triage(req: TriageRequest, llm: LLMClient = Depends(get_llm)) -> dict[str, Any]:
    return await run_triage(req.model_dump(), llm)


@app.post("/motion/score", response_model=MotionResponse)
async def motion_score(req: MotionRequest) -> dict[str, Any]:
    return score_motion([s.model_dump() for s in req.samples], req.sampleRateHz)
