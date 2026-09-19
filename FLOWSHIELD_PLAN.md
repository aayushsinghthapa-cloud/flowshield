# FlowShield: Bengaluru — Build Plan v2 (real data, competition-optimised)

## Context

Hack-a-Matics 2026 (Pentagram BMSCE × IEEE CS), theme VECTOR, problem **FLOWSHIELD**. Window: Sat 19 Sep 6:00 PM → Sun 20 Sep 6:00 PM IST. Submission form opens 5:00 PM; we submit **5:00–5:30 PM**. Team 3–4 (brochure rule).
Brochure deliverable chain (the video must follow this order): **Rainfall & terrain input → Water-level simulation → Flood progression → Risk classification → Early warning output.**
Brochure inputs to model explicitly: rainfall intensity, drainage capacity, **initial water level**, terrain/elevation, **water inflow/outflow**, **region connectivity**.
Disqualifiers: faked or hardcoded AI, pre-built code, late submission. README must name the AI component and disclose boilerplate and libraries.

The v1 plan used synthetic terrain and made-up wards. The user wants a prototype built on **real, free, live data** so it is usable and credible. It's 8:20 PM, so we're 2.3 h into the window and the timeline has been redone. Decisions made: **Gemini free tier** for the LLM, **SE lake catchment** (Koramangala–Challaghatta valley) for the map area.

---

## 1. Critique of v1 (what changes and why)

| # | v1 issue | Fix in v2 |
|---|---|---|
| 1 | Synthetic terrain and fake wards hurt Real-World Impact | Real DEM, land cover, OSM lakes and drains, real BBMP wards with Census population (all checked reachable tonight) |
| 2 | Leaves out brochure inputs: *initial water level*, *inflow/outflow*, *connectivity* | Initial lake fill % + antecedent wetness; upstream inflow hydrograph + open outlet boundary; lake-cascade connectivity graph shown in UI |
| 3 | Diffusive flux `α(H_i−H_j)/2` ignores Δt, Δx and roughness, so water speed is a grid artefact and **ETA-in-minutes is meaningless** | **Local-inertial shallow-water scheme** (Bates et al. 2010, LISFLOOD-FP) with Manning's *n* and a CFL adaptive timestep. Still ~30 lines of vectorised NumPy, and physically defensible |
| 4 | Mass-balance formula leaves out infiltration (1−C) and treats drainage as vanishing water, which breaks the cascade story | Rain counted as *effective* rain C·R. Drainage **routes** water into the nearest channel/lake cell (storm-drain network), so it is an internal transfer. Only the outlet boundary removes water. Error = V_now − V₀ − V_in + V_out |
| 5 | Lake cells count in the ward p90, so lakeside wards are always "Critical" | Ward metrics use **land cells only** (lakes and channels excluded) |
| 6 | "Blocked drain" = painting arbitrary cells | Click a **real OSM drain segment** to block it: bed un-burned + routing through it cut, so water backs up upstream |
| 7 | ML surrogate (A3): high effort, low judge value | Dropped. Replaced by an **ensemble probabilistic early warning**: run the engine on every Open-Meteo ensemble member → P(ward critical in next 24–48 h). Hits "Predict", Math and Innovation at once |
| 8 | JSON depth grids per frame are too heavy | Frames as base64 uint16 (mm), 15-min cadence, GZip middleware |
| 9 | Render free tier: 0.1 CPU and cold starts, which would kill ensemble runs | **Single Docker container on Hugging Face Spaces** (free, 2 vCPU/16 GB), FastAPI serving the built frontend too (no CORS, one URL) |
| 10 | LLM bulletin could hallucinate numbers | **Grounding check**: every number in the bulletin is regex-matched against the input payload, with a "numbers verified ✓/✗" badge. A Kannada-reading teammate reviews output before the video |
| 11 | Reanalysis rain looks like "real data" but misleads: Open-Meteo ERA5 gives **18.5 mm on 4 Sep 2022** at Bellandur, far below the gauge-reported cloudburst | Historical replay uses a gauge-reported total (team sources KSNDMC/news figure) shaped into a hyetograph, clearly labelled. Forecast mode notes that 25 km model rain smooths convective peaks (optional peak factor) |
| 12 | Timeline assumes a 5:30 PM start | Re-planned from 8:30 PM below |
| 13 | Heavy geo deps (rasterio/geopandas) would bloat the server | Only in an **offline data pipeline**. Its processed output (<5 MB npz/geojson) is committed. Runtime needs numpy, scipy, fastapi, httpx, google-genai |
| 14 | Local env: default Python is 3.14 (geo wheels risky), no `gh` CLI | Use `/opt/homebrew/bin/python3.11` venv. Create the GitHub repo in the web UI |

