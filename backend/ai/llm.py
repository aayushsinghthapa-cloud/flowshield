"""Which model actually answers.

Two independent providers, tried in order, so one outage or one exhausted quota does
not take the AI features down:

  1. Anthropic Claude  - paid, reliable, best at writing natural Kannada.
  2. Google Gemini     - free tier, 20 requests per day per model across a chain of
                         Flash models, used when Claude is unavailable or unconfigured.

Every answer carries the provider and model that produced it, and the UI shows them,
so what you see on screen is always attributable to a real, live call.
"""
from __future__ import annotations

from pydantic import BaseModel

from . import claude, gemini
from .gemini import AIError


def providers() -> list[str]:
    """The providers this server could actually call, in the order they are tried."""
    order = []
    if claude.configured():
        order.append("Anthropic")
    if gemini.configured():
        order.append("Google")
    return order


def generate_json(system: str, prompt: str, schema: type[BaseModel],
                  temperature: float = 0.2) -> tuple[BaseModel, dict]:
    errors: list[str] = []
    for name, mod in (("Anthropic", claude), ("Google", gemini)):
        if not mod.configured():
            continue
        try:
            parsed, meta = mod.generate_json(system, prompt, schema, temperature)
            meta.setdefault("provider", name)
            if errors:  # say so when the first provider had to be skipped
                meta["fell_back_from"] = errors[0].split(":")[0]
            return parsed, meta
        except AIError as e:
            errors.append(f"{name}: {e}")
    if not errors:
        raise AIError("No AI provider is configured on the server "
                      "(set ANTHROPIC_API_KEY or GEMINI_API_KEY).")
    raise AIError(" — then — ".join(errors))
