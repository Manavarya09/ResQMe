"""Minimal OpenRouter chat-completions client (httpx, async)."""
from __future__ import annotations

from typing import Any, Optional

import httpx

from . import config


class LLMError(Exception):
    """Raised for any LLM failure (disabled, HTTP error, timeout, bad payload)."""


class LLMClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None,
                 timeout_s: Optional[float] = None) -> None:
        self.api_key = api_key if api_key is not None else config.api_key()
        self.model = model or config.model()
        self.timeout_s = timeout_s if timeout_s is not None else config.llm_timeout_s()

    @property
    def enabled(self) -> bool:
        return bool(self.api_key) and not config.llm_disabled()

    async def complete(self, messages: list[dict[str, str]], *, json_mode: bool = True,
                       timeout_s: Optional[float] = None, max_tokens: int = 600,
                       temperature: float = 0.3) -> str:
        """Return the assistant message content. Raises LLMError on any failure."""
        if not self.enabled:
            raise LLMError("LLM disabled or no API key configured")
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://resqme.app",
            "X-Title": "ResQMe",
        }
        try:
            async with httpx.AsyncClient(timeout=timeout_s or self.timeout_s) as client:
                resp = await client.post(config.OPENROUTER_URL, json=body, headers=headers)
        except httpx.HTTPError as exc:  # includes timeouts
            raise LLMError(f"request failed: {type(exc).__name__}") from exc
        if resp.status_code != 200:
            raise LLMError(f"OpenRouter HTTP {resp.status_code}")
        try:
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError("unexpected response shape") from exc
        if not isinstance(content, str) or not content.strip():
            raise LLMError("empty completion")
        return content


def get_llm() -> LLMClient:
    """FastAPI dependency; overridden in tests."""
    return LLMClient()
