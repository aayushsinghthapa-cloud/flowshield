"""Validate FlowShield against the observed 4-5 September 2022 Bengaluru flood.

What this does
--------------
1. Takes the list of localities that news reports and KSNDMC/IMD coverage named as
   flooded on the night of 4-5 Sep 2022 (sources in docs/validation.md).
2. Geocodes each one with OpenStreetMap Nominatim and finds which BBMP ward polygon
   it falls in, so "observed flooded" becomes a set of ward ids on our own grid.
3. Runs the model with the reported rainfall for that event.
4. Scores the model's Critical wards against the observed set: hits, misses, false
   alarms, and the standard categorical skill scores (POD, FAR, CSI).

What this is not
----------------
This is a *categorical* check of where flooding happened, not a check of depth. There
are no measured flood depths published for these streets, so there is nothing to
regress against. The observed list also comes from news coverage, which reports the
newsworthy: a ward missing from the list is not evidence that it stayed dry. So POD
(did we catch what was reported?) is meaningful, while FAR is an upper bound only.

Run:  .venv/bin/python -m validation.sept2022     (from backend/)
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from engine.classify import CRITICAL, WARNING

CACHE = Path(__file__).parent / "geocode_cache.json"
UA = "FlowShield/1.0 (Hack-a-Matics 2026 student project; flood model validation)"

# Localities reported flooded on 4-5 Sep 2022. Each entry is the name as reported,
# plus the query we send to Nominatim. Sources are listed in docs/validation.md.
OBSERVED = [
    ("Bellandur / ORR Eco Space", "Bellandur, Bengaluru, Karnataka, India"),
    ("Varthur", "Varthur, Bengaluru, Karnataka, India"),
    ("Doddakanneli (Sarjapur Road)", "Doddakanneli, Bengaluru, Karnataka, India"),
    ("HSR Layout", "HSR Layout, Bengaluru, Karnataka, India"),
    ("Silk Board junction", "Central Silk Board, Bengaluru, Karnataka, India"),
    ("ST Bed Layout, Koramangala", "Koramangala, Bengaluru, Karnataka, India"),
    ("Marathahalli", "Marathahalli, Bengaluru, Karnataka, India"),
    ("Doddanekkundi", "Doddanekkundi, Bengaluru, Karnataka, India"),
    ("Yemalur", "Yemalur, Bengaluru, Karnataka, India"),
    ("Wilson Garden", "Wilson Garden, Bengaluru, Karnataka, India"),
    ("Sarjapur Road", "Sarjapur Road, Bengaluru, Karnataka, India"),
    ("Bommanahalli", "Bommanahalli, Bengaluru, Karnataka, India"),
]

# The event as reported: 131.6 mm over the city on 5 Sep 2022, the wettest September
# day since 2014, falling mostly as an overnight downpour. August 2022 was the second
# wettest August on record, so the tanks were already full and the ground saturated.
EVENT = dict(total_mm=131.6, duration_hr=6.0, hours=18.0, lake_fill=0.95,
             antecedent_wetness=0.9, grid_m=100)


def geocode(queries: list[str]) -> dict[str, tuple[float, float]]:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    for q in queries:
        if q in cache:
            continue
        url = ("https://nominatim.openstreetmap.org/search?"
               + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1}))
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            hits = json.load(r)
        cache[q] = [float(hits[0]["lon"]), float(hits[0]["lat"])] if hits else None
        print(f"  geocoded {q!r} -> {cache[q]}", file=sys.stderr)
        time.sleep(1.1)  # Nominatim asks for <= 1 request/second
    CACHE.write_text(json.dumps(cache, indent=1))
    return {q: tuple(v) for q, v in cache.items() if v}


def observed_wards_for(localities: list[tuple[str, str]]) -> tuple[dict[int, list[str]], list[str]]:
    """ward id -> reported localities inside it, and the ones outside our domain.

    Nothing is hand-assigned: each locality is geocoded and then placed by
    point-in-polygon into whichever ward actually contains it.
    """
    from shapely.geometry import Point, shape

    geo = json.loads((Path(__file__).parents[1] / "data" / "wards.geojson").read_text())
    polys = [(f["properties"]["id"], f["properties"]["name"], shape(f["geometry"]))
             for f in geo["features"]]
    coords = geocode([q for _, q in localities])

    hits: dict[int, list[str]] = {}
    outside: list[str] = []
    for label, q in localities:
        if q not in coords:
            outside.append(f"{label} (not geocoded)")
            continue
        p = Point(*coords[q])
        for wid, _name, poly in polys:
            if poly.contains(p):
                hits.setdefault(wid, []).append(label)
                break
        else:
            outside.append(f"{label} (outside the modelled area)")
    return hits, outside


def observed_wards() -> tuple[dict[int, list[str]], list[str]]:
    return observed_wards_for(OBSERVED)


def run_event():
    from engine.classify import classify
    from engine.rainfall import Rain
    from engine.simulate import RunParams, simulate
    from engine.terrain import DomainParams, build_domain, load_city

    city = load_city()
    dp = DomainParams(lake_fill=EVENT["lake_fill"],
                      antecedent_wetness=EVENT["antecedent_wetness"])
    domain = build_domain(city, dp)
    # A triangular hyetograph carrying the reported total over the reported duration:
    # for a triangle, peak intensity = 2 * total / duration.
    rain = Rain(profile="triangular",
                peak_mm_hr=2.0 * EVENT["total_mm"] / EVENT["duration_hr"],
                duration_hr=EVENT["duration_hr"],
                peak_at_hr=EVENT["duration_hr"] * 0.4)
    res = simulate(domain, rain, RunParams(hours=EVENT["hours"]))
    return classify(city, domain, res)


def main() -> None:
    print("Mapping reported localities to wards...", file=sys.stderr)
    obs, outside = observed_wards()
    print(f"Running the event: {EVENT['total_mm']} mm over {EVENT['duration_hr']} h, "
          f"lakes {EVENT['lake_fill']:.0%}, ground {EVENT['antecedent_wetness']:.0%} wet",
          file=sys.stderr)
    out = run_event()

    wards = {w.id: w for w in out.wards}
    predicted = {w.id for w in out.wards if w.peak_status == CRITICAL}
    warned = {w.id for w in out.wards if w.peak_status >= WARNING}
    observed = set(obs)

    hits = observed & predicted
    misses = observed - predicted
    caught_as_warning = misses & warned
    false_alarms = predicted - observed

    pod = len(hits) / len(observed) if observed else float("nan")
    far = len(false_alarms) / len(predicted) if predicted else float("nan")
    csi = len(hits) / max(1, len(hits) + len(misses) + len(false_alarms))

    print("\n=== OBSERVED (reported flooded, mapped to our wards) ===")
    for wid in sorted(observed, key=lambda i: wards[i].name):
        w = wards[wid]
        mark = "HIT " if wid in hits else ("warn" if wid in warned else "MISS")
        eta = f"{w.eta_min:.0f} min" if w.eta_min is not None else "--"
        print(f"  [{mark}] {w.name:24s} peak={w.peak_m*100:5.1f} cm  eta={eta:>8s}"
              f"   <- {', '.join(obs[wid])}")
    if outside:
        print("\n  outside the modelled domain (not scored): " + "; ".join(outside))

    print("\n=== MODEL-CRITICAL WARDS NOT IN THE REPORTED LIST ===")
    for wid in sorted(false_alarms, key=lambda i: wards[i].eta_min or 1e9):
        w = wards[wid]
        eta = f"{w.eta_min:.0f} min" if w.eta_min is not None else "--"
        print(f"  {w.name:24s} peak={w.peak_m*100:5.1f} cm  eta={eta:>8s}")

    print("\n=== SCORE ===")
    print(f"  observed wards        {len(observed)}")
    print(f"  model critical wards  {len(predicted)}")
    print(f"  hits                  {len(hits)}")
    print(f"  misses                {len(misses)}  (of which {len(caught_as_warning)} "
          f"were flagged Warning, not Critical)")
    print(f"  not in reports        {len(false_alarms)}")
    print(f"  POD (hit rate)        {pod:.2f}")
    print(f"  FAR (upper bound)     {far:.2f}")
    print(f"  CSI                   {csi:.2f}")
    print(f"\n  peak people in deep water: {out.pop_critical.max():,.0f}")
    print(f"  peak flooded area:         {out.area_critical_km2.max():.2f} km2")


def sweep() -> None:
    """How the score moves with the assumptions we cannot read off the record."""
    from engine.classify import classify
    from engine.rainfall import Rain
    from engine.simulate import RunParams, simulate
    from engine.terrain import DomainParams, build_domain, load_city

    obs, _ = observed_wards()
    observed = set(obs)
    city = load_city()
    print(f"{'dur':>4} {'lake':>5} {'wet':>4} | {'crit':>4} {'hit':>3} {'POD':>5} "
          f"{'FAR':>5} {'CSI':>5} {'km2':>6} {'people':>9}")
    for dur, lf, aw in [(6, .95, .9), (6, .75, .6), (12, .95, .9),
                        (12, .75, .6), (24, .95, .9), (24, .60, .4)]:
        dom = build_domain(city, DomainParams(lake_fill=lf, antecedent_wetness=aw))
        rain = Rain(profile="triangular", peak_mm_hr=2 * EVENT["total_mm"] / dur,
                    duration_hr=dur, peak_at_hr=dur * 0.4)
        out = classify(city, dom, simulate(dom, rain, RunParams(hours=dur + 12)))
        pred = {w.id for w in out.wards if w.peak_status == CRITICAL}
        h, m, fa = observed & pred, observed - pred, pred - observed
        pod = len(h) / len(observed)
        far = len(fa) / len(pred) if pred else 0.0
        csi = len(h) / max(1, len(h) + len(m) + len(fa))
        print(f"{dur:>4} {lf:>5.2f} {aw:>4.1f} | {len(pred):>4} {len(h):>3} {pod:>5.2f} "
              f"{far:>5.2f} {csi:>5.2f} {out.area_critical_km2.max():>6.1f} "
              f"{out.pop_critical.max():>9,.0f}")


if __name__ == "__main__":
    sweep() if "--sweep" in sys.argv else main()
