"""Local-inertial shallow-water flood model (Bates, Horritt & Fewtrell 2010).

Per step, with water surface eta = z + h:
  1. effective rain     h += C * R(t) * dt            (+ upstream inflow)
  2. drainage transfer  d = min(h, D dt), moved from land cells into their drain/lake
  3. face fluxes        q <- (q - g h_f dt d(eta)/dx) / (1 + g dt n^2 |q| / h_f^(7/3))
  4. positivity limiter scale each donor cell's outflow to at most its stored volume
  5. continuity         h += dt (sum q_in - sum q_out) / dx
  6. open boundary      edge cells discharge outward at normal depth, counted as V_out
Timestep: dt = alpha dx / sqrt(g h_max) (CFL), capped.

All fluxes are exchanged between cells, so total volume changes only through
rain, inflow and boundary outflow. The mass-balance error is tracked every step.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

import numpy as np

from .rainfall import Rain
from .terrain import LAKE, Domain

G = 9.81
H_MIN = 1e-3          # face depth below which no flow is computed (m)
BOUNDARY_SLOPE = 1e-3 # assumed outward bed slope at open edges


@dataclass
class RunParams:
    hours: float = 12.0
    record_min: float = 5.0        # snapshot interval for metrics
    alpha: float = 0.7             # CFL coefficient
    dt_max: float = 60.0
    inflow_cell: tuple[int, int] | None = None
    inflow_m3s: list[float] = field(default_factory=list)  # hourly upstream inflow
    open_boundary: bool = True


@dataclass
class RunResult:
    times_min: np.ndarray          # record times (minutes)
    depth: np.ndarray              # (T, R, C) float32 depths at record times
    rain_mm_hr: np.ndarray         # rain intensity at record times
    volume: np.ndarray             # stored volume at record times (m^3)
    v_in: np.ndarray               # cumulative rain + inflow volume (m^3)
    v_out: np.ndarray              # cumulative boundary outflow (m^3)
    mass_error: np.ndarray         # (V - V0 - Vin + Vout) / max(Vin, tiny)
    dt_series: np.ndarray          # mean dt between records (s)
    steps: int
    runtime_s: float


def simulate(dom: Domain, rain: Rain, rp: RunParams | None = None) -> RunResult:
    rp = rp or RunParams()
    t0 = time.perf_counter()
    z, n2 = dom.z, dom.n ** 2
    dx = dom.cell
    area = dx * dx
    h = dom.h0.astype(np.float64).copy()
    R, Cc = h.shape
    qx = np.zeros((R, Cc - 1))
    qy = np.zeros((R - 1, Cc))

    land_drain = dom.route >= 0
    route_src = np.flatnonzero(land_drain)
    route_dst = dom.route[land_drain]
    D_flat = dom.D.ravel()[land_drain]
    C = dom.C
    n_edge = np.concatenate([dom.n[0, :], dom.n[-1, :], dom.n[:, 0], dom.n[:, -1]])
    # Lakes on the domain edge are closed: they spill over their weir onto land/drains first.
    k_edge = np.concatenate([dom.kind[0, :], dom.kind[-1, :], dom.kind[:, 0], dom.kind[:, -1]])
    edge_open = k_edge != LAKE
    inflow_idx = None if rp.inflow_cell is None else np.ravel_multi_index(rp.inflow_cell, h.shape)

    v0 = h.sum() * area
    v_in = v_out = 0.0
    t = 0.0
    t_end = rp.hours * 3600.0
    rec_dt = rp.record_min * 60.0
    n_rec = int(round(t_end / rec_dt)) + 1
    depth = np.zeros((n_rec, R, Cc), dtype=np.float32)
    rain_rec = np.zeros(n_rec)
    vol = np.zeros(n_rec)
    vin_rec = np.zeros(n_rec)
    vout_rec = np.zeros(n_rec)
    dt_rec = np.zeros(n_rec)
    depth[0] = h
    vol[0] = v0
    rain_rec[0] = rain.intensity(0.0)
    k = 1
    steps = 0
    steps_since = 0
    t_since = 0.0

    while k < n_rec:
        t_next = k * rec_dt
        hmax = max(h.max(), H_MIN)
        dt = min(rp.alpha * dx / np.sqrt(G * hmax), rp.dt_max, t_next - t)

        # 1. rain (+ inflow)
        r = rain.intensity((t + 0.5 * dt) / 3600.0) / 1000.0 / 3600.0  # m/s
        if r > 0:
            add = C * (r * dt)
            h += add
            v_in += add.sum() * area
        if inflow_idx is not None and rp.inflow_m3s:
            hi = min(int(t // 3600.0), len(rp.inflow_m3s) - 1)
            q_in = rp.inflow_m3s[hi] * dt
            if q_in > 0:
                h.flat[inflow_idx] += q_in / area
                v_in += q_in

        # 2. drainage transfer into the drain network (internal, conservative)
        if route_src.size:
            hf = h.ravel()
            d = np.minimum(hf[route_src], D_flat * dt)
            hf[route_src] -= d
            hf += np.bincount(route_dst, weights=d, minlength=hf.size)

        # 3. local-inertial face fluxes (m^2/s)
        eta = z + h
        hfx = np.maximum(eta[:, :-1], eta[:, 1:]) - np.maximum(z[:, :-1], z[:, 1:])
        wet = hfx > H_MIN
        hfx_s = np.where(wet, hfx, 1.0)
        nfx = 0.5 * (n2[:, :-1] + n2[:, 1:])
        qx = (qx - G * hfx_s * dt * (eta[:, 1:] - eta[:, :-1]) / dx) / \
             (1.0 + G * dt * nfx * np.abs(qx) / hfx_s ** (7.0 / 3.0))
        qx = np.where(wet, qx, 0.0)
        lim = hfx_s * np.sqrt(G * hfx_s)          # Froude <= 1 cap for stability
        np.clip(qx, -lim, lim, out=qx)

        hfy = np.maximum(eta[:-1, :], eta[1:, :]) - np.maximum(z[:-1, :], z[1:, :])
        wet = hfy > H_MIN
        hfy_s = np.where(wet, hfy, 1.0)
        nfy = 0.5 * (n2[:-1, :] + n2[1:, :])
        qy = (qy - G * hfy_s * dt * (eta[1:, :] - eta[:-1, :]) / dx) / \
             (1.0 + G * dt * nfy * np.abs(qy) / hfy_s ** (7.0 / 3.0))
        qy = np.where(wet, qy, 0.0)
        lim = hfy_s * np.sqrt(G * hfy_s)
        np.clip(qy, -lim, lim, out=qy)

        # 6. open boundary: normal-depth outflow (Manning) from edge cells
        if rp.open_boundary:
            h_edge = np.concatenate([h[0, :], h[-1, :], h[:, 0], h[:, -1]])
            qb = np.where(edge_open & (h_edge > H_MIN), h_edge ** (5.0 / 3.0) * np.sqrt(BOUNDARY_SLOPE) / n_edge, 0.0)
        else:
            qb = None

        # 4. positivity limiter: outgoing volume of each cell <= its stored volume
        out = np.zeros_like(h)
        out[:, :-1] += np.maximum(qx, 0.0)
        out[:, 1:] += np.maximum(-qx, 0.0)
        out[:-1, :] += np.maximum(qy, 0.0)
        out[1:, :] += np.maximum(-qy, 0.0)
        if qb is not None:
            _add_edges(out, qb, R, Cc)
        need = out * dt / dx
        f = np.where(need > h, h / np.where(need > 0, need, 1.0), 1.0)
        qx = np.where(qx > 0, qx * f[:, :-1], qx * f[:, 1:])
        qy = np.where(qy > 0, qy * f[:-1, :], qy * f[1:, :])

        # 5. continuity
        div = np.zeros_like(h)
        div[:, :-1] -= qx
        div[:, 1:] += qx
        div[:-1, :] -= qy
        div[1:, :] += qy
        if qb is not None:
            fe = np.concatenate([f[0, :], f[-1, :], f[:, 0], f[:, -1]])
            qb = qb * fe
            out_b = np.zeros_like(h)
            _add_edges(out_b, qb, R, Cc)
            div -= out_b
            v_out += out_b.sum() * dt * dx
        h += div * dt / dx
        np.maximum(h, 0.0, out=h)  # clears round-off only (limiter guarantees >= 0)

        t += dt
        steps += 1
        steps_since += 1
        t_since += dt
        if t >= t_next - 1e-9:
            depth[k] = h
            v = h.sum() * area
            vol[k] = v
            vin_rec[k] = v_in
            vout_rec[k] = v_out
            rain_rec[k] = rain.intensity(t / 3600.0)
            dt_rec[k] = t_since / steps_since
            steps_since = 0
            t_since = 0.0
            k += 1

    err = (vol - v0 - vin_rec + vout_rec) / np.maximum(vin_rec, 1.0)
    return RunResult(times_min=np.arange(n_rec) * rp.record_min, depth=depth, rain_mm_hr=rain_rec,
                     volume=vol, v_in=vin_rec, v_out=vout_rec, mass_error=err,
                     dt_series=dt_rec, steps=steps, runtime_s=time.perf_counter() - t0)


def _add_edges(arr: np.ndarray, vals: np.ndarray, R: int, Cc: int) -> None:
    """Add a concatenated [top, bottom, left, right] edge vector onto arr."""
    arr[0, :] += vals[:Cc]
    arr[-1, :] += vals[Cc:2 * Cc]
    arr[:, 0] += vals[2 * Cc:2 * Cc + R]
    arr[:, -1] += vals[2 * Cc + R:]


if __name__ == "__main__":
    import argparse

    from .scenarios import PRESETS
    from .terrain import LAKE, DomainParams, build_domain, load_city

    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="heavy", choices=list(PRESETS))
    ap.add_argument("--hours", type=float, default=12.0)
    args = ap.parse_args()
    city = load_city()
    dom = build_domain(city, DomainParams())
    res = simulate(dom, PRESETS[args.preset], RunParams(hours=args.hours))
    print(f"preset={args.preset} steps={res.steps} runtime={res.runtime_s:.2f}s "
          f"mean dt={res.dt_series[1:].mean():.1f}s")
    print(f"rain in={res.v_in[-1]:.4g} m3  outflow={res.v_out[-1]:.4g} m3  "
          f"max |mass error|={np.abs(res.mass_error).max():.2e}")
    print(f"max depth on land={res.depth[:, dom.kind == 0].max():.2f} m")
