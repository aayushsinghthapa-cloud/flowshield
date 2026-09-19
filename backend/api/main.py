"""FlowShield HTTP API. Routes are mounted under /api; the built frontend is served at /."""
from __future__ import annotations

import base64
import json
import os
import uuid
from collections import OrderedDict
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai.bulletin import write as write_bulletin
from ai.gemini import AIError, model_name
from ai.scenario_parser import parse as parse_scenario
from engine.classify import STATUS_NAMES, Thresholds, classify
from engine.ensemble import run_ensemble
from engine.rainfall import Rain
from engine.scenarios import PRESETS
from engine.simulate import RunParams, simulate
from engine.terrain import DATA, LAKE, LAND, DomainParams, build_domain, load_city
from live import weather

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

app = FastAPI(title="FlowShield API")
app.add_middleware(GZipMiddleware, minimum_size=1024)
api = APIRouter(prefix="/api")

FRAME_MIN = 15.0
RECORD_MIN = 5.0
CENTROID = (12.935, 77.675)  # catchment centre for point weather queries
RUNS: OrderedDict[str, dict] = OrderedDict()  # recent results for the bulletin endpoint
MAX_RUNS = 20


@lru_cache(maxsize=1)
def city():
    return load_city()


def b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode()


def lake_named(name: str) -> int | None:
    for lk in city().meta["lakes"]:
        if lk["name"].lower().startswith(name.lower()):
            return lk["id"]
    return None


# ---------------------------------------------------------------- schemas
class RainIn(BaseModel):
    profile: Literal["constant", "triangular", "cloudburst", "series"] = "triangular"
    peak_mm_hr: float = Field(50.0, ge=0, le=300)
    duration_hr: float = Field(3.0, gt=0, le=48)
    peak_at_hr: float = Field(1.5, ge=0, le=48)
    start_hr: float = Field(0.0, ge=0, le=48)
    series_mm_hr: list[float] = Field(default_factory=list, max_length=200)
    series_step_hr: float = Field(1.0, gt=0, le=6)
    scale: float = Field(1.0, ge=0, le=5)


class ThresholdsIn(BaseModel):
    warning_m: float = Field(0.15, gt=0, le=2)
    critical_m: float = Field(0.30, gt=0, le=3)
    ward_percentile: float = Field(95.0, ge=50, le=100)


class SimulateIn(BaseModel):
    rain: RainIn = RainIn()
    hours: float = Field(12.0, gt=0, le=48)
    drainage_failure: float = Field(0.0, ge=0, le=1)
    drain_capacity_mm_hr: float = Field(20.0, ge=0, le=200)
    lake_fill: float = Field(0.5, ge=0, le=1)
    antecedent_wetness: float = Field(0.0, ge=0, le=1)
    blocked_drains: list[int] = Field(default_factory=list, max_length=500)
    inflow_m3s: float = Field(0.0, ge=0, le=500)
    inflow_hours: float = Field(6.0, ge=0, le=48)
    thresholds: ThresholdsIn = ThresholdsIn()


# ---------------------------------------------------------------- routes
@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/city")
def get_city():
    c = city()
    dom = build_domain(c, DomainParams())
    geo = {f"{n}_geo": json.loads((DATA / f"{n}.geojson").read_text()) for n in ("wards", "lakes", "drains")}
    m = c.meta
    return {
        "shape": m["shape"], "cell_m": m["cell_m"], "corners": m["corners_lonlat"], "bbox": m["bbox"],
        "wards": m["wards"], "lakes": m["lakes"], "sources": m["sources"],
        "kind": b64(dom.kind.astype(np.uint8)), "ward_id": b64(c.ward_id.astype(np.int16)),
        "elevation": {"min": float(c.z.min()), "max": float(c.z.max()),
                      "grid": b64(np.round((c.z - c.z.min()) * 10).astype(np.uint16))},
        "population_total": float(c.pop.sum()),
        "presets": {k: vars(v) for k, v in PRESETS.items()},
        **geo,
    }


