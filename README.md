# FlowShield: Bengaluru

> **Predict the flood. Protect the future.**
> FlowShield is a flood simulation and early-warning dashboard for Bengaluru's Koramangala–Challaghatta lake cascade. It runs a mass-conserving shallow-water model on **real terrain, land-cover, lake, drain and ward data**, and on the **live rainfall forecast**. It reports which wards go critical, when, and how many people are affected, and turns that into an AI-written bulletin in English and ಕನ್ನಡ.

Hack-a-Matics 2026 · Theme **VECTOR** · Problem **FLOWSHIELD**

**Live demo:** _TBD_ · **Demo video:** _TBD_

---

## Why Bengaluru

Bengaluru's lakes (*keres*) were built as a **cascade**: each tank overflows into the next through storm-water drains (*rajakaluves*). When drains are silted or encroached and tanks are already full, water backs up into neighbourhoods. The Koramangala–Challaghatta valley (Madiwala → Agara → Bellandur → Varthur) flooded badly in September 2022.

FlowShield makes this cascade visible and lets you test "what if this drain is blocked?" or "what if the lakes are already full?" before the rain arrives.

## Features

### Core (all brochure requirements)
| Requirement | Where |
|---|---|
| Configure rainfall intensity | Presets (Normal 10 / Heavy 50 / Cloudburst 100 mm/hr), sliders for peak, duration, peak time and storm shape, or the live forecast |
| City as connected grid/regions | 147 × 231 grid of 100 m cells; 72 real BBMP wards |
| Water accumulation and movement | 2-D local-inertial shallow-water model, 4-neighbour fluxes |
| Drainage capacity and terrain | Real DEM, 1,031 OSM drains, drain intake capacity, failure slider |
| Water level over time | Animated map, 5-minute resolution |
| Safe / Warning / Critical | Per cell (15 / 30 cm) and per ward (p95 of land depth) |
| Time-based visualisation | Play/pause and time slider over the map |
| Regions reaching critical | Ward table and map colouring |
| Time to critical | ETA per ward, interpolated; rising-fast flag |

### Bonus (all brochure extras)
- Normal and heavy rainfall presets.
- Drainage failure (global %).
- **Blocked drain:** click real OSM drain segments on the map.
- Scenario comparison: up to 4 runs, with critical area and people over time, plus per-ward ETA table.
- Estimated affected population (Census 2011, dasymetric).
- Interactive time slider.

### Beyond the brief
- **Live forecast:** simulate the next 24 h of Open-Meteo rain, with soil wetness set from the past 24 h.
- **Ensemble early warning:** 31 GFS members give a probability that each ward goes critical.
- **Lake cascade panel:** tank levels over time, showing when each tank spills.
- **Initial water level and inflow:** initial lake fill, antecedent wetness, upstream inflow into Madiwala.
- **Model tab:** equations, a live volume budget, the mass-balance error, the adaptive time step, and limitations.

## AI component

FlowShield uses **Google Gemini** (via the official `google-genai` Python SDK), **called live from the backend** for every request. The default model is `gemini-3.6-flash`. If it is overloaded, the backend retries and then falls back to `gemini-3.5-flash` and then `gemini-flash-latest`. The UI badge always shows which model answered.

| | What it does | What the model sees | Safeguards |
|---|---|---|---|
| **A1 · Natural-language scenario builder** | Turns text like "130 mm in 3 h, lakes full, drain near Ejipura blocked" into simulator parameters | The user's text plus the list of real ward and lake names | Structured JSON schema; every value clamped to model ranges; place names resolved to real OSM drain ids; **the user confirms before anything runs** |
| **A2 · Early-warning bulletin** | Writes a severity level, an authority advisory and an SMS-style public alert in **English and Kannada** | Only a compact JSON of this run's results (critical wards, ETAs, people, lake levels, optional ensemble probabilities) | Prompt forbids new numbers; a **grounding check** verifies every number in the output against that JSON and shows ✓/⚠ |

