"""Offline data pipeline: builds the FlowShield city grid from free public data.

Downloads (cached under pipeline/cache/):
  - Copernicus GLO-30 DEM            -> ground elevation
  - ESA WorldCover 2021 (10 m)       -> land-cover fractions per cell
  - OpenStreetMap via Overpass       -> lakes and drains
  - datameet BBMP 2012 wards         -> ward polygons + Census 2011 population

Writes to backend/data/:
  city.npz        gridded layers (see FIELDS below)
  meta.json       grid geometry, corner coordinates, ward/lake/drain tables
  wards.geojson   ward polygons (WGS84) clipped to the domain
  lakes.geojson   lake polygons (WGS84)
  drains.geojson  drain lines (WGS84), ids match the drain_id raster

Run:  cd backend && ../.venv/bin/python -m pipeline.build_city
"""
from __future__ import annotations

import heapq
import json
import math
from pathlib import Path

import numpy as np
import rasterio
import requests
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import reproject
from rasterio.windows import from_bounds
from scipy.ndimage import distance_transform_edt
from shapely.geometry import LineString, Polygon, mapping, shape
from shapely.ops import linemerge, polygonize, transform as shp_transform, unary_union

# ---------------------------------------------------------------- configuration
# Koramangala–Challaghatta valley: Madiwala -> Agara -> Bellandur -> Varthur.
BBOX = dict(west=77.57, south=12.87, east=77.78, north=13.00)
CELL = 100.0  # metres
CRS_UTM = "EPSG:32643"

DEM_URL = ("https://copernicus-dem-30m.s3.amazonaws.com/"
           "Copernicus_DSM_COG_10_N12_00_E077_00_DEM/Copernicus_DSM_COG_10_N12_00_E077_00_DEM.tif")
WC_URL = ("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
          "ESA_WorldCover_10m_2021_v200_N12E075_Map.tif")
WARDS_URL = ("https://raw.githubusercontent.com/datameet/Municipal_Spatial_Data/"
             "master/Bangalore/BBMP_oldWards.geojson")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
UA = {"User-Agent": "FlowShield-hackathon/0.1 (flood research prototype)"}

# WorldCover class codes grouped into the land-cover fractions the model uses.
WC_GROUPS = {
    "built": [50],
    "tree": [10, 95],
    "grass": [20, 30, 100],
    "crop": [40],
    "bare": [60, 70],
    "water": [80, 90],
}
DRAIN_TYPES = ("drain", "canal", "stream", "river", "ditch")
MIN_LAKE_HA = 1.0
MAX_PIT_M = 0.5  # DSM depressions deeper than this are building/tree artefacts; fill them
WARD_KEEP_FRACTION = 0.5

HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
OUT = HERE.parent / "data"


# ---------------------------------------------------------------- helpers
def fetch(url: str, name: str, *, data: dict | None = None) -> Path:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if path.exists():
        return path
    print(f"  downloading {name} ...")
    if data is None:
        r = requests.get(url, headers=UA, timeout=300)
    else:
        r = requests.post(url, data=data, headers=UA, timeout=300)
    r.raise_for_status()
    path.write_bytes(r.content)
    return path


def grid_geometry():
    """UTM grid covering the lon/lat bbox, snapped to CELL."""
    to_utm = Transformer.from_crs("EPSG:4326", CRS_UTM, always_xy=True)
    xs, ys = to_utm.transform(
        [BBOX["west"], BBOX["east"], BBOX["west"], BBOX["east"]],
        [BBOX["south"], BBOX["south"], BBOX["north"], BBOX["north"]],
    )
    x0 = math.floor(min(xs) / CELL) * CELL
    x1 = math.ceil(max(xs) / CELL) * CELL
    y0 = math.floor(min(ys) / CELL) * CELL
    y1 = math.ceil(max(ys) / CELL) * CELL
    ncols = int(round((x1 - x0) / CELL))
    nrows = int(round((y1 - y0) / CELL))
    transform = from_origin(x0, y1, CELL, CELL)
    return transform, (nrows, ncols), (x0, y0, x1, y1)


def read_to_grid(url: str, transform, shape, resampling, src_bands=None):
    """Read the bbox window of a remote COG and warp it onto the UTM grid."""
    pad = 0.02
    with rasterio.open(url) as src:
        win = from_bounds(BBOX["west"] - pad, BBOX["south"] - pad,
                          BBOX["east"] + pad, BBOX["north"] + pad, src.transform)
        win = win.round_offsets().round_lengths()
        arr = src.read(1, window=win)
        win_transform = src.window_transform(win)
        src_crs = src.crs
    if src_bands is not None:
        return arr, win_transform, src_crs
    dst = np.zeros(shape, dtype=np.float32)
    reproject(arr.astype(np.float32), dst, src_transform=win_transform, src_crs=src_crs,
              dst_transform=transform, dst_crs=CRS_UTM, resampling=resampling)
    return dst


def warp_fraction(mask: np.ndarray, src_transform, src_crs, transform, shape) -> np.ndarray:
    dst = np.zeros(shape, dtype=np.float32)
    reproject(mask.astype(np.float32), dst, src_transform=src_transform, src_crs=src_crs,
              dst_transform=transform, dst_crs=CRS_UTM, resampling=Resampling.average)
    return dst


