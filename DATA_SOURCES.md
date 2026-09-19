# Data Sources

All data used by FlowShield is free and public. The offline pipeline (`backend/pipeline/build_city.py`) downloads the raw layers once and writes compact processed files to `backend/data/`, which are committed. Live weather is fetched at runtime.

Reachability of every source below was checked on 19 Sep 2026, 20:20 IST.

| Layer | Source | URL | Licence | Used for |
|---|---|---|---|---|
| Elevation | Copernicus GLO-30 DEM (COG, AWS Open Data) | `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N12_00_E077_00_DEM/Copernicus_DSM_COG_10_N12_00_E077_00_DEM.tif` | Copernicus DEM licence (free, attribution) | Ground elevation z |
| Land cover | ESA WorldCover 2021 v200, 10 m | `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N12E075_Map.tif` | CC BY 4.0 | Runoff coefficient C, Manning n, population weights |
| Lakes & drains | OpenStreetMap via Overpass API | `https://overpass-api.de/api/interpreter` | ODbL | Lake mask, channel burning, blockable drain segments |
| Wards + population | datameet Municipal_Spatial_Data, `Bangalore/BBMP_oldWards.geojson` (198 wards, Census 2011 `POP_TOTAL`) | `https://github.com/datameet/Municipal_Spatial_Data` | CC BY-SA 2.5 IN | Ward polygons, ward population |
| Live rainfall | Open-Meteo Forecast API | `https://api.open-meteo.com/v1/forecast` | CC BY 4.0 | Live-forecast scenario |
| Ensemble rainfall | Open-Meteo Ensemble API | `https://ensemble-api.open-meteo.com/v1/ensemble` | CC BY 4.0 | Ward critical-probability |
| Historical rainfall | Open-Meteo Archive (ERA5) | `https://archive-api.open-meteo.com/v1/archive` | CC BY 4.0 | Event replay context |
| Basemap | OpenFreeMap | `https://tiles.openfreemap.org/styles/liberty` | OSM/ODbL | Map background |

## Known caveats

- **The DEM is a surface model.** Copernicus GLO-30 includes buildings and trees, and 30 m pixels are averaged to 100 m cells. Local street-level depressions (underpasses) are not resolved.
- **Population is from Census 2011**, disaggregated to cells using built-up fraction (dasymetric mapping). The real 2026 population is higher, so the UI labels this as Census 2011.
- **Reanalysis underestimates cloudbursts.** ERA5 gives 18.5 mm on 4 Sep 2022 at Bellandur (12.93 N, 77.65 E), far below the gauge-reported event. The 2022 replay therefore uses a gauge-reported total, labelled as such.
- **Forecast rain is coarse.** It comes from ~9–25 km model grids, which smooths convective peaks.
- **No public drain-capacity data exists.** Drainage capacity is an assumed, tunable parameter.
- **OSM drain mapping is incomplete.** Mapped rajakaluves are used as-is.