---

## 2. Real data sources (free, verified reachable 19 Sep 20:20 IST)

| Layer | Source | Use |
|---|---|---|
| Elevation | Copernicus GLO-30 DEM COG on AWS (`copernicus-dem-30m`, tile N12 E077) | z, resampled to a 100 m UTM-43N grid |
| Land cover | ESA WorldCover 2021 10 m COG (tile N12E075) | Per-cell built-up/tree/grass/water fractions → runoff C, Manning n, dasymetric population weights |
| Lakes, drains | OSM via Overpass (`natural=water`, `waterway=drain\|canal\|stream`; ~1,065 ways in the bbox), with User-Agent header | Lake mask + storage, channel burning, drain segments for the block tool |
| Wards + population | datameet `Bangalore/BBMP_oldWards.geojson` (198 wards, **Census 2011 POP_TOTAL**) | Region polygons, population disaggregated to cells by built-up fraction |
| Live rain | Open-Meteo Forecast API (hourly/15-min precip, no key) | "Live forecast" scenario |
| Probabilistic rain | Open-Meteo Ensemble API (ECMWF IFS 51 / GFS 31 members) | Ward critical-probability map |
| Historical rain | Open-Meteo Archive (ERA5) + gauge-reported event total | 4–5 Sep 2022 replay/validation |
| Basemap | OpenFreeMap vector tiles (no key) | MapLibre basemap |

**Domain:** bbox ≈ 12.87–13.00 N, 77.57–77.78 E (Koramangala–Challaghatta valley → Madiwala, Agara, Bellandur, Varthur cascade). 100 m cells ≈ 145 × 228 ≈ 33k cells. Wards kept if ≥50% of their area is inside.
Attribution (ODbL/CC) goes in the README and the UI footer.

---

## 3. Mathematical model (team-owned. The model lead must be able to derive it)

State per cell: z (bed, after burning), h (depth), C (runoff coeff), n (Manning), D (drain capacity), type ∈ {land, lake, channel}, ward, pop.

**Pre-processing (math worth showing):**
- Stream burning: channel cells z ← z − b (b ≈ 2–3 m, param).
- Lake bathymetry: lake cells z ← z_surface − S·(1 − f₀), where S = assumed storage depth and **f₀ = initial fill (brochure "initial water level")**, h₀ = 0. Lakes then fill and spill naturally, which gives the cascade.
- C and n = area-weighted from WorldCover fractions (built 0.9/0.015, bare 0.6/0.025, grass/crop 0.35/0.035, trees 0.2/0.10, water 1.0/0.02). Antecedent-wetness multiplier on (1−C) (initial state).
- Drain routing: each land cell → index of the nearest channel/lake cell (`scipy.ndimage.distance_transform_edt(return_indices=True)`).

**Per step (vectorised, flux form, so exactly conservative):**
1. Effective rain: h += C·R(t)·Δt. Upstream inflow Q_in(t)/A added at the inflow cell.
2. Drainage transfer: d = min(h, D·(1−f_fail)·Δt), with blocked drains D=0 for their catchment. Remove from land cells and `np.bincount`-add at the routed channel cell.
3. Local-inertial face fluxes (x and y faces):
   h_f = max(η_i, η_j) − max(z_i, z_j), where η = z + h
   q ← (q − g·h_f·Δt·(η_j−η_i)/Δx) / (1 + g·Δt·n²·|q| / h_f^{7/3}); q = 0 where h_f < 1 mm
   Positivity limiter: scale a cell's outgoing fluxes so the outflow volume is ≤ the available volume.
   h += Δt·(Σq_in − Σq_out)/Δx
