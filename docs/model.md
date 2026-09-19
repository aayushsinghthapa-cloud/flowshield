# FlowShield: mathematical model

This document explains the model the dashboard runs: what it computes, why each piece is there, and how we check that it is correct. Code references are in `backend/engine/`.

## 1. Domain and inputs

| Quantity | Value | Source |
|---|---|---|
| Area | 12.87–13.00 N, 77.57–77.78 E (Koramangala–Challaghatta valley) | chosen to contain the Madiwala → Agara → Bellandur → Varthur cascade |
| Grid | 147 × 231 cells, Δx = 100 m, UTM zone 43N | `pipeline/build_city.py` |
| Elevation *z* | Copernicus GLO-30 DEM, averaged to 100 m | AWS open data |
| Land cover | ESA WorldCover 2021 (10 m) → per-cell fractions | AWS open data |
| Lakes, drains | 116 OSM water bodies ≥ 1 ha, 1,031 OSM waterways | Overpass API |
| Wards, population | 72 BBMP wards (2012), Census 2011 totals | datameet |

### Terrain conditioning (`pipeline/build_city.py`, `engine/terrain.py`)

1. **Depression filling.** A surface model (DSM) contains pits from buildings and trees. Before conditioning they could hold 4.5 × 10⁷ m³, which is 2.6 times the volume of a whole heavy storm, so they would have swallowed every flood. We compute the fully filled surface *z*ᶠ with the priority-flood algorithm (Barnes et al., 2014). We then keep only shallow hollows: *z* ← max(*z*, *z*ᶠ − 0.5 m).
2. **Stream burning.** Mapped drains are lowered by *b* = 2 m, so water finds the real channel network.
3. **Lake bathymetry.** A tank's full (spill) level is the lowest point of the lake or its rim. The DSM over weed-covered tanks can sit metres above the bank, so the rim is the reliable reference. The bed is placed *S* = 3 m below the full level. The initial water depth is *f*₀·*S*, where *f*₀ is the user's "initial lake level".
4. **Weir rule.** A drain cell touching a tank cannot sit below that tank's full level. Tanks therefore only spill once full, which is the *kodi* (weir) that makes the cascade work.
5. **Blocked drain.** The drain's bed is raised 1 m above ground (silt or encroachment). Land cells whose nearest drain is blocked lose their pipe outlet.

## 2. Governing equations (`engine/simulate.py`)

The state per cell is the water depth *h*, with water surface η = *z* + *h*. Each time step:

**(1) Effective rain (rational method)**

  *h*ᵢ ← *h*ᵢ + *C*ᵢ *R*(*t*) Δ*t*, with *C*ᵢ = 1 − (1 − Σₖ *f*ᵢₖ *C*ₖ)(1 − *w*)

*C*ₖ is the runoff coefficient per land cover: built 0.90, bare 0.60, crop/grass 0.35, trees 0.20, water 1.0. *w* ∈ [0, 1] is antecedent wetness. The fraction 1 − *C* is the initial loss and never enters the model's water volume.

**(2) Storm-drain transfer**

  *d*ᵢ = min(*h*ᵢ, *D*(1 − φ)Δ*t*), *h*ᵢ −= *d*ᵢ, *h*ᵣ₍ᵢ₎ += *d*ᵢ

Each land cell within 1.5 km of a mapped drain sends water to its nearest drain or lake cell *r*(*i*). We find *r*(*i*) with a Euclidean distance transform. This is a transfer, not a loss, so drained water re-enters the lake cascade. *D* is the intake capacity (default 20 mm/hr) and φ is the drainage-failure fraction.

**(3) Ponded infiltration**

  ι = min(*h*, *K p* Δ*t*)

*K* = 5 mm/hr and *p* is the pervious fraction. This loss is counted as *V*_inf.

**(4) Local-inertial momentum** (Bates, Horritt & Fewtrell, 2010; the LISFLOOD-FP scheme)

  *q*ⁿ⁺¹ = (*q*ⁿ − *g h*_f Δ*t* ∂η/∂*x*) / (1 + *g* Δ*t* *n*² |*q*ⁿ| / *h*_f^{7/3})