def priority_flood(z: np.ndarray) -> np.ndarray:
    """Fill all depressions to their spill level (Barnes et al. 2014), draining to the grid edge."""
    R, C = z.shape
    filled = z.copy()
    seen = np.zeros(z.shape, dtype=bool)
    pq: list[tuple[float, int, int]] = []
    for r in range(R):
        for c in range(C):
            if r in (0, R - 1) or c in (0, C - 1):
                heapq.heappush(pq, (float(z[r, c]), r, c))
                seen[r, c] = True
    while pq:
        e, r, c = heapq.heappop(pq)
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < R and 0 <= cc < C and not seen[rr, cc]:
                seen[rr, cc] = True
                filled[rr, cc] = max(z[rr, cc], e)
                heapq.heappush(pq, (float(filled[rr, cc]), rr, cc))
    return filled


# ---------------------------------------------------------------- OSM
def overpass_query() -> dict:
    s, w, n, e = BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"]
    q = f"""
[out:json][timeout:180];
(
  way["natural"="water"]({s},{w},{n},{e});
  relation["natural"="water"]({s},{w},{n},{e});
  way["waterway"~"^({'|'.join(DRAIN_TYPES)})$"]({s},{w},{n},{e});
);
out geom;
"""
    path = fetch(OVERPASS_URL, "osm_water.json", data={"data": q})
    return json.loads(path.read_text())


def osm_features(osm: dict):
    lakes, drains = [], []
    for el in osm["elements"]:
        tags = el.get("tags", {})
        if tags.get("natural") == "water":
            if tags.get("water") in ("river", "canal", "stream", "wastewater", "fountain"):
                continue
            if el["type"] == "way":
                coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
                if len(coords) < 4 or coords[0] != coords[-1]:
                    continue
                geom = Polygon(coords)
            else:
                outers = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
                          for m in el.get("members", [])
                          if m.get("role") == "outer" and m.get("geometry")]
                polys = list(polygonize(linemerge(outers))) if outers else []
                if not polys:
                    continue
                geom = unary_union(polys)
            if not geom.is_valid:
                geom = geom.buffer(0)
            lakes.append({"osm_id": el["id"], "name": tags.get("name", ""), "geom": geom})
        elif tags.get("waterway") in DRAIN_TYPES and el["type"] == "way":
            coords = [(p["lon"], p["lat"]) for p in el.get("geometry", [])]
            if len(coords) < 2:
                continue
            drains.append({"osm_id": el["id"], "name": tags.get("name", ""),
                           "kind": tags["waterway"], "geom": LineString(coords)})
    return lakes, drains


