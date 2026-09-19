"""Engine tests: conservation, positivity, well-balancedness, symmetry, real-city behaviour."""
import numpy as np
import pytest

from engine.classify import Thresholds, classify
from engine.rainfall import Rain
from engine.scenarios import PRESETS
from engine.simulate import RunParams, simulate
from engine.terrain import CHANNEL, LAKE, LAND, Domain, DomainParams, build_domain, load_city


def synthetic(z: np.ndarray, h0=None, C=1.0, n=0.03, D=0.0, cell=100.0) -> Domain:
    shape = z.shape
    return Domain(z=z.astype(float), h0=np.zeros(shape) if h0 is None else h0.astype(float),
                  C=np.full(shape, C), n=np.full(shape, n), D=np.full(shape, D),
                  route=np.full(z.size, -1), kind=np.full(shape, LAND, dtype=np.int8), cell=cell,
                  infil=np.zeros(shape))


def bowl(N=31):
    y, x = np.mgrid[:N, :N] - N // 2
    return 0.01 * (x ** 2 + y ** 2).astype(float)


def test_mass_balance_closed_bowl():
    res = simulate(synthetic(bowl()), PRESETS["cloudburst"], RunParams(hours=4, open_boundary=False))
    assert np.abs(res.mass_error).max() < 1e-9
    assert res.v_out[-1] == 0.0


def test_depth_never_negative():
    z = bowl() + np.random.default_rng(0).normal(0, 0.5, (31, 31))
    res = simulate(synthetic(z), PRESETS["heavy"], RunParams(hours=4))
    assert res.depth.min() >= 0.0


def test_lake_at_rest_is_still():
    # Flat water surface over an uneven bed must stay exactly still (well-balanced).
    z = bowl()
    level = 3.0
    h0 = np.maximum(level - z, 0.0)
    res = simulate(synthetic(z, h0=h0), Rain(peak_mm_hr=0.0), RunParams(hours=2, open_boundary=False))
    np.testing.assert_allclose(res.depth[-1], h0, atol=1e-6)


def test_flat_uniform_rain_stays_uniform():
    z = np.zeros((20, 20))
    res = simulate(synthetic(z), Rain(profile="constant", peak_mm_hr=36.0, duration_hr=1.0),
                   RunParams(hours=1, open_boundary=False))
    assert np.ptp(res.depth[-1]) < 1e-9
    assert res.depth[-1].mean() == pytest.approx(0.036, rel=1e-6)  # snapshots stored as float32


def test_symmetric_input_symmetric_output():
    z = bowl(25)
    res = simulate(synthetic(z), PRESETS["heavy"], RunParams(hours=3, open_boundary=False))
    d = res.depth[-1]
    np.testing.assert_allclose(d, d[::-1, :], atol=1e-9)
    np.testing.assert_allclose(d, d[:, ::-1], atol=1e-9)


def test_drainage_transfer_is_conservative():
    z = bowl(15)
    dom = synthetic(z, D=20 / 1000 / 3600)
    dom.route = np.full(z.size, (7 * 15 + 7))   # everything pipes to the centre
    dom.route[7 * 15 + 7] = -1
    res = simulate(dom, PRESETS["heavy"], RunParams(hours=3, open_boundary=False))
    assert np.abs(res.mass_error).max() < 1e-9


# ---------------------------------------------------------------- real city
@pytest.fixture(scope="module")
def city():
    return load_city()


def test_real_city_at_rest_without_rain(city):
    dom = build_domain(city, DomainParams())
    res = simulate(dom, Rain(peak_mm_hr=0.0), RunParams(hours=2))
    assert res.v_out[-1] == 0.0
    assert res.depth[-1][dom.kind == LAND].max() == 0.0


def test_real_city_heavy_mass_balance(city):
    dom = build_domain(city, DomainParams())
    res = simulate(dom, PRESETS["heavy"], RunParams(hours=6))
    assert np.abs(res.mass_error).max() < 1e-9
    assert res.depth.min() >= 0.0


def test_worse_conditions_flood_more(city):
    th = Thresholds()
    base = classify(city, dom := build_domain(city, DomainParams()),
                    simulate(dom, PRESETS["heavy"], RunParams(hours=6)), th)
    failed = classify(city, dom2 := build_domain(city, DomainParams(drainage_failure=0.8)),
                      simulate(dom2, PRESETS["heavy"], RunParams(hours=6)), th)
    assert failed.pop_critical.max() >= base.pop_critical.max()
    assert failed.area_critical_km2.max() > base.area_critical_km2.max()


def test_blocked_drain_backs_up(city):
    # Block the drains that feed Bellandur's catchment and check land water rises.
    dom = build_domain(city, DomainParams())
    drains = np.unique(city.drain_id[(city.drain_id >= 0) & (dom.kind == CHANNEL)])
    blocked = frozenset(int(d) for d in drains[: len(drains) // 2])
    base = simulate(dom, PRESETS["heavy"], RunParams(hours=4))
    dom_b = build_domain(city, DomainParams(blocked_drains=blocked))
    res_b = simulate(dom_b, PRESETS["heavy"], RunParams(hours=4))
    land = dom.kind == LAND
    assert res_b.depth[-1][land].sum() > base.depth[-1][land].sum()
    assert (dom_b.kind == LAKE).sum() == (dom.kind == LAKE).sum()


def test_infiltration_is_accounted():
    z = bowl(15)
    dom = synthetic(z)
    dom.infil = np.full(z.shape, 10 / 1000 / 3600)
    res = simulate(dom, PRESETS["heavy"], RunParams(hours=6, open_boundary=False))
    assert res.v_inf[-1] > 0
    assert np.abs(res.mass_error).max() < 1e-9


def test_ensemble_aggregate():
    from engine.ensemble import aggregate
    out = {w["id"]: w for w in aggregate([{1: 30.0, 2: None}, {1: 50.0, 2: None}, {1: None, 2: 90.0}, {1: None, 2: None}])}
    assert out[1]["p_critical"] == 0.5 and out[1]["eta_median_min"] == 40.0
    assert out[2]["p_critical"] == 0.25 and out[2]["eta_p10_min"] == 90.0
