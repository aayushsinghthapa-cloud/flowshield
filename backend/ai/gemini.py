"""Thin Gemini client. Live calls only: on any failure we raise, and the UI shows the error."""
from __future__ import annotations

import os
import time

from pydantic import BaseModel

DEFAULT_MODEL = "gemini-3.5-flash"
# Tried in order after the configured model when Gemini is overloaded or out of quota.
# The free tier allows 20 requests per day *per model*, so a wider chain is a wider
# budget: these are all current Flash models on the same free key. Lite variants last,
# because the bulletin has to write natural Kannada.
FALLBACK_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
]
# Worth waiting and trying the same model again: the capacity spike is usually brief.
# Everything else (a spent free-tier quota, a retired model) will not fix itself in a
# second, so we move straight on to the next model instead of burning the demo's time.
RETRYABLE = ("503", "UNAVAILABLE", "overloaded")


class AIError(RuntimeError):
    pass


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL


def configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


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

    t0 = time.perf_counter()
    models = [model_name()] + [m for m in FALLBACK_MODELS if m != model_name()]
    attempts: list[str] = []
    resp = None
    used = models[0]
    for used in models:
        # Each model gets: the fast attempt, one retry if it is merely overloaded, and
        # one retry with thinking left on (the Lite models reject thinking_budget=0 with
        # a bare 400). A model that fails all three is skipped, never fatal, so one odd
        # model in the chain cannot take the whole call down with it.
        thinking = False
        wait = 0.0
        for _ in range(3):
            if wait:
                time.sleep(wait)
            try:
                resp = client.models.generate_content(
                    model=used, contents=prompt, config=make_config(thinking))
                break
            except Exception as e:  # network, quota, overload, bad request
                msg = str(e)
                attempts.append(f"{used}: {msg[:120]}")
                if not thinking and any(t in msg for t in ("thinking", "INVALID_ARGUMENT", "400")):
                    thinking, wait = True, 0.0  # this model insists on thinking: ask its way
                elif any(tok in msg for tok in RETRYABLE):
                    wait = 1.5
                else:
                    break  # out of quota, gone, or refusing: move to the next model
        if resp is not None:
            break
    if resp is None:
        joined = " | ".join(attempts)
        if any(tok in joined for tok in ("429", "RESOURCE_EXHAUSTED")):
            raise AIError(
                f"Gemini's free-tier quota is used up on all {len(models)} models this key can "
                "reach (20 requests per day each; it resets at 00:00 Pacific). Nothing here is "
                "pre-written, so there is no cached answer to fall back on.")
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
