"""Thin Gemini client. Live calls only: on any failure we raise, and the UI shows the error."""
from __future__ import annotations

import os
import time

from pydantic import BaseModel

DEFAULT_MODEL = "gemini-3.5-flash"
# Tried in order after the configured model when Gemini is overloaded or out of quota.
FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-flash-latest"]
# Worth waiting and trying the same model again: the capacity spike is usually brief.
RETRYABLE = ("503", "UNAVAILABLE", "overloaded")
# Not worth waiting for: a free-tier quota does not refill in a second, so move on
# to the next model immediately instead of burning the demo's time on backoff.
MOVE_ON = ("429", "RESOURCE_EXHAUSTED", "404", "NOT_FOUND")


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

    def make_config(thinking: bool):
        kw = dict(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        # Both of our prompts reformat facts we already computed; there is nothing to
        # reason about, and turning thinking off takes the bulletin from ~12 s to ~4 s.
        if not thinking:
            kw["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
        return types.GenerateContentConfig(**kw)

    thinking_off = True
    config = make_config(thinking=False)
    t0 = time.perf_counter()
    models = [model_name()] + [m for m in FALLBACK_MODELS if m != model_name()]
    attempts: list[str] = []
    resp = None
    used = models[0]
    for used in models:
        for backoff in (0.0, 1.5):
            if backoff:
                time.sleep(backoff)
            try:
                resp = client.models.generate_content(model=used, contents=prompt, config=config)
                break
            except Exception as e:  # network, quota, overload, bad request
                msg = str(e)
                attempts.append(f"{used}: {msg[:120]}")
                if "thinking" in msg.lower() and thinking_off:
                    thinking_off = False  # this model insists on thinking: ask again its way
                    config = make_config(thinking=True)
                    continue
                if any(tok in msg for tok in MOVE_ON):
                    break  # this model is out; try the next one straight away
                if not any(tok in msg for tok in RETRYABLE):
                    raise AIError(f"Gemini call failed: {msg[:300]}") from e
        if resp is not None:
            break
    if resp is None:
        joined = " | ".join(attempts)
        if any(tok in joined for tok in ("429", "RESOURCE_EXHAUSTED")):
            raise AIError(
                "Gemini's free-tier quota is exhausted for every model we can reach "
                f"({', '.join(models)}). Wait a minute and press the button again — "
                "nothing here is pre-written, so there is no cached answer to fall back on.")
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
