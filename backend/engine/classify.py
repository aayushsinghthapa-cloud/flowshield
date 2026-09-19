"""Risk classification: cell status, ward p90 metric, ETA to critical, affected population."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .simulate import RunResult
from .terrain import LAND, City, Domain

SAFE, WARNING, CRITICAL = 0, 1, 2
STATUS_NAMES = ("safe", "warning", "critical")


@dataclass
class Thresholds:
    # US NWS "Turn Around Don't Drown": ~15 cm of moving water can knock an adult
    # down, ~30 cm can float a car. Editable in the UI.
    warning_m: float = 0.15
    critical_m: float = 0.30
    ward_percentile: float = 95.0   # ward critical when >= 5% of its land area is critical
    rising_m_per_hr: float = 0.10


@dataclass
class WardSummary:
    id: int
    name: str
    metric: np.ndarray        # p90 land depth per record (m)
    status: np.ndarray        # status per record
    peak_m: float
    peak_status: int
    eta_min: float | None     # first time metric >= critical (interpolated)
    warning_eta_min: float | None
    rising: np.ndarray        # bool per record
    pop_warning_peak: float
    pop_critical_peak: float


@dataclass
class Classification:
    wards: list[WardSummary]
    pop_warning: np.ndarray   # people in warning cells per record
    pop_critical: np.ndarray
    area_warning_km2: np.ndarray
    area_critical_km2: np.ndarray


def cell_status(depth: np.ndarray, th: Thresholds) -> np.ndarray:
    s = np.zeros(depth.shape, dtype=np.int8)
    s[depth >= th.warning_m] = WARNING
    s[depth >= th.critical_m] = CRITICAL
    return s


def _crossing(times: np.ndarray, series: np.ndarray, level: float) -> float | None:
    """First time the series reaches `level`, linearly interpolated between records."""
    idx = np.flatnonzero(series >= level)
    if idx.size == 0:
        return None
    i = idx[0]
    if i == 0:
        return 0.0
    a, b = series[i - 1], series[i]
    return float(times[i - 1] + (level - a) / (b - a) * (times[i] - times[i - 1]))


def classify(city: City, dom: Domain, res: RunResult, th: Thresholds | None = None) -> Classification:
    th = th or Thresholds()
    T = res.depth.shape[0]
    land = dom.kind == LAND
    cell_km2 = (dom.cell / 1000.0) ** 2
    flat_depth = res.depth.reshape(T, -1)
    pop = city.pop.ravel()
    land_flat = land.ravel()

    warn_mask = (flat_depth >= th.warning_m) & land_flat
    crit_mask = (flat_depth >= th.critical_m) & land_flat
    pop_w = (warn_mask & ~crit_mask) @ pop
    pop_c = crit_mask @ pop

    hours = (res.times_min[1] - res.times_min[0]) / 60.0 if T > 1 else 1.0
    wards = []
    for w in city.meta["wards"]:
        idx = np.flatnonzero((city.ward_id.ravel() == w["id"]) & land_flat)
        if idx.size == 0:
            continue
        d = flat_depth[:, idx]
        metric = np.percentile(d, th.ward_percentile, axis=1)
        status = cell_status(metric, th)
        rate = np.gradient(metric) / hours if T > 1 else np.zeros(T)
        wp = pop[idx]
        wards.append(WardSummary(
            id=w["id"], name=w["name"], metric=metric, status=status,
            peak_m=float(metric.max()), peak_status=int(status.max()),
            eta_min=_crossing(res.times_min, metric, th.critical_m),
            warning_eta_min=_crossing(res.times_min, metric, th.warning_m),
            rising=rate >= th.rising_m_per_hr,
            pop_warning_peak=float(((d >= th.warning_m) @ wp).max()),
            pop_critical_peak=float(((d >= th.critical_m) @ wp).max()),
        ))
    return Classification(
        wards=wards, pop_warning=pop_w, pop_critical=pop_c,
        area_warning_km2=(warn_mask & ~crit_mask).sum(axis=1) * cell_km2,
        area_critical_km2=crit_mask.sum(axis=1) * cell_km2,
    )