@api.post("/simulate")
def post_simulate(req: SimulateIn):
    out = run_scenario(req)
    run_id = uuid.uuid4().hex[:12]
    out["run_id"] = run_id
    summary = {k: v for k, v in out.items() if k != "frames"}
    RUNS[run_id] = summary
    while len(RUNS) > MAX_RUNS:
        RUNS.popitem(last=False)
    return out


# ---------------------------------------------------------------- live weather
@api.get("/live/forecast")
def live_forecast(hours: int = 48):
    try:
        return weather.forecast(*CENTROID, hours=min(max(hours, 6), 96))
    except weather.WeatherError as e:
        raise HTTPException(502, str(e))


class EnsembleIn(BaseModel):
    model: Literal["gfs025", "ecmwf_ifs025", "icon_seamless"] = "gfs025"
    hours: int = Field(24, ge=6, le=72)
    peak_factor: float = Field(1.0, ge=1, le=4)
    drainage_failure: float = Field(0.0, ge=0, le=1)
    lake_fill: float = Field(0.5, ge=0, le=1)
    antecedent_wetness: float = Field(0.0, ge=0, le=1)
    blocked_drains: list[int] = Field(default_factory=list, max_length=500)


@api.post("/ensemble")
def post_ensemble(req: EnsembleIn):
    try:
        e = weather.ensemble(*CENTROID, model=req.model, hours=req.hours)
    except weather.WeatherError as err:
        raise HTTPException(502, str(err))
    dp = DomainParams(drainage_failure=req.drainage_failure, lake_fill=req.lake_fill,
                      antecedent_wetness=req.antecedent_wetness, blocked_drains=frozenset(req.blocked_drains))
    out = run_ensemble(e["members"], scale=req.peak_factor, dp=dp)
    names = {w["id"]: w["name"] for w in city().meta["wards"]}
    for w in out["wards"]:
        w["name"] = names.get(w["id"], str(w["id"]))
    out.update(source=e["source"], times=e["times"], fetched_at=e["fetched_at"],
               peak_factor=req.peak_factor, grid_m=200,
               member_hourly_mean=[round(sum(m[i] for m in e["members"]) / len(e["members"]), 2)
                                   for i in range(len(e["times"]))])
    return out


# ---------------------------------------------------------------- AI (Gemini, live)
class ScenarioTextIn(BaseModel):
    text: str = Field(min_length=3, max_length=1000)


@api.post("/ai/scenario")
def ai_scenario(req: ScenarioTextIn):
    try:
        return parse_scenario(req.text)
    except AIError as e:
        raise HTTPException(502, str(e))


class BulletinIn(BaseModel):
    run_id: str
    ensemble: dict | None = None


@api.post("/ai/bulletin")
def ai_bulletin(req: BulletinIn):
    result = RUNS.get(req.run_id)
    if result is None:
        raise HTTPException(404, "Unknown or expired run_id: run the simulation again")
    try:
        return write_bulletin(result, req.ensemble)
    except AIError as e:
        raise HTTPException(502, str(e))


@api.get("/ai/status")
def ai_status():
    import os
    return {"configured": bool(os.environ.get("GEMINI_API_KEY")), "model": model_name()}


