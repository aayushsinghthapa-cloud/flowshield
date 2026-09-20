# FlowShield: Bengaluru

> **Predict the flood. Protect the future.**
> FlowShield is a flood simulation and early-warning dashboard for Bengaluru's Koramangala–Challaghatta lake cascade. It runs a mass-conserving shallow-water model on **real terrain, land-cover, lake, drain and ward data**, and on the **live rainfall forecast**. It reports which wards go critical, when, and how many people are affected, and turns that into an AI-written bulletin in English and ಕನ್ನಡ.

Hack-a-Matics 2026 · Theme **VECTOR** · Problem **FLOWSHIELD**

**Live demo:** https://flowshield-iota.vercel.app · **Demo video:** _TBD_

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

### Extras that make it usable
- **Plain-English scenarios** (live LLM) with a confirm step.
- **Live forecast run** on Open-Meteo rain, with soil wetness set from the past 24 h.
- **Chance of flooding**: 31 GFS ensemble members simulated individually → per-ward probability.
- **Sept 2022-style preset**: a reconstructed extreme event (labelled as reconstructed, not a hindcast).
- **Fast preview / detailed** grid switch (200 m ≈ 8× faster; 100 m for final numbers).
- **Share a link** that reproduces the exact scenario, and **download the ward table as CSV**.
- **Ward search, hover tooltips, keyboard playback** (space, arrow keys), and a first-visit guide.
- **Works on a phone**: the map, verdict and ward list reflow; controls move into a sheet.

### Beyond the brief
- **Live forecast:** simulate the next 24 h of Open-Meteo rain, with soil wetness set from the past 24 h.
- **Ensemble early warning:** 31 GFS members give a probability that each ward goes critical.
- **Lake cascade panel:** tank levels over time, showing when each tank spills.
- **Initial water level and inflow:** initial lake fill, antecedent wetness, upstream inflow into Madiwala.
- **Model tab:** equations, a live volume budget, the mass-balance error, the adaptive time step, and limitations.

## AI component

FlowShield calls a large language model **live from the backend on every request**, through **two independent providers** so that one outage or one exhausted quota cannot take the feature down:

1. **Google Gemini** (`gemini-3.5-flash`, official `google-genai` SDK) answers in about 5 s, so it drives the demo. Its free tier allows only 20 requests per day *per model*, so it is chained across seven Flash models.
2. **Anthropic Claude** (`claude-sonnet-5`, official `anthropic` SDK, native JSON-schema structured output via `messages.parse`) is the backstop: slower (~20 s, since a Kannada alert is a lot of tokens) and paid, but it has no daily cap and writes the best Kannada. It takes over automatically when Gemini's quota runs out.

Set `AI_PROVIDER_ORDER="anthropic,google"` to lead with Claude instead.

The UI badge always names the model that actually answered, and marks it with `↳` when it was a fallback — so what is on screen is always attributable to a real call. Either key alone is enough to run the project; see `.env.example`.

| | What it does | What the model sees | Safeguards |
|---|---|---|---|
| **A1 · Natural-language scenario builder** | Turns text like "130 mm in 3 h, lakes full, drain near Ejipura blocked" into simulator parameters | The user's text plus the list of real ward and lake names | Structured JSON schema; every value clamped to model ranges; place names resolved to real OSM drain ids; **the user confirms before anything runs** |
| **A2 · Early-warning bulletin** | Writes a severity level, an authority advisory and an SMS-style public alert in **English and Kannada** | Only a compact JSON of this run's results (critical wards, ETAs, people, lake levels, optional ensemble probabilities) | Prompt forbids new numbers; a **grounding check** verifies every number in the output against that JSON and shows ✓/⚠ |

**No AI output is hardcoded, cached or faked.** If every provider is unavailable, the UI shows the error and generates nothing. API keys stay server-side in `.env`; nothing is ever sent to the browser.

## Understand it in 5 minutes

New to the project? Read **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)** — the model and every part of the
interface explained without jargon. The video plan is in [docs/demo-script.md](docs/demo-script.md).

## Mathematical model

The model is a local-inertial shallow-water scheme (Bates et al., 2010) on a conditioned real DEM, with:
- rational-method effective rain
- storm-drain transfer into the drain network
- ponded infiltration
- lake bathymetry with weirs
- an adaptive CFL time step

The mass-balance error is **≤ 3 × 10⁻¹³** on the real grid, and 12 automated tests verify conservation, positivity, lake-at-rest, symmetry and monotonic response. Full derivation: **[docs/model.md](docs/model.md)**.

## Does it match reality?

Scored against the **4–5 September 2022 Bengaluru flood**: given the reported 131.6 mm and the antecedent state of that night, the model puts **9 of the 10 reported flood locations** past 30 cm (POD **0.90**), and flags the tenth as Warning. It also over-predicts how far the flooding spreads, and **[docs/validation.md](docs/validation.md)** says so plainly, with the method, the sources, the sensitivity table and what the result does not establish. Reproduce it with `cd backend && ../.venv/bin/python -m validation.sept2022`.

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
                                            └── ai/ ── llm.py ── Gemini, then Claude (live): scenario, bulletin, grounding
```

## Installation

### Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Python | **3.11 or 3.12** | The engine uses 3.11+ syntax. Avoid 3.14 — the geospatial wheels used by the optional pipeline are not published for it yet. |
| Node.js | **20+** | Vite 8 requires it. |
| An LLM API key | either one | `GEMINI_API_KEY` (free, [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) and/or `ANTHROPIC_API_KEY` ([platform.claude.com](https://platform.claude.com)). Either alone is enough; with both, Gemini is used first and Claude is the fallback. |

No database, no Docker and no paid service is required. The processed city data is
committed to the repo, so you do **not** need to run the data pipeline to start.

### 1. Clone and set up the backend

```bash
git clone https://github.com/aayushsinghthapa-cloud/flowshield.git
cd flowshield

