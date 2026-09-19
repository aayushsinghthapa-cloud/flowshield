# FlowShield: Bengaluru

> Predict the flood. Protect the future. A mass-conserving flood simulator and early-warning dashboard for Bengaluru's Koramangala–Challaghatta lake cascade, built on real terrain, land-cover, drain and ward data.

Hack-a-Matics 2026 · Theme VECTOR · Problem: FLOWSHIELD

**Live demo:** _TBD_ · **Demo video:** _TBD_

## Problem & why Bengaluru
_TBD_

## Features
### Core
_TBD_
### Bonus
_TBD_

## AI component
FlowShield uses **Google Gemini** (via the official `google-genai` SDK, called live from the backend) for:
- **A1: Natural-language scenario builder.** Plain-English text → validated simulation parameters, which the user confirms before the run.
- **A2: Early-warning bulletin.** Simulation results → an authority advisory and a public alert in English and Kannada. Every number in the output is checked against the simulation data.

If the API fails, the UI shows an error. No AI output is canned or hardcoded.

## Mathematical model
See [docs/model.md](docs/model.md).

## Data
See [DATA_SOURCES.md](DATA_SOURCES.md).

## Architecture
_TBD_

## Run locally
```bash
# backend (Python 3.11)
python3.11 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
cp .env.example .env   # add GEMINI_API_KEY
cd backend && ../.venv/bin/uvicorn api.main:app --reload --port 8000

# frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## Boilerplate & libraries used
- Frontend scaffold: `npm create vite@latest` (react-ts template).
- Python: NumPy, SciPy, FastAPI, Pydantic, Uvicorn, httpx, google-genai, python-dotenv, pytest. Data pipeline: rasterio, shapely, pyproj, requests.
- JS: React, Vite, Tailwind CSS, MapLibre GL, Recharts, KaTeX.

All project code was written during the hackathon window.

## Assumptions & limitations
_TBD_

## Team & roles
_TBD_