**No AI output is hardcoded, cached or faked.** If Gemini is unavailable, the UI shows the error and generates nothing. The API key stays server-side in `.env`.

## Mathematical model

The model is a local-inertial shallow-water scheme (Bates et al., 2010) on a conditioned real DEM, with:
- rational-method effective rain
- storm-drain transfer into the drain network
- ponded infiltration
- lake bathymetry with weirs
- an adaptive CFL time step

The mass-balance error is **≤ 3 × 10⁻¹³** on the real grid, and 11 automated tests verify conservation, positivity, lake-at-rest, symmetry and monotonic response. Full derivation: **[docs/model.md](docs/model.md)**.

## Data (all free and public)

Copernicus GLO-30 DEM · ESA WorldCover 2021 · OpenStreetMap (lakes, drains) · BBMP ward boundaries and Census 2011 population (datameet) · Open-Meteo forecast, ensemble and archive · Esri World Dark Gray basemap. Details, licences and caveats: **[DATA_SOURCES.md](DATA_SOURCES.md)**.

## Architecture

```
 Offline (once)                          Runtime
 ─────────────                           ───────
 Copernicus DEM ─┐                       React + MapLibre + Recharts + KaTeX
 ESA WorldCover ─┤  pipeline/            │  /api/city  /api/simulate  /api/ensemble
 OSM (Overpass) ─┼─ build_city.py ─► data/ (npz + geojson, committed)
 BBMP wards ─────┘                       ▼
                                         FastAPI ── engine/ (pure NumPy: terrain, simulate,
                                            │                 classify, ensemble)
                                            ├── live/weather.py ── Open-Meteo (live)
                                            └── ai/ ── Gemini (live): scenario parser, bulletin, grounding
```

## Run locally

```bash
# Backend (Python 3.11)
python3.11 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cp .env.example .env        # add GEMINI_API_KEY (free at aistudio.google.com)
cd backend && ../.venv/bin/uvicorn api.main:app --port 8000

# Frontend (dev)
cd frontend && npm install && npm run dev      # http://localhost:5173

# Tests
cd backend && ../.venv/bin/python -m pytest -q

# Rebuild the city data from source (optional; needs requirements-pipeline.txt)
cd backend && ../.venv/bin/python -m pipeline.build_city
```

**Deploy (free Hugging Face Space, Gradio SDK, CPU basic):**
```bash
.venv/bin/pip install huggingface_hub
HF_TOKEN=<write-token> .venv/bin/python deploy/push_hf.py <hf-username>/flowshield --set-secret
```
[deploy/hf_app.py](deploy/hf_app.py) becomes the Space's `app.py`. It runs the same FastAPI app, which serves the API and the pre-built dashboard on port 7860. A [Dockerfile](Dockerfile) is also provided for Docker hosts.

## Boilerplate and libraries used

- Frontend scaffold: `npm create vite@latest` (react-ts template).
- **Python:** NumPy, SciPy, FastAPI, Pydantic, Uvicorn, httpx, google-genai, python-dotenv, pytest. **Pipeline only:** rasterio, shapely, pyproj, requests.
- **JavaScript:** React, Vite, Tailwind CSS, MapLibre GL JS (v5), Recharts, KaTeX.
- AI coding assistant (Claude Code) was used for parts of the code, per the event rules. The model design, integration and problem-solving are the team's own.

All project code was written during the hackathon window.

## Assumptions and limitations

- The terrain is a 30 m surface model averaged to 100 m, so street-scale dips such as underpasses are not resolved.
- Storm-drain capacity is not public data. It is a single tunable value (default 20 mm/hr).
- Population is from Census 2011 and undercounts today's city.
- Forecast and reanalysis rain underestimate cloudbursts. A peak factor is provided for stress tests.
- The model is not calibrated against observed depths. It is a decision-support prototype, not an official forecast.

## Team
**Team Kalos.** Hack-a-Matics 2026.
