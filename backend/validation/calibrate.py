"""Calibrate the one genuinely free parameter against observed flood footprints.

Drain intake capacity is the model's largest unconstrained input: BBMP publishes no
storm-drain capacities, so the default of 20 mm/hr was an assumption. Everything else
(terrain, land cover, lakes, drain network, population) is measured data, and the depth
thresholds come from the US NWS.

So we fit exactly one number, against real events, with a train/test split:

  train: 4-5 Sep 2022  (severe, city-wide, 11 reported localities)
  test:  20 Oct 2022   (moderate, localised, 5 reported localities)

Fitting one parameter on one event and checking it on a different event of a different
magnitude is about as much as this evidence supports. We deliberately do not tune
infiltration, roughness or the thresholds as well: with ~16 observations that would be
fitting noise.

Run:  ../.venv/bin/python -m validation.calibrate            (from backend/)
      ../.venv/bin/python -m validation.calibrate --grid 5 10 20 30 45 60
"""
from __future__ import annotations

import argparse
import sys

from engine.classify import CRITICAL, classify
from engine.rainfall import Rain
from engine.simulate import RunParams, simulate
from engine.terrain import DomainParams, build_domain, load_city

from .events import EVENTS, OCT_2022, SEP_2022
from .sept2022 import observed_wards_for

DEFAULT_GRID = [10.0, 15.0, 20.0, 30.0, 40.0, 55.0, 70.0]


def score(city, event, drain_mm_hr: float, observed: set[int]) -> dict:
    dom = build_domain(city, DomainParams(
        lake_fill=event.lake_fill,
        antecedent_wetness=event.antecedent_wetness,
        drain_capacity_mm_hr=drain_mm_hr))
    rain = Rain(profile="triangular", peak_mm_hr=event.peak_mm_hr,
                duration_hr=event.duration_hr, peak_at_hr=event.duration_hr * 0.4)
    out = classify(city, dom, simulate(dom, rain, RunParams(hours=event.hours)))
    pred = {w.id for w in out.wards if w.peak_status == CRITICAL}
    hits, misses, fa = observed & pred, observed - pred, pred - observed
    n_wards = len(out.wards)
    return {
        "drain": drain_mm_hr,
        "critical": len(pred),
        "of_wards": n_wards,
        "hits": len(hits),
        "pod": len(hits) / len(observed) if observed else float("nan"),
        "far": len(fa) / len(pred) if pred else 0.0,
        "csi": len(hits) / max(1, len(hits) + len(misses) + len(fa)),
        "km2": float(out.area_critical_km2.max()),
        "people": float(out.pop_critical.max()),
    }


def table(title: str, rows: list[dict], observed_n: int) -> None:
    print(f"\n=== {title} ({observed_n} reported localities mapped to wards) ===")
    print(f"{'drain mm/hr':>11} {'critical':>9} {'hits':>5} {'POD':>5} {'FAR':>5} "
          f"{'CSI':>5} {'km2':>6} {'people':>9}")
    for r in rows:
        print(f"{r['drain']:>11.0f} {r['critical']:>4}/{r['of_wards']:<4} {r['hits']:>5} "
              f"{r['pod']:>5.2f} {r['far']:>5.2f} {r['csi']:>5.2f} {r['km2']:>6.1f} "
              f"{r['people']:>9,.0f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", nargs="*", type=float, default=DEFAULT_GRID,
                    help="drain intake capacities to try, mm/hr")
    args = ap.parse_args()

    city = load_city()
    obs_train, _ = observed_wards_for(SEP_2022.localities)
    obs_test, _ = observed_wards_for(OCT_2022.localities)
    print(f"train: {SEP_2022.label} -> {len(obs_train)} wards", file=sys.stderr)
    print(f"test:  {OCT_2022.label} -> {len(obs_test)} wards", file=sys.stderr)

    train = [score(city, SEP_2022, d, set(obs_train)) for d in args.grid]
    table(f"TRAIN · {SEP_2022.label}", train, len(obs_train))

    best = max(train, key=lambda r: (r["csi"], r["pod"]))
    print(f"\n  best on training by CSI: drain = {best['drain']:.0f} mm/hr "
          f"(CSI {best['csi']:.2f}, POD {best['pod']:.2f})")

    test = [score(city, OCT_2022, d, set(obs_test)) for d in args.grid]
    table(f"TEST (held out) · {OCT_2022.label}", test, len(obs_test))

    chosen = next(r for r in test if r["drain"] == best["drain"])
    baseline = next((r for r in test if r["drain"] == 20.0), None)
    print(f"\n  at the fitted drain = {best['drain']:.0f} mm/hr, the held-out event gives "
          f"POD {chosen['pod']:.2f}, CSI {chosen['csi']:.2f}, "
          f"{chosen['critical']}/{chosen['of_wards']} wards critical")
    if baseline:
        print(f"  the old assumed 20 mm/hr gave           "
              f"POD {baseline['pod']:.2f}, CSI {baseline['csi']:.2f}, "
              f"{baseline['critical']}/{baseline['of_wards']} wards critical")


if __name__ == "__main__":
    main()