# ---------------------------------------------------------------- main
def main():
    OUT.mkdir(exist_ok=True)
    transform, shape_, (x0, y0, x1, y1) = grid_geometry()
    nrows, ncols = shape_
    print(f"grid {nrows} x {ncols} cells @ {CELL:.0f} m")
    to_utm = Transformer.from_crs("EPSG:4326", CRS_UTM, always_xy=True)
    to_ll = Transformer.from_crs(CRS_UTM, "EPSG:4326", always_xy=True)
    utm = lambda g: shp_transform(to_utm.transform, g)  # noqa: E731

    # --- elevation
    print("DEM ...")
    z = read_to_grid(DEM_URL, transform, shape_, Resampling.average)
    nodata = z < 1.0  # edge cells the source window did not cover
    if nodata.any():
        _, (ri, ci) = distance_transform_edt(nodata, return_indices=True)
        z = z[ri, ci]
        print(f"  filled {nodata.sum()} edge cells from nearest valid elevation")
    print(f"  elevation {z.min():.1f} .. {z.max():.1f} m")
    # Hydrological conditioning: keep shallow hollows, remove deep DSM pits.
    z_dsm = z.copy()
    z = np.maximum(z, priority_flood(z) - MAX_PIT_M).astype(np.float32)
    print(f"  conditioned {(z > z_dsm).sum()} pit cells (max raise {(z - z_dsm).max():.1f} m)")

    # --- land cover fractions
    print("WorldCover ...")
    wc, wc_tf, wc_crs = read_to_grid(WC_URL, transform, shape_, None, src_bands=True)
    frac = {k: warp_fraction(np.isin(wc, codes), wc_tf, wc_crs, transform, shape_)
            for k, codes in WC_GROUPS.items()}
    total = sum(frac.values())
    total[total == 0] = 1.0
    for k in frac:
        frac[k] = frac[k] / total
    print("  mean fractions: " + ", ".join(f"{k}={v.mean():.2f}" for k, v in frac.items()))

    # --- OSM lakes and drains
    print("OSM ...")
    lakes_raw, drains_raw = osm_features(overpass_query())
    lakes = []
    for lk in lakes_raw:
        g = utm(lk["geom"])
        if g.area / 1e4 >= MIN_LAKE_HA:
            lakes.append({**lk, "utm": g})
    lakes.sort(key=lambda l: -l["utm"].area)
    lake_id = rasterize(((l["utm"], i) for i, l in enumerate(lakes)), out_shape=shape_,
                        transform=transform, fill=-1, dtype="int32")
    drains = [{**d, "utm": utm(d["geom"])} for d in drains_raw]
    drain_id = rasterize(((d["utm"], i) for i, d in enumerate(drains)), out_shape=shape_,
                         transform=transform, fill=-1, dtype="int32", all_touched=True)
    drain_id[lake_id >= 0] = -1
    print(f"  {len(lakes)} lakes >= {MIN_LAKE_HA} ha ({(lake_id >= 0).sum()} cells), "
          f"{len(drains)} drain ways ({(drain_id >= 0).sum()} cells)")

    # --- wards + population
    print("Wards ...")
    wards_gj = json.loads(fetch(WARDS_URL, "bbmp_old_wards.geojson").read_text())
    domain = Polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
    wards = []
    for f in wards_gj["features"]:
        g = utm(shape(f["geometry"]))
        if not g.is_valid:
            g = g.buffer(0)
        inside = g.intersection(domain)
        if g.area == 0 or inside.area / g.area < WARD_KEEP_FRACTION:
            continue
        p = f["properties"]
        wards.append({"no": int(p["WARD_NO"]), "name": p["WARD_NAME"].replace(" Ward", ""),
                      "pop2011": float(p["POP_TOTAL"]), "inside": inside,
                      "inside_frac": inside.area / g.area, "full": g})
    wards.sort(key=lambda w: w["no"])
    ward_id = rasterize(((w["inside"], i) for i, w in enumerate(wards)), out_shape=shape_,
                        transform=transform, fill=-1, dtype="int32")

    # Dasymetric population: ward total (scaled to the part inside the domain)
    # spread over its land cells in proportion to built-up fraction.
    pop = np.zeros(shape_, dtype=np.float32)
    land = (lake_id < 0)
    for i, w in enumerate(wards):
        cells = (ward_id == i) & land
        if not cells.any():
            continue
        weight = frac["built"][cells] + 0.05
        pop[cells] = w["pop2011"] * w["inside_frac"] * weight / weight.sum()
    print(f"  {len(wards)} wards kept, population (Census 2011, in domain) = {pop.sum():,.0f}")

    # --- write outputs
    np.savez_compressed(
        OUT / "city.npz",
        z=z.astype(np.float32), z_dsm=z_dsm.astype(np.float32), lake_id=lake_id.astype(np.int16),
        drain_id=drain_id.astype(np.int32), ward_id=ward_id.astype(np.int16),
        pop=pop, **{f"frac_{k}": v.astype(np.float32) for k, v in frac.items()},
    )

    def to_wgs(g):
        return shp_transform(to_ll.transform, g)

    corners_utm = [(x0, y1), (x1, y1), (x1, y0), (x0, y0)]  # TL, TR, BR, BL
    corners = [list(to_ll.transform(x, y)) for x, y in corners_utm]
    ward_rows = []
    wards_features = []
    for i, w in enumerate(wards):
        n_cells = int((ward_id == i).sum())
        c = to_wgs(w["inside"]).centroid
        ward_rows.append({"id": i, "no": w["no"], "name": w["name"],
                          "pop2011_in_domain": round(w["pop2011"] * w["inside_frac"]),
                          "cells": n_cells, "centroid": [round(c.x, 5), round(c.y, 5)]})
        geom = to_wgs(w["inside"]).simplify(0.0001)
        wards_features.append({"type": "Feature", "id": i,
                               "properties": {"id": i, "no": w["no"], "name": w["name"]},
                               "geometry": mapping(geom)})
    lake_rows, lake_features = [], []
    for i, l in enumerate(lakes):
        lake_rows.append({"id": i, "osm_id": l["osm_id"], "name": l["name"],
                          "area_ha": round(l["utm"].area / 1e4, 1),
                          "cells": int((lake_id == i).sum())})
        lake_features.append({"type": "Feature", "id": i,
                              "properties": {"id": i, "name": l["name"]},
                              "geometry": mapping(l["geom"].simplify(0.00005))})
    drain_features = []
    for i, d in enumerate(drains):
        drain_features.append({"type": "Feature", "id": i,
                               "properties": {"id": i, "osm_id": d["osm_id"], "name": d["name"],
                                              "kind": d["kind"],
                                              "length_m": round(d["utm"].length)},
                               "geometry": mapping(d["geom"])})

    meta = {
        "bbox": BBOX, "crs": CRS_UTM, "cell_m": CELL, "shape": [nrows, ncols],
        "origin_utm": [x0, y1], "corners_lonlat": corners,
        "wards": ward_rows, "lakes": lake_rows,
        "sources": ["Copernicus GLO-30 DEM", "ESA WorldCover 2021", "OpenStreetMap (ODbL)",
                    "datameet BBMP wards, Census 2011"],
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    for name, feats in [("wards", wards_features), ("lakes", lake_features),
                        ("drains", drain_features)]:
        (OUT / f"{name}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": feats}))
    print("wrote", ", ".join(p.name for p in sorted(OUT.iterdir())))


if __name__ == "__main__":
    main()
