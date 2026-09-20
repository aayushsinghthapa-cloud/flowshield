"""Which model actually answers.

Two independent providers, tried in order, so one outage or one exhausted quota does
not take the AI features down:

  1. Google Gemini     - free, and answers in about 5 s, so it drives the demo. Its
                         free tier allows only 20 requests per day per model, which
                         is why it is chained across several Flash models.
  2. Anthropic Claude  - paid and slower (~20 s, because a Kannada alert is a lot of
                         tokens), but it has no daily cap and writes the best Kannada.
                         It is the backstop for when Gemini's quota runs out mid-demo.

Set AI_PROVIDER_ORDER="anthropic,google" to lead with Claude instead.

Every answer carries the provider and model that produced it, and the UI shows them,
so what you see on screen is always attributable to a real, live call.
"""
from __future__ import annotations

import os

from pydantic import BaseModel

from . import claude, gemini
from .gemini import AIError

MODULES = {"google": (gemini, "Google"), "anthropic": (claude, "Anthropic")}
DEFAULT_ORDER = "google,anthropic"


def _chain() -> list[tuple[str, object]]:
    """(display name, module) for each configured provider, in the order to try."""
    names = [n.strip().lower() for n in
             (os.environ.get("AI_PROVIDER_ORDER") or DEFAULT_ORDER).split(",")]
    seen, chain = set(), []
    for n in names:
        if n in MODULES and n not in seen:
            seen.add(n)
            mod, label = MODULES[n]
            if mod.configured():
                chain.append((label, mod))
    return chain


def providers() -> list[str]:
    """The providers this server could actually call, in the order they are tried."""
    return [label for label, _ in _chain()]


def generate_json(system: str, prompt: str, schema: type[BaseModel],
                  temperature: float = 0.2) -> tuple[BaseModel, dict]:
    errors: list[str] = []
    for name, mod in _chain():
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
