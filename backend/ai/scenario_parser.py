"""A1: natural-language scenario builder.

Gemini maps free text to a fixed schema. We then validate, clamp every value to
the simulator's ranges and resolve place names to real OSM drain ids. The user
confirms the parsed parameters before anything runs.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, Field

from engine.terrain import DATA

from .gemini import generate_json

BLOCK_RADIUS_M = 700.0


class ParsedScenario(BaseModel):
    profile: Literal["constant", "triangular", "cloudburst", "live_forecast"] = Field(
        description="Storm shape. Use live_forecast when the user asks for today's/the real/current forecast.")
    peak_mm_hr: float = Field(description="Peak rainfall intensity in mm/hr. Normal ~10, heavy ~50, cloudburst ~100.")
    duration_hr: float = Field(description="Storm duration in hours.")
    peak_at_hr: float = Field(description="Hours after the start when the storm peaks (triangular).")
    drainage_failure: float = Field(description="Fraction 0..1 of drain capacity lost city-wide.")
    lake_fill: float = Field(description="Initial lake level as a fraction 0..1 of storage (1 = tanks already full).")
    antecedent_wetness: float = Field(description="0..1 how wet the ground already is from earlier rain.")
    hours: float = Field(description="Hours to simulate (at least the storm duration plus a few hours).")
    blocked_places: list[str] = Field(description="Exact names from the known-places list where drains are blocked.")
    forecast_peak_factor: float = Field(description="For live_forecast only: multiplier on forecast rain (1 = as forecast).")
    summary: str = Field(description="One sentence restating the scenario in plain English.")


SYSTEM = """You convert a flood-scenario description for south-east Bengaluru into simulator parameters.
Rules:
- Fill every field. When the user does not mention something, use these defaults: profile triangular,
  peak 50 mm/hr, duration 3 h, peak at 40% of duration, drainage_failure 0, lake_fill 0.5,
  antecedent_wetness 0, hours = duration + 6, forecast_peak_factor 1, blocked_places [].
- Words like "light/normal" ~10 mm/hr, "heavy" ~50, "very heavy/cloudburst/extreme" ~100.
- If a rainfall TOTAL is given (e.g. "130 mm in 3 hours"), convert it to a peak intensity for the chosen
  profile: constant peak = total/duration; triangular peak = 2*total/duration.
- "Lakes/tanks already full" means lake_fill near 1. "After days of rain" means antecedent_wetness ~0.7.
- blocked_places may only contain names copied exactly from the known-places list. Match loosely
  ("Silk Board" -> the nearest listed ward, e.g. "Bommanahalli" or "BTM Layout" only if listed).
- Never invent numbers the user did not imply; use the defaults instead."""

LIMITS = {
    "peak_mm_hr": (0, 200), "duration_hr": (0.5, 24), "peak_at_hr": (0, 24), "drainage_failure": (0, 1),
    "lake_fill": (0, 1), "antecedent_wetness": (0, 1), "hours": (3, 48), "forecast_peak_factor": (1, 4),
}


@lru_cache(maxsize=1)
def places() -> dict[str, tuple[float, float]]:
    """Known place names -> (lon, lat): wards and named lakes."""
    meta = json.loads((DATA / "meta.json").read_text())
    out = {w["name"]: tuple(w["centroid"]) for w in meta["wards"]}
    lakes = json.loads((DATA / "lakes.geojson").read_text())["features"]
    for f in lakes:
        name = f["properties"]["name"]
        if not name:
            continue
        ring = f["geometry"]["coordinates"][0] if f["geometry"]["type"] == "Polygon" \
            else f["geometry"]["coordinates"][0][0]
        out[name] = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    return out


@lru_cache(maxsize=1)
def drain_points() -> list[tuple[int, float, float, str]]:
    feats = json.loads((DATA / "drains.geojson").read_text())["features"]
    out = []
    for f in feats:
        c = f["geometry"]["coordinates"]
        out.append((f["properties"]["id"], sum(p[0] for p in c) / len(c), sum(p[1] for p in c) / len(c),
                    f["properties"]["kind"]))
    return out


def drains_near(lon: float, lat: float, radius_m: float = BLOCK_RADIUS_M) -> list[int]:
    kx = 111_320 * math.cos(math.radians(lat))
    ky = 110_540
    return [i for i, x, y, kind in drain_points()
            if kind in ("drain", "canal", "stream", "river")
            and math.hypot((x - lon) * kx, (y - lat) * ky) <= radius_m]


def parse(text: str) -> dict:
    known = sorted(places())
    prompt = f"Known places: {json.dumps(known, ensure_ascii=False)}\n\nScenario: {text}"
    parsed, meta = generate_json(SYSTEM, prompt, ParsedScenario)
    p: ParsedScenario = parsed  # type: ignore[assignment]

    clamped = []
    vals = p.model_dump()
    for k, (lo, hi) in LIMITS.items():
        v = vals[k]
        if not isinstance(v, (int, float)) or math.isnan(v):
            v = lo
        if v < lo or v > hi:
            clamped.append(f"{k} {v} -> {min(max(v, lo), hi)}")
        vals[k] = min(max(v, lo), hi)
    vals["peak_at_hr"] = min(vals["peak_at_hr"], vals["duration_hr"])
    if p.profile != "live_forecast":
        vals["hours"] = max(vals["hours"], vals["duration_hr"] + 1)

    resolved, unknown, blocked = [], [], set()
    for name in p.blocked_places:
        if name in places():
            ids = drains_near(*places()[name])
            blocked.update(ids)
            resolved.append({"place": name, "drains": len(ids)})
        else:
            unknown.append(name)

    return {"parsed": vals, "blocked_drains": sorted(blocked), "blocked_places": resolved,
            "unknown_places": unknown, "clamped": clamped, "ai": meta, "input": text}
