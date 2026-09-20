"""Anthropic Claude client. Live calls only: on failure we raise and the UI shows it.

Structured output is done with a single forced tool whose input schema is the Pydantic
model, which is Anthropic's equivalent of Gemini's response_schema.
"""
from __future__ import annotations

import os
import time

from pydantic import BaseModel

from .gemini import AIError

DEFAULT_MODEL = "claude-sonnet-5"
# Retried on the same model: a brief capacity blip or a rate-limit bucket refill.
RETRYABLE = ("overloaded", "rate_limit", "429", "529", "500", "api_error")
TOOL = "record_answer"


def model_name() -> str:
    return os.environ.get("ANTHROPIC_MODEL") or DEFAULT_MODEL


def configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def generate_json(system: str, prompt: str, schema: type[BaseModel],
                  temperature: float = 0.2) -> tuple[BaseModel, dict]:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise AIError("ANTHROPIC_API_KEY is not set on the server")
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise AIError("the anthropic package is not installed") from e

    client = anthropic.Anthropic(api_key=key, timeout=90.0, max_retries=0)
    model = model_name()
    tool = {
        "name": TOOL,
        "description": "Record the answer in the required structure.",
        "input_schema": schema.model_json_schema(),
    }
    t0 = time.perf_counter()
    attempts: list[str] = []
    msg = None
    for wait in (0.0, 1.5, 4.0):
        if wait:
            time.sleep(wait)
        try:
            msg = client.messages.create(
                model=model,
                max_tokens=2048,
                temperature=temperature,
                system=system,
                tools=[tool],
                tool_choice={"type": "tool", "name": TOOL},
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

    block = next((b for b in msg.content if getattr(b, "type", None) == "tool_use"), None)
    if block is None:
        raise AIError("Claude did not return the structured answer")
    try:
        parsed = schema.model_validate(block.input)
    except Exception as e:
        raise AIError(f"Claude returned output that does not match the schema: {e}") from e

    meta = {
        "provider": "Anthropic",
        "model": model,
        "retries": len(attempts),
        "latency_s": round(time.perf_counter() - t0, 2),
        "input_tokens": msg.usage.input_tokens,
        "output_tokens": msg.usage.output_tokens,
    }
    return parsed, meta