4. Outlet: open boundary cells (lowest edge, Varthur side) remove the water that reaches them, recorded as V_out.
5. Adaptive Δt = 0.7·Δx/√(g·h_max), capped at 60 s. Fast-forward when dry with no rain.

**Mass balance:** ε = |V_now − V₀ − V_rain,eff − V_inflow + V_out| / V_rain,eff. The target is ~1e-12, shown live in the UI.

**Classification** (thresholds editable; defaults tied to US NWS "Turn Around Don't Drown": ~15 cm moving water knocks a person down, ~30 cm floats a car):
cell Safe < 0.15 m ≤ Warning < 0.30 m ≤ Critical. **Ward metric = p90 depth over land cells only.**
**ETA to critical** = first simulated time the ward metric ≥ 0.30 m. **Rising-fast flag** from dh/dt of the metric.
**Affected population** = Σ pop over Warning / Critical land cells over time. Report the peak.
**Ensemble probability:** P(ward critical) = (members with ETA ≠ null) / N. Run on a 200 m coarsened grid with multiprocessing.

---

## 4. Feature set

**Core (brochure, must ship):** rainfall config (presets Normal 10 / Heavy 50 / Cloudburst 100 mm/hr + sliders for peak, duration, profile), real grid + wards, flow + accumulation, drainage + terrain, water level over time, Safe/Warning/Critical per cell + ward, animated map + play/pause, critical-ward list, ETA per ward.

**Bonus (all):** normal/heavy presets, drainage-failure slider, block real drain segments, scenario compare (≤4 runs: critical-area-over-time overlay + table of peak depth, ETAs, affected pop), affected population, time slider.

**Differentiators:** 🔴 Live-forecast run (Open-Meteo), ensemble probability map, 2022 flood replay with hit/miss vs reported flooded localities, lake-cascade connectivity panel, initial-lake-fill + inflow controls, Model tab (KaTeX equations, parameter table, mass-balance chart, CFL Δt chart, limitations).

**AI (Gemini, live, labelled "AI-generated", errors shown, never canned):**
- A1 NL scenario builder: `response_schema` JSON → Pydantic validate/clamp → user confirms parsed params → run. Ward/drain names resolve against the real ward list.
- A2 Early-warning bulletin: authority advisory + public alert EN + ಕನ್ನಡ, built only from the result summary. Grounding check badge.
- Model name set via the `GEMINI_MODEL` env var (a current Flash model). The key is server-side only.

---

## 5. Stack & repo

Engine: Python 3.11 + NumPy (+ SciPy for the EDT only). API: FastAPI, Pydantic, Uvicorn, httpx, GZip. AI: `google-genai`. Data pipeline only: rasterio, shapely, pyproj, requests. Frontend: Vite React TS + Tailwind + MapLibre GL + Recharts + KaTeX. Deploy: HF Spaces Docker (backend serves `frontend/dist`).

```
flowshield/
├── FLOWSHIELD_PLAN.md  README.md  DATA_SOURCES.md  Dockerfile  .env.example
├── docs/model.md
├── backend/
│   ├── pipeline/build_city.py      # offline: DEM, WorldCover, OSM, wards → data/
│   ├── data/                       # committed: city.npz, wards.geojson, drains.geojson, meta.json
│   ├── engine/  terrain.py (load npz) rainfall.py simulate.py classify.py scenarios.py ensemble.py
│   ├── live/weather.py             # Open-Meteo forecast/ensemble/archive clients
│   ├── ai/  gemini.py scenario_parser.py bulletin.py grounding.py
│   ├── api/main.py
│   ├── tests/test_engine.py        # mass balance, positivity, flat-lake-at-rest, symmetry, blocked drain worse
│   ├── requirements.txt  requirements-pipeline.txt
└── frontend/src/  api.ts App.tsx components/{MapView, TimeSlider, ScenarioPanel, NLScenarioBox,
                    WardTable, AIBulletin, CompareView, ModelTab, LivePanel, EnsembleView, CascadePanel}
```