def run_scenario(req: SimulateIn) -> dict:
    c = city()
    n_drains = len(json.loads((DATA / "drains.geojson").read_text())["features"]) \
        if req.blocked_drains else 0
    if any(d < 0 or d >= n_drains for d in req.blocked_drains):
        raise HTTPException(422, "blocked_drains contains an unknown drain id")
    dp = DomainParams(drainage_failure=req.drainage_failure,
                      drain_capacity_mm_hr=req.drain_capacity_mm_hr, lake_fill=req.lake_fill,
                      antecedent_wetness=req.antecedent_wetness,
                      blocked_drains=frozenset(req.blocked_drains))
    dom = build_domain(c, dp)
    rain = Rain(**req.rain.model_dump())
    rp = RunParams(hours=req.hours, record_min=RECORD_MIN)
    if req.inflow_m3s > 0:
        mid = lake_named("Madiwala")
        if mid is not None:
            rr, cc = np.argwhere(c.lake_id == mid)[0]
            rp.inflow_cell = (int(rr), int(cc))
            rp.inflow_m3s = [req.inflow_m3s] * max(1, int(np.ceil(req.inflow_hours)))
            rp.inflow_m3s += [0.0] * int(np.ceil(req.hours))
    res = simulate(dom, rain, rp)
    th = Thresholds(**req.thresholds.model_dump())
    cl = classify(c, dom, res, th)

    step = int(round(FRAME_MIN / RECORD_MIN))
    frames = res.depth[::step]
    frames_mm = np.clip(np.round(frames * 1000), 0, 65535).astype(np.uint16)

    lake_mask = dom.kind == LAKE
    lakes = []
    for lk in c.meta["lakes"][:12]:
        m = (c.lake_id == lk["id"]) & lake_mask
        if m.any():
            full = dp.lake_depth_m
            lakes.append({"id": lk["id"], "name": lk["name"] or f"Lake {lk['id']}",
                          "fill": [round(float(v), 3) for v in res.depth[:, m].mean(axis=1) / full]})

    wards = []
    for w in cl.wards:
        wards.append({
            "id": w.id, "name": w.name,
            "metric": [round(float(v), 3) for v in w.metric],
            "status": w.status.tolist(),
            "peak_m": round(w.peak_m, 3), "peak_status": STATUS_NAMES[w.peak_status],
            "eta_min": None if w.eta_min is None else round(w.eta_min, 1),
            "warning_eta_min": None if w.warning_eta_min is None else round(w.warning_eta_min, 1),
            "rising": w.rising.tolist(),
            "pop_warning_peak": round(w.pop_warning_peak), "pop_critical_peak": round(w.pop_critical_peak),
        })
    critical = sorted((w for w in wards if w["eta_min"] is not None), key=lambda w: w["eta_min"])

    return {
        "params": req.model_dump(),
        "times_min": res.times_min.tolist(),
        "frame_times_min": res.times_min[::step].tolist(),
        "frames": [b64(f) for f in frames_mm],
        "rain_mm_hr": [round(float(v), 2) for v in res.rain_mm_hr],
        "total_rain_mm": round(rain.total_mm(), 1),
        "wards": wards,
        "critical_wards": [{"id": w["id"], "name": w["name"], "eta_min": w["eta_min"]} for w in critical],
        "pop_warning": [round(float(v)) for v in cl.pop_warning],
        "pop_critical": [round(float(v)) for v in cl.pop_critical],
        "area_warning_km2": [round(float(v), 2) for v in cl.area_warning_km2],
        "area_critical_km2": [round(float(v), 2) for v in cl.area_critical_km2],
        "lakes": lakes,
        "mass_balance": {
            "error": [float(v) for v in res.mass_error],
            "max_abs_error": float(np.abs(res.mass_error).max()),
            "v_in_m3": [round(float(v)) for v in res.v_in],
            "v_out_m3": [round(float(v)) for v in res.v_out],
            "v_inf_m3": [round(float(v)) for v in res.v_inf],
            "storage_m3": [round(float(v)) for v in res.volume],
        },
        "dt_s": [round(float(v), 2) for v in res.dt_series],
        "steps": res.steps, "runtime_s": round(res.runtime_s, 2),
        "max_depth_m": round(float(frames[:, dom.kind == LAND].max()), 2),
    }


app.include_router(api)

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def mount_frontend() -> None:
    """Serve the built React app at / (must be the last mount: it catches every path)."""
    if DIST.exists():
        app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")


if not os.environ.get("FLOWSHIELD_DEFER_FRONTEND"):
    mount_frontend()
