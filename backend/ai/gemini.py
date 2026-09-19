"""Thin Gemini client. Live calls only: on any failure we raise, and the UI shows the error."""
from __future__ import annotations

import os
import time

from pydantic import BaseModel

DEFAULT_MODEL = "gemini-3.6-flash"
# Tried in order after the configured model when Gemini is overloaded (503/429).
FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-flash-latest"]
RETRYABLE = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "overloaded")


class AIError(RuntimeError):
    pass


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL


def generate_json(system: str, prompt: str, schema: type[BaseModel], temperature: float = 0.2) -> tuple[BaseModel, dict]:
    """Call Gemini with a response schema; return (parsed model, call metadata)."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise AIError("GEMINI_API_KEY is not set on the server")
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:  # pragma: no cover
        raise AIError("google-genai is not installed") from e

    client = genai.Client(api_key=key)
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
        temperature=temperature,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    t0 = time.perf_counter()
    models = [model_name()] + [m for m in FALLBACK_MODELS if m != model_name()]
    attempts: list[str] = []
    resp = None
    used = models[0]
    for used in models:
        for backoff in (0.0, 1.5):
            time.sleep(backoff)
            try:
                resp = client.models.generate_content(model=used, contents=prompt, config=config)
                break
            except Exception as e:  # network, quota, overload, bad request
                msg = str(e)
                attempts.append(f"{used}: {msg[:120]}")
                if not any(tok in msg for tok in RETRYABLE):
                    raise AIError(f"Gemini call failed: {msg[:300]}") from e
        if resp is not None:
            break
    if resp is None:
        raise AIError("Gemini is unavailable right now (all retries failed): " + " | ".join(attempts[-2:]))
    parsed = resp.parsed
    if parsed is None:
        try:
            parsed = schema.model_validate_json(resp.text or "")
        except Exception as e:
            raise AIError(f"Gemini returned output that does not match the schema: {e}") from e
    usage = getattr(resp, "usage_metadata", None)
    meta = {
        "model": used,
        "retries": len(attempts),
        "latency_s": round(time.perf_counter() - t0, 2),
        "input_tokens": getattr(usage, "prompt_token_count", None),
        "output_tokens": getattr(usage, "candidates_token_count", None),
    }
    return parsed, meta
