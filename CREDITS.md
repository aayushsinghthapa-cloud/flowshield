# Credits and open-source acknowledgements

FlowShield is built entirely on free and open-source software and on free, publicly
licensed data. Every library we depend on is listed below with its version and licence.
Versions are the ones this project was built and tested against; exact transitive
dependency trees are pinned in `frontend/package-lock.json` and resolved from
`requirements.txt`.

**We are grateful to every maintainer listed here.** None of this project would exist
without their work.

---

## Python — runtime (server and simulation engine)

| Library | Version | Licence | What we use it for |
|---|---|---|---|
| [NumPy](https://numpy.org/) | 2.4.6 | BSD-3-Clause | The entire shallow-water solver: arrays, vectorised flux and friction terms |
| [SciPy](https://scipy.org/) | 1.17.1 | BSD-3-Clause | `ndimage` — Euclidean distance transform for drain routing, grey dilation for lake weirs, binary dilation for lake rims |
| [FastAPI](https://fastapi.tiangolo.com/) | 0.141.1 | MIT | The HTTP API (`/api/simulate`, `/api/city`, `/api/ai/*`, …) |
| [Starlette](https://www.starlette.io/) | 1.6.0 | BSD-3-Clause | ASGI foundation under FastAPI; static file serving and GZip |
| [Pydantic](https://docs.pydantic.dev/) | 2.13.5 | MIT | Request/response validation, and the JSON schemas the LLMs must fill |
| [Uvicorn](https://www.uvicorn.org/) | 0.53.0 | BSD-3-Clause | ASGI server for local development and Docker |
| [httpx](https://www.python-httpx.org/) | 0.28.1 | BSD-3-Clause | Calling the Open-Meteo forecast, ensemble and archive APIs |
| [anthropic](https://github.com/anthropics/anthropic-sdk-python) | 1.7.0 | MIT | Claude client for the scenario parser and bulletin (structured outputs) |
| [google-genai](https://github.com/googleapis/python-genai) | 2.24.0 | Apache-2.0 | Gemini client for the same two features |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | 1.2.3 | BSD-3-Clause | Loading API keys from `.env` in local development |

## Python — offline data pipeline only

These are **not** installed on the server. They run once in `backend/pipeline/build_city.py`
to turn raw public data into the compact committed files in `backend/data/`.

| Library | Version | Licence | What we use it for |
|---|---|---|---|
| [rasterio](https://rasterio.readthedocs.io/) | 1.4.4 | BSD-3-Clause | Reading the Copernicus DEM and ESA WorldCover cloud-optimised GeoTIFFs, and reprojecting them to the 100 m UTM grid |
| [Shapely](https://shapely.readthedocs.io/) | 2.1.2 | BSD-3-Clause | Ward polygon geometry; rasterising wards; point-in-polygon in the validation script |
| [pyproj](https://pyproj4.github.io/pyproj/) | 3.7.2 | MIT | WGS84 ↔ UTM 43N (EPSG:32643) coordinate transforms |
| [Requests](https://requests.readthedocs.io/) | 2.34.2 | Apache-2.0 | Downloading OSM (Overpass) and ward boundary data |
| [pytest](https://pytest.org/) | 9.1.1 | MIT | The 12 automated physics tests |

`rasterio`, `Shapely` and `pyproj` are Python bindings to **GDAL**, **GEOS** and **PROJ**
respectively — all OSGeo projects, under MIT/LGPL-style licences. We acknowledge them too.

## JavaScript — dashboard runtime

| Library | Version | Licence | What we use it for |
|---|---|---|---|
| [React](https://react.dev/) | 19.3.0 | MIT | The whole dashboard UI |
| [React DOM](https://react.dev/) | 19.3.0 | MIT | Rendering, and `createPortal` for the help dialog |
| [MapLibre GL JS](https://maplibre.org/) | 5.24.0 | BSD-3-Clause | The map: ward polygons, lakes, drains, and the animated depth canvas layer |
| [Recharts](https://recharts.org/) | 3.10.1 | MIT | Every chart — people over time, ward depth curves, the water budget, compare overlays |
| [KaTeX](https://katex.org/) | 0.18.7 | MIT | Rendering the shallow-water equations on the Model tab |
| [Tailwind CSS](https://tailwindcss.com/) | 4.3.3 | MIT | The design system and all styling |

## JavaScript — build tooling

| Tool | Version | Licence | What we use it for |
|---|---|---|---|
| [Vite](https://vite.dev/) | 8.3.0 | MIT | Dev server and production bundler |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.1.1 | MIT | React fast refresh and JSX transform |
| [@tailwindcss/vite](https://tailwindcss.com/) | 4.3.3 | MIT | Tailwind v4 integration with Vite |
| [TypeScript](https://www.typescriptlang.org/) | 6.0.3 | Apache-2.0 | Static typing across the frontend |
| [oxlint](https://oxc.rs/) | 1.83.0 | MIT | Linting |
| `@types/*` (react, react-dom, node, katex, geojson) | — | MIT (DefinitelyTyped) | Type definitions |

## Free services and APIs

| Service | Terms | What we use it for |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | CC BY 4.0, free, no key | Live rainfall forecast, the 31-member GFS ensemble, and ERA5 archive |
| [OpenStreetMap Overpass API](https://overpass-api.de/) | ODbL | Downloading lakes and storm drains (pipeline, once) |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) | ODbL, usage policy respected (≤1 req/s, identifying User-Agent) | Geocoding reported flood localities in the validation script |
| [Esri World Light Gray Basemap](https://www.arcgis.com/home/item.html?id=291da5eab3a0412593b66d384379f89f) | Esri terms; attributed on the map | Map background tiles |
| [OpenFreeMap](https://openfreemap.org/) | Free, OSM data (ODbL) | Map label glyphs (fonts) for MapLibre |
| [Google Gemini API](https://ai.google.dev/) | Free tier | The AI scenario parser and early-warning bulletin |
| [Anthropic Claude API](https://www.anthropic.com/api) | Paid API | Fallback provider for the same two features |
| [Vercel](https://vercel.com/) | Hobby (free) | Hosting the dashboard and the FastAPI function |

## Data

Full table with URLs, licences and caveats: **[DATA_SOURCES.md](DATA_SOURCES.md)**.

- **Copernicus GLO-30 DEM** — © European Space Agency, free licence with attribution.
- **ESA WorldCover 2021 v200** — © ESA WorldCover project, CC BY 4.0.
- **OpenStreetMap** — © OpenStreetMap contributors, ODbL.
- **BBMP ward boundaries and Census 2011 population** — [datameet/Municipal_Spatial_Data](https://github.com/datameet/Municipal_Spatial_Data), CC BY-SA 2.5 IN.
- **Open-Meteo** weather data — CC BY 4.0.

## Scientific references

The model is an implementation of published methods, not an invention of ours:

- **Bates, P. D., Horritt, M. S., & Fewtrell, T. J. (2010).** *A simple inertial formulation
  of the shallow water equations for efficient two-dimensional flood inundation modelling.*
  Journal of Hydrology, 387(1–2), 33–45. — the local-inertial scheme at the core of the solver.
- **Barnes, R., Lehman, C., & Mulla, D. (2014).** *Priority-flood: An optimal depression-filling
  and watershed-labeling algorithm for digital elevation models.* Computers & Geosciences, 62,
  117–127. — the DEM conditioning step.
- **US National Weather Service, "Turn Around Don't Drown"** — the 15 cm / 30 cm depth
  thresholds used for the Warning and Critical classes.
- Manning's equation for open-channel friction; the rational method for runoff coefficients.

## Development tooling disclosure

Per the event rules on transparency: **Claude Code** (an AI coding assistant) was used
while writing parts of the implementation during the hackathon window. The problem
framing, model design, data choices, validation methodology and integration decisions are
the team's own. No project code existed before the hackathon began, and no AI output in
the running application is pre-written, cached or hardcoded — every AI response is a live
API call, and failures are surfaced as errors rather than replaced with canned text.

---

## Licence of this project

FlowShield's own source code is released under the **MIT Licence** — see [LICENSE](LICENSE).
Note that the **data** it consumes carries its own licences (ODbL, CC BY, CC BY-SA), which
are not superseded by ours and which require attribution wherever the data is reused.
