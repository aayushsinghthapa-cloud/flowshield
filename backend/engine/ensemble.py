"""Probabilistic early warning: run the engine once per ensemble rainfall member.

P(ward critical) = (members in which the ward reaches Critical) / N.
Runs on a 200 m coarsened grid in parallel processes so ~31 members take seconds.
"""
from __future__ import annotations

import os
from concurrent.futures import ProcessPoolExecutor
from functools import lru_cache

import numpy as np

from .classify import Thresholds, classify
from .rainfall import Rain
from .simulate import RunParams, simulate
from .terrain import DomainParams, build_domain, coarsen, load_city


@lru_cache(maxsize=1)
def _coarse_city():
    return coarsen(load_city(), 2)


def _run_member(args) -> dict[int, float | None]:
    series, scale, dp, th = args
    city = _coarse_city()
    dom = build_domain(city, dp)
    rain = Rain(profile="series", series_mm_hr=series, series_step_hr=1.0, scale=scale)
    res = simulate(dom, rain, RunParams(hours=len(series), record_min=10.0))
    cl = classify(city, dom, res, th)
    return {w.id: w.eta_min for w in cl.wards}


def run_members(members: list[list[float]], scale: float = 1.0, dp: DomainParams | None = None,
                th: Thresholds | None = None, workers: int | None = None) -> list[dict[int, float | None]]:
    """ETA to critical per ward (None = never) for each member."""
    dp = dp or DomainParams()
    th = th or Thresholds()
    workers = workers or max(1, min(len(members), os.cpu_count() or 2, int(os.environ.get("ENSEMBLE_WORKERS", 4))))
    jobs = [(m, scale, dp, th) for m in members]
    if workers > 1:
        try:
            with ProcessPoolExecutor(max_workers=workers) as ex:
                return list(ex.map(_run_member, jobs))
        except (OSError, NotImplementedError, RuntimeError):
            pass  # serverless sandboxes may lack /dev/shm for process pools
    return [_run_member(j) for j in jobs]


def aggregate(results: list[dict[int, float | None]]) -> list[dict]:
    """P(ward critical) = members reaching critical / N, with median and p10 ETA."""
    n = len(results)
    out = []
    for wid in sorted({w for r in results for w in r}):
        etas = [r[wid] for r in results if r.get(wid) is not None]
        out.append({"id": wid, "p_critical": len(etas) / n,
                    "eta_median_min": float(np.median(etas)) if etas else None,
                    "eta_p10_min": float(np.percentile(etas, 10)) if etas else None})
    return out
