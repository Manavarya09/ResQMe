"""Environment configuration. Values are read lazily so tests can override env vars."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load ai-service/.env without overriding variables already present in the environment.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

DEFAULT_MODEL = "openai/gpt-4o-mini"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def api_key() -> str:
    return os.getenv("OPENROUTER_API_KEY", "").strip()


def model() -> str:
    return os.getenv("OPENROUTER_MODEL", "").strip() or DEFAULT_MODEL


def llm_timeout_s() -> float:
    try:
        return float(os.getenv("LLM_TIMEOUT_S", "12"))
    except ValueError:
        return 12.0


def llm_disabled() -> bool:
    return os.getenv("RESQME_DISABLE_LLM", "0").strip().lower() in {"1", "true", "yes"}


def llm_enabled() -> bool:
    return bool(api_key()) and not llm_disabled()
