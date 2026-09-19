"""Open-Meteo clients (free, no key): deterministic forecast, ensemble forecast, archive."""
from __future__ import annotations

from datetime import datetime

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
TZ = "Asia/Kolkata"
TIMEOUT = 20.0


class WeatherError(RuntimeError):
    pass


def _get(url: str, params: dict) -> dict:
    try:
        r = httpx.get(url, params=params, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        raise WeatherError(f"Open-Meteo request failed: {e}") from e


def forecast(lat: float, lon: float, hours: int = 48, past_hours: int = 24) -> dict:
    """Hourly precipitation for the past `past_hours` and next `hours` (mm per hour)."""
    d = _get(FORECAST_URL, {
        "latitude": lat, "longitude": lon, "hourly": "precipitation,precipitation_probability",
        "past_hours": past_hours, "forecast_hours": hours, "timezone": TZ,
    })
    times = d["hourly"]["time"]
    precip = [v or 0.0 for v in d["hourly"]["precipitation"]]
    prob = [v if v is not None else None for v in d["hourly"].get("precipitation_probability", [])]
    now = datetime.now().strftime("%Y-%m-%dT%H:00")
    i_now = next((i for i, t in enumerate(times) if t >= now), past_hours)
    past = precip[:i_now]
    return {
        "source": "Open-Meteo forecast (best-match model)",
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
        "lat": d["latitude"], "lon": d["longitude"],
        "times": times[i_now:], "mm_hr": precip[i_now:], "probability": prob[i_now:],
        "past_times": times[:i_now], "past_mm_hr": past,
        "past_24h_mm": round(sum(past[-24:]), 1),
        "next_total_mm": round(sum(precip[i_now:]), 1),
    }


def ensemble(lat: float, lon: float, model: str = "gfs025", hours: int = 24) -> dict:
    """Hourly precipitation for every ensemble member."""
    d = _get(ENSEMBLE_URL, {
        "latitude": lat, "longitude": lon, "hourly": "precipitation", "models": model,
        "forecast_hours": hours, "timezone": TZ,
    })
    h = d["hourly"]
    members = {k: [v or 0.0 for v in vals] for k, vals in h.items() if k.startswith("precipitation")}
    if not members:
        raise WeatherError("ensemble response had no precipitation members")
    return {"source": f"Open-Meteo ensemble ({model})", "times": h["time"],
            "members": list(members.values()), "fetched_at": datetime.now().isoformat(timespec="seconds")}


def archive(lat: float, lon: float, start: str, end: str) -> dict:
    """ERA5 reanalysis hourly precipitation (coarse: underestimates convective storms)."""
    d = _get(ARCHIVE_URL, {"latitude": lat, "longitude": lon, "start_date": start, "end_date": end,
                           "hourly": "precipitation", "timezone": TZ})
    return {"source": "Open-Meteo archive (ERA5)", "times": d["hourly"]["time"],
            "mm_hr": [v or 0.0 for v in d["hourly"]["precipitation"]]}
