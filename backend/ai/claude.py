"""Anthropic Claude client. Live calls only: on failure we raise and the UI shows it.

Structured output uses the API's native JSON-schema mode through `messages.parse`,
which takes the Pydantic model directly and returns a validated instance, so a
malformed bulletin cannot reach the UI.
"""
from __future__ import annotations

import os
import time

from pydantic import BaseModel

from .gemini import AIError

DEFAULT_MODEL = "claude-sonnet-5"
# Retried on the same model: a brief capacity blip or a rate-limit bucket refill.
RETRYABLE = ("overloaded", "rate_limit", "429", "529", "500", "api_error")


def model_name() -> str:
    return os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def generate_json(system: str, prompt: str, schema: type[BaseModel],
                  temperature: float = 0.2) -> tuple[BaseModel, dict]:
    # temperature is accepted for a common signature with the Gemini client; this
    # SDK version does not expose it on messages.parse.
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise AIError("ANTHROPIC_API_KEY is not set on the server")
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AIError("the anthropic package is not installed") from e

    client = anthropic.Anthropic(api_key=key, timeout=90.0, max_retries=0)
    model = model_name()
    t0 = time.perf_counter()
    attempts: list[str] = []
    msg = None
    for wait in (0.0, 1.5, 4.0):
        if wait:
            time.sleep(wait)
        try:
            msg = client.messages.parse(
                model=model,
                max_tokens=2048,
                system=system,
                output_format=schema,
                messages=[{"role": "user", "content": prompt}],
            )
            break
        except Exception as e:
            text = str(e)
            attempts.append(text[:160])
            if not any(tok in text.lower() for tok in RETRYABLE):
                raise AIError(f"Claude call failed: {text[:300]}") from e
    if msg is None:
        raise AIError("Claude is unavailable right now: " + " | ".join(attempts[-2:]))

    parsed = msg.parsed_output
    if parsed is None:
        raise AIError("Claude did not return the structured answer")

    meta = {
        "provider": "Anthropic",
        "model": model,
        "retries": len(attempts),
        "latency_s": round(time.perf_counter() - t0, 2),
        "input_tokens": msg.usage.input_tokens,
        "output_tokens": msg.usage.output_tokens,
    }
    return parsed, meta