**API:** `GET /city` (grid meta, ward geojson, drains geojson, lakes) · `POST /simulate` → frames (b64 uint16), times, ward_series, status, eta, affected_pop, mass_balance, dt_series · `GET /live/forecast` · `POST /ensemble` (async job + `GET /ensemble/{id}`) · `POST /ai/scenario` · `POST /ai/bulletin`.

---

## 6. Timeline (IST, from now). Commit + push at the end of every phase

| Phase | Time | Work | Done when |
|---|---|---|---|
| 0 Setup | 20:30–21:15 | Repo (web UI, public), py3.11 venv, scaffold backend + Vite app, `.env.example`, README skeleton with disclosure, write FLOWSHIELD_PLAN.md + DATA_SOURCES.md | Both apps start; first push |
| 1 Data + engine | 21:15–00:30 | `build_city.py` → data/ (**time-box 2 h**; fallback: DEM + wards only, synthetic C). `simulate.py` local-inertial + tests + benchmark. FE: MapLibre + ward polygons | Tests pass; ε < 1e-9; 12 h heavy run < 10 s (else coarsen to 150 m); map shows real wards |
| 2 Core MVP | 00:30–04:00 | classify.py, `/simulate`, depth canvas overlay, ward fill by status, play/pause + slider, WardTable (status, ETA, pop), summary cards | All core requirements in the browser. **Tag v0.1-mvp** |
| 3 Bonus + live | 04:00–08:00 (staggered sleep) | Drain-failure slider, click-to-block drain, initial fill + inflow, CompareView, affected-pop chart, Live-forecast run, cascade panel | Blocked Bellandur-feeder run visibly worse in Compare |
| 4 AI + Model + deploy | 08:00–12:00 | A1, A2 + grounding, Model tab, ensemble probability, Dockerfile → HF Spaces | Typed scenario → run → EN+KN bulletin on the **live URL**. **Tag v0.2** |
| 5 Validate + harden | 13:00–15:30 | 2022 replay + hit table, bug bash (extreme sliders, API down, Gemini 429), docs/model.md, README | **15:30 feature freeze** |
| 6 Video + submit | 15:30–17:30 | Record 2:30 video, check repo is public, video works in incognito | **Submitted by 17:30** |

Roles (3–4): **Model lead** (pipeline + engine + tests + model.md, owns the math) · **Frontend lead** (map, slider, panels, charts) · **Backend/AI** (API, live weather, Gemini, deploy) · **Story/integration** (presets, compare, validation research, README, video). With 3 people, merge the last two.

## 7. Demo video (2:30, brochure order)
0:00 hook: Bengaluru's lake cascade, Sept 2022 · 0:15 **inputs**: real DEM, lakes, drains, wards, rainfall + initial lake fill · 0:40 **simulation + progression**: heavy run, wards turn red, ETAs, affected pop · 1:10 blocked drain + Compare · 1:30 **live forecast + ensemble probability** · 1:50 **early warning**: NL scenario → Gemini EN/ಕನ್ನಡ bulletin with verified badge · 2:10 Model tab: equations, ε≈1e-12, 2022 replay hits · 2:25 close.

## 8. Verification
- `pytest backend/tests`: mass balance ε<1e-9, h ≥ 0 always, lake-at-rest stays still (well-balanced), symmetric input → symmetric output, blocked drain → earlier/greater flooding upstream.
- CLI `python -m engine.simulate --preset heavy` prints ε, runtime, critical wards.
- Browser walkthrough of every core/bonus item; kill network → Gemini/live panels show errors, not fake output.
- Deployed URL tested in incognito; README links checked.

## 9. Files I'll create first after approval
`FLOWSHIELD_PLAN.md` (this plan, repo source of truth), `DATA_SOURCES.md` (URLs, licences, checks done), the Phase 0 scaffold, then `backend/pipeline/build_city.py`. I'll keep all of them updated as data arrives, and save a project memory note.
