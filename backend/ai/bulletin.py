"""A2: AI early-warning bulletin (authority advisory + public alert in English and Kannada).

The model only sees the structured facts built here from a simulation result, and
is told to copy numbers verbatim. A grounding check then verifies every number.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .llm import generate_json
from .grounding import check


class Bulletin(BaseModel):
    severity: str = Field(description="One of: ALL CLEAR, WATCH, WARNING, SEVERE WARNING")
    headline: str = Field(description="One line, max 14 words.")
    authority_advisory: list[str] = Field(description="3-6 short operational actions for BBMP/police/fire/SDRF, most urgent first, naming wards and times.")
    public_alert_en: str = Field(description="SMS-style public alert in English, max 60 words.")
    public_alert_kn: str = Field(description="The same public alert in natural Kannada script, max 60 words. Keep ward names readable.")


SYSTEM = """You write flood early-warning bulletins for Bengaluru from simulation output.
Hard rules:
- Use ONLY the facts in the JSON. Copy numbers exactly as written there (same units and rounding).
  Do not compute new numbers, add rainfall figures, or invent places, shelters or phone numbers.
- The only phone numbers you may mention are those in "helplines".
- Times are RELATIVE, counted from the start of the rain. Quote them exactly as written
  ("1 h 55 min"). Never turn one into a clock time or a date: the run is a scenario, not
  a forecast pinned to a wall clock, so "by 09:16 IST" would be a number you invented.
- If no ward reaches critical, say so plainly and keep severity at ALL CLEAR or WATCH.
- Order advice by ETA (earliest first). Mention that this is a model-based estimate.
- Public alerts: calm, clear, actionable (avoid underpasses, move vehicles, keep away from drains)."""


def _eta(m: float | None) -> str | None:
    if m is None:
        return None
    h, mm = divmod(int(round(m)), 60)
    return f"{h} h {mm} min" if h else f"{mm} min"


def facts_from_result(r: dict, ensemble: dict | None = None) -> dict:
    """Compact, human-formatted facts the LLM is allowed to use."""
    p = r["params"]
    rain = p["rain"]
    crit = r["critical_wards"][:8]
    by_id = {w["id"]: w for w in r["wards"]}
    warn = [w for w in r["wards"] if w["peak_status"] == "warning"][:8]
    lakes_high = [{"lake": l["name"], "peak_level_percent": round(max(l["fill"]) * 100)}
                  for l in r["lakes"] if max(l["fill"]) >= 0.9]
    facts = {
        "issued_at": datetime.now().strftime("%d %b %Y, %H:%M IST"),
        "area": "South-east Bengaluru (Koramangala–Challaghatta valley: Madiwala, Agara, Bellandur, Varthur lakes)",
        "scenario": {
            "rain_profile": rain["profile"],
            "total_rain_mm": r["total_rain_mm"],
            "peak_rain_mm_per_hr": round(max(r["rain_mm_hr"]), 1),
            "drainage_failure_percent": round(p["drainage_failure"] * 100),
            "blocked_drain_segments": len(p["blocked_drains"]),
            "initial_lake_level_percent": round(p["lake_fill"] * 100),
        },
        "critical_wards": [{"ward": w["name"], "time_to_critical": _eta(w["eta_min"]),
                            "people_in_critical_cells": by_id[w["id"]]["pop_critical_peak"]} for w in crit],
        "warning_wards": [{"ward": w["name"], "time_to_warning": _eta(w["warning_eta_min"])} for w in warn],
        "peak_people_in_critical_areas": max(r["pop_critical"]),
        "peak_people_in_warning_areas": max(r["pop_warning"]),
        "lakes_near_full": lakes_high,
        "thresholds": {"warning_depth_cm": round(p["thresholds"]["warning_m"] * 100),
                       "critical_depth_cm": round(p["thresholds"]["critical_m"] * 100)},
        "helplines": {"emergency": "112", "BBMP control room": "1533"},
    }
    if ensemble:
        facts["ensemble_forecast"] = {
            "members": ensemble["n_members"],
            "wards_with_chance_of_critical": [
                {"ward": w["name"], "chance_percent": round(w["p_critical"] * 100)}
                for w in sorted(ensemble["wards"], key=lambda w: -w["p_critical"]) if w["p_critical"] > 0][:6],
        }
    return facts


def write(result: dict, ensemble: dict | None = None) -> dict:
    facts = facts_from_result(result, ensemble)
    import json
    prompt = "Simulation facts (JSON):\n" + json.dumps(facts, ensure_ascii=False, indent=1)
    parsed, meta = generate_json(SYSTEM, prompt, Bulletin, temperature=0.3)
    b: Bulletin = parsed  # type: ignore[assignment]
    grounding = check([b.headline, *b.authority_advisory, b.public_alert_en, b.public_alert_kn], facts)
    return {"bulletin": b.model_dump(), "grounding": grounding, "facts": facts, "ai": meta}