This is solved on every cell face, with face flow depth *h*_f = max(η_i, η_j) − max(*z*_i, *z*_j). *n* is Manning roughness from land cover. The friction term is semi-implicit, which keeps it stable. The discharge is capped at Froude number 1.

**(5) Positivity limiter and continuity**

If a cell's total outgoing volume exceeds its storage, all its outgoing fluxes are scaled down by the same factor. Then:

  *h*ᵢⁿ⁺¹ = *h*ᵢⁿ + (Δ*t*/Δ*x*) Σ(*q*_in − *q*_out)

Every flux leaves one cell and enters its neighbour. Volume is therefore conserved to machine precision, and *h* ≥ 0 always.

**(6) Open boundary**

Edge cells discharge at normal depth, *q*_b = *h*^{5/3} *S*₀^{1/2} / *n*, with *S*₀ = 10⁻³. Boundary lake cells are closed.

**(7) Adaptive time step (CFL)**

  Δ*t* = α Δ*x* / √(*g h*_max), with α = 0.7 and a 60 s cap.

A typical run takes about 3,500 steps for 12 h.

## 3. Mass balance

  ε(*t*) = |*V*(*t*) − *V*₀ − *V*_rain − *V*_inflow + *V*_out + *V*_inf| / *V*_rain

The computation is in float64. On the real grid, ε ≤ 3 × 10⁻¹³ for every scenario we tried. The Model tab plots ε(*t*) and the full volume budget.

## 4. Classification and early warning (`engine/classify.py`)

- **Cell status:** Safe below 0.15 m, Warning from 0.15 m, Critical from 0.30 m. The thresholds follow US NWS "Turn Around Don't Drown" guidance: about 15 cm of moving water can knock an adult down, about 30 cm can float a car. Both are editable in the UI.
- **Ward metric:** the 95th percentile of depth over the ward's **land** cells (lakes and drains excluded). A ward is Critical when at least 5% of its land area is at least 30 cm deep. We chose p95 over p90 after testing on real data: p90 flagged only 2 of 72 wards even in a cloudburst.
- **Time to critical (ETA):** the first time the ward metric reaches 0.30 m, linearly interpolated between the 5-minute records. A "rising fast" flag marks wards whose metric rises at least 10 cm per hour.
- **Affected population:** Census 2011 ward totals are spread over each ward's land cells in proportion to built-up fraction (dasymetric mapping). We then sum people in Warning and Critical cells over time.

## 5. Probabilistic forecast (`engine/ensemble.py`)

For each of the *N* = 31 GFS ensemble members from Open-Meteo, we run the full model on a 200 m aggregated grid for 24 h:

  P(ward *w* critical) = (1/*N*) Σₘ 𝟙[ETA_w^(m) < ∞]

We also report the median ETA among the members that reach Critical.

## 6. Verification (`backend/tests/test_engine.py`, 11 tests)

- Closed bowl: ε < 10⁻⁹ for a cloudburst.
- Depth is never negative on noisy terrain.
- Lake at rest stays exactly at rest (well-balanced), both on a synthetic bowl and on the **real city with no rain** (zero outflow, zero water on land).
- Uniform rain on a flat plane stays uniform, with the correct depth.
- Symmetric terrain and rain give symmetric depth.
- Drain transfer and infiltration are exactly accounted for.
- More drainage failure means more critical area, and blocked drains back water up.

## 7. Limitations

- **Terrain resolution.** A 30 m DSM averaged to 100 m cannot resolve street-scale features such as underpasses.
- **Drain capacity is an assumption.** Capacities are not public, so *D* is a single tunable number and the pipe network is abstracted as "nearest mapped drain".
- **Population is dated.** Census 2011 undercounts today's city, so treat affected-population numbers as relative.
- **Rainfall inputs are coarse.** Forecast and reanalysis rain come from 9–25 km model grids and underestimate cloudbursts. ERA5 shows 18.5 mm on 4 Sep 2022 at Bellandur, while gauges recorded a severe event. The UI offers a thunderstorm peak factor for stress tests.
- **Not calibrated.** The model has not been fitted to observed flood depths. It is a decision-support prototype, not an official forecast.