python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt

cp .env.example .env        # then edit .env and paste in your key(s)
```

### 2. Run the API

```bash
cd backend && ../.venv/bin/python -m uvicorn server.main:app --port 8000
```

Check it: `curl localhost:8000/api/health` → `{"status":"ok"}`
and `curl localhost:8000/api/ai/status` to confirm your key was picked up.

### 3. Run the dashboard

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 — proxies /api to :8000
```

For a production build that the API serves itself on `http://localhost:8000`:

```bash
cd frontend && npm run build
```

### 4. Verify the install

```bash
cd backend && ../.venv/bin/python -m pytest -q        # 12 physics tests
cd frontend && npx tsc -b                             # type check
```

### Optional: rebuild the city data from source

Only needed if you want to change the bounding box or grid resolution. This downloads
the DEM, land cover, OSM drains and ward boundaries and rewrites `backend/data/`
(takes several minutes and needs the heavier geospatial wheels):

```bash
.venv/bin/pip install -r backend/requirements-pipeline.txt
cd backend && ../.venv/bin/python -m pipeline.build_city
```

### Optional: reproduce the validation

Needs Shapely (for point-in-polygon) and network access (for Nominatim geocoding, cached
after the first run):

```bash
.venv/bin/pip install "shapely>=2.0"
cd backend && ../.venv/bin/python -m validation.sept2022          # scored run
cd backend && ../.venv/bin/python -m validation.sept2022 --sweep  # sensitivity
```

See **[docs/validation.md](docs/validation.md)** for the method, sources and results.

## Technologies implemented

| Layer | Technology |
|---|---|
| **Numerical model** | Local-inertial shallow-water equations (Bates et al. 2010) in vectorised NumPy; adaptive CFL time step; priority-flood DEM conditioning (Barnes et al. 2014); dasymetric population mapping |
| **Backend** | Python 3.11, FastAPI, Pydantic, Uvicorn, httpx, zlib frame compression |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, MapLibre GL JS 5, Recharts 3, KaTeX |
| **AI** | Google Gemini (`google-genai`) with Anthropic Claude (`anthropic`) as a second provider; JSON-schema structured output; a regex grounding check on every number |
| **Geospatial (offline)** | rasterio/GDAL, Shapely/GEOS, pyproj/PROJ; Copernicus GLO-30 DEM, ESA WorldCover, OpenStreetMap, BBMP wards |
| **Live data** | Open-Meteo forecast, 31-member GFS ensemble and ERA5 archive |
| **Deployment** | Vercel Hobby (static dashboard + one Python serverless function); Dockerfile included for any container host |
| **Testing** | pytest (12 physics tests), `tsc` type checking, headless-Chrome UI walkthrough |

## Deploy (free: Vercel Hobby)

[vercel.json](vercel.json) builds the dashboard as static files and deploys the FastAPI app as one Python function ([api/index.py](api/index.py)) serving `/api/*`.
1. On vercel.com, choose **Add New → Project** and import this GitHub repo. Keep the defaults, since `vercel.json` sets everything.
2. Under **Environment Variables**, add `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY`.
3. Click **Deploy**.

The ensemble is split by the browser into 8 parallel function calls. A [Dockerfile](Dockerfile) is also included for any Docker host (`uvicorn server.main:app`).

## Open-source credits

FlowShield stands entirely on free and open-source software and openly licensed data.
**Every library, service, dataset and paper we rely on is credited, with versions and
licences, in [CREDITS.md](CREDITS.md).**

In brief — **Python:** NumPy, SciPy, FastAPI, Starlette, Pydantic, Uvicorn, httpx,
google-genai, anthropic, python-dotenv, pytest; **pipeline only:** rasterio (GDAL),
Shapely (GEOS), pyproj (PROJ), Requests. **JavaScript:** React, React DOM, MapLibre GL JS,
Recharts, KaTeX, Tailwind CSS, Vite, TypeScript, oxlint. **Data:** Copernicus GLO-30 DEM,
ESA WorldCover 2021, OpenStreetMap (ODbL), BBMP wards + Census 2011 via datameet,
Open-Meteo. **Basemap:** Esri World Light Gray, with OpenFreeMap glyphs.

FlowShield's own code is MIT licensed ([LICENSE](LICENSE)); the data keeps its own
licences, which require attribution.

**Boilerplate:** the frontend was scaffolded with `npm create vite@latest` (react-ts
template). Everything else was written during the hackathon window.

**AI tooling disclosure:** Claude Code was used while writing parts of the implementation.
The problem framing, model design, data choices, validation methodology and integration
decisions are the team's own. No AI output inside the running application is pre-written,
cached or hardcoded — every response is a live API call, and failures are shown as errors.

## Assumptions and limitations

- The terrain is a 30 m surface model averaged to 100 m, so street-scale dips such as underpasses are not resolved.
- Storm-drain capacity is not public data. It is a single tunable value (default 20 mm/hr).
- Population is from Census 2011 and undercounts today's city.
- Forecast and reanalysis rain underestimate cloudbursts. A peak factor is provided for stress tests.
- The model is not calibrated against observed depths. It is a decision-support prototype, not an official forecast.

## Team

**Team Kalos** — Hack-a-Matics 2026 (Pentagram, BMSCE × IEEE Computer Society).
Theme **VECTOR** · Problem statement **FLOWSHIELD**.

| Member |
|---|
| Aayush Singh Thapa |
| Nishant Saud |
| Rajat Bellbase |
| Shubham Kunwar Tiwary |
