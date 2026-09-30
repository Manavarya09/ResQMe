import os

# Must run before the app is imported: disable the real LLM entirely for tests.
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["RESQME_DISABLE_LLM"] = "1"

import httpx  # noqa: E402
import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    """Fail loudly if anything tries to make a real HTTP request."""
    async def _blocked_async(*args, **kwargs):
        raise RuntimeError("network access is blocked in tests")

    def _blocked_sync(*args, **kwargs):
        raise RuntimeError("network access is blocked in tests")

    monkeypatch.setattr(httpx.AsyncClient, "send", _blocked_async)
    # TestClient uses its own transport, so only block the real sync transport.
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", _blocked_sync)


class FakeLLM:
    """Stand-in for LLMClient. `response` is a string to return or an exception to raise."""

    def __init__(self, response):
        self.response = response
        self.calls = []
        self.enabled = True

    async def complete(self, messages, **kwargs):
        self.calls.append({"messages": messages, **kwargs})
        if isinstance(self.response, BaseException):
            raise self.response
        return self.response


@pytest.fixture
def fake_llm_factory():
    return FakeLLM
