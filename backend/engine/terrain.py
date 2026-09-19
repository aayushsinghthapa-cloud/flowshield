"""Load the processed city grid and derive the per-cell model fields.

Pure NumPy/SciPy. No web-framework imports, so the engine is testable on its own.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_dilation, distance_transform_edt, grey_dilation

DATA = Path(__file__).resolve().parents[1] / "data"

# Runoff coefficient C and Manning roughness n per land-cover group.
# Standard textbook ranges (rational method / open-channel tables), mid values.
RUNOFF_C = {"built": 0.90, "bare": 0.60, "crop": 0.35, "grass": 0.35, "tree": 0.20, "water": 1.0}
MANNING_N = {"built": 0.015, "bare": 0.025, "crop": 0.035, "grass": 0.035, "tree": 0.10,
             "water": 0.03}
WATER_N = 0.03

LAND, LAKE, CHANNEL = 0, 1, 2
_CROSS = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool)


@dataclass
class City:
    """Static inputs from the data pipeline."""
    z: np.ndarray            # ground/water-surface elevation from the DEM (m)
    lake_id: np.ndarray      # -1 or lake index
    drain_id: np.ndarray     # -1 or OSM drain index
    ward_id: np.ndarray      # -1 or ward index
    pop: np.ndarray          # Census 2011 people per cell
    frac: dict[str, np.ndarray]
    cell: float
    meta: dict

    @property
    def shape(self):
        return self.z.shape


@dataclass
class DomainParams:
    """Parameters that shape the domain before a run (not time-dependent)."""
    burn_depth_m: float = 2.0          # depth of mapped drains below ground
    lake_depth_m: float = 3.0          # usable storage depth of tanks
    lake_fill: float = 0.5             # initial lake water level as fraction of depth
    drain_capacity_mm_hr: float = 20.0 # storm-drain intake capacity of land cells
    drainage_failure: float = 0.0      # 0..1 global fraction of capacity lost
    antecedent_wetness: float = 0.0    # 0 dry .. 1 saturated soil
    blocked_drains: frozenset[int] = field(default_factory=frozenset)
    blockage_height_m: float = 1.0     # debris/encroachment raising a blocked drain bed
    max_route_m: float = 1500.0        # land cells farther than this from a drain are not piped
    infiltration_mm_hr: float = 5.0    # ponded-water infiltration on pervious ground (after runoff C)


@dataclass
class Domain:
    """Model-ready arrays (float64) for one run."""
    z: np.ndarray
    h0: np.ndarray
    C: np.ndarray
    n: np.ndarray
    D: np.ndarray             # drainage capacity (m/s)
    route: np.ndarray         # flat index each land cell drains into (-1 = none)
    infil: np.ndarray         # infiltration capacity of ponded water (m/s)
    kind: np.ndarray          # LAND / LAKE / CHANNEL
    cell: float


def load_city(data_dir: Path = DATA) -> City:
    d = np.load(data_dir / "city.npz")
    meta = json.loads((data_dir / "meta.json").read_text())
    frac = {k[5:]: d[k].astype(np.float64) for k in d.files if k.startswith("frac_")}
    return City(z=d["z"].astype(np.float64), lake_id=d["lake_id"].astype(np.int32),
                drain_id=d["drain_id"].astype(np.int32), ward_id=d["ward_id"].astype(np.int32),
                pop=d["pop"].astype(np.float64), frac=frac, cell=float(meta["cell_m"]), meta=meta)


def coarsen(city: City, k: int = 2) -> City:
    """Aggregate k x k blocks for fast runs. The grid is padded (not trimmed) so the
    coarse grid covers exactly the same ground extent. Elevation and land-cover
    fractions are averaged, population summed, ids take the block's commonest value."""
    R, C = city.z.shape
    pr, pc = (-R) % k, (-C) % k

    def blocks(a, mode="edge", value=0):
        pad = np.pad(a, ((0, pr), (0, pc)), mode=mode) if mode == "edge" \
            else np.pad(a, ((0, pr), (0, pc)), mode="constant", constant_values=value)
        r, c = pad.shape
        return pad.reshape(r // k, k, c // k, k).swapaxes(1, 2).reshape(r // k, c // k, k * k)

    def mode_id(a, min_count=1):
        b = blocks(a, mode="constant", value=-1)
        out = np.full(b.shape[:2], -1, dtype=np.int32)
        for i in range(k * k):
            v = b[..., i]
            cnt = (b == v[..., None]).sum(-1)
            better = (v >= 0) & (cnt >= min_count) & ((out < 0) | (cnt > (b == out[..., None]).sum(-1)))
            out = np.where(better, v, out)
        return out

    return City(
        z=blocks(city.z).mean(-1),
        lake_id=mode_id(city.lake_id, min_count=(k * k) // 2),
        drain_id=mode_id(city.drain_id),
        ward_id=mode_id(city.ward_id),
        pop=blocks(city.pop, mode="constant").sum(-1),
        frac={n: blocks(v).mean(-1) for n, v in city.frac.items()},
        cell=city.cell * k,
        meta=city.meta,
    )


def build_domain(city: City, p: DomainParams) -> Domain:
    z = city.z.copy()
    lake = city.lake_id >= 0
    channel = (city.drain_id >= 0) & ~lake
    blocked = channel & np.isin(city.drain_id, list(p.blocked_drains))
    open_channel = channel & ~blocked

    kind = np.full(z.shape, LAND, dtype=np.int8)
    kind[lake] = LAKE
    kind[channel] = CHANNEL

    # Stream burning: mapped drains sit below the surrounding ground.
    z[open_channel] -= p.burn_depth_m
    # A blocked drain is silted/encroached: bed raised above the ground.
    z[blocked] += p.blockage_height_m

    # Lakes: the full-tank (spill) level is the lowest point of the lake or its
    # rim (the DSM over weed/tree-covered tanks is unreliable). Put the bed S
    # below it and start at the given fill fraction.
    h0 = np.zeros_like(z)
    surface = np.full(z.shape, -np.inf)
    for i in np.unique(city.lake_id[lake]):
        m = city.lake_id == i
        rim = binary_dilation(m, structure=_CROSS) & ~lake
        surface[m] = min(city.z[m].min(), city.z[rim].min()) if rim.any() else city.z[m].min()
        z[m] = surface[m] - p.lake_depth_m
        h0[m] = p.lake_depth_m * p.lake_fill
    # Weir (kodi): a tank only spills once it is full, so a drain cell touching
    # a lake cannot sit below that lake's full level.
    crest = grey_dilation(surface, footprint=_CROSS)
    weir = channel & np.isfinite(crest)
    z[weir] = np.maximum(z[weir], crest[weir])

    # Runoff coefficient and roughness from land-cover fractions.
    C = sum(city.frac[k] * RUNOFF_C[k] for k in RUNOFF_C)
    n = sum(city.frac[k] * MANNING_N[k] for k in MANNING_N)
    C = 1.0 - (1.0 - C) * (1.0 - p.antecedent_wetness)
    C[kind != LAND] = 1.0
    n[kind != LAND] = WATER_N

    # Drain routing: every land cell pipes into its nearest drain or lake cell.
    receivers = (open_channel | lake)
    dist, (ri, ci) = distance_transform_edt(~receivers, return_indices=True)
    route = np.ravel_multi_index((ri, ci), z.shape)
    D = np.full(z.shape, p.drain_capacity_mm_hr / 1000.0 / 3600.0 * (1.0 - p.drainage_failure))
    no_pipe = (kind != LAND) | (dist * city.cell > p.max_route_m)
    # Cells whose nearest drain is blocked lose their outlet too.
    if blocked.any():
        _, (bri, bci) = distance_transform_edt(~(receivers | blocked), return_indices=True)
        no_pipe |= blocked[bri, bci]
    D[no_pipe] = 0.0
    route = np.where(no_pipe, -1, route).ravel()

    pervious = 1.0 - city.frac["built"] - city.frac["water"]
    infil = np.where(kind == LAND, np.clip(pervious, 0, 1), 0.0) * p.infiltration_mm_hr / 1000.0 / 3600.0
    infil *= (1.0 - p.antecedent_wetness)

    return Domain(z=z, h0=h0, C=C, n=n, D=D, route=route, kind=kind, cell=city.cell, infil=infil)
