"""Rainfall presets. Intensities are the same order as IMD categories for hourly rain."""
from .rainfall import Rain

PRESETS: dict[str, Rain] = {
    "normal": Rain(profile="constant", peak_mm_hr=10.0, duration_hr=3.0),
    "heavy": Rain(profile="triangular", peak_mm_hr=50.0, duration_hr=3.0, peak_at_hr=1.5),
    "cloudburst": Rain(profile="cloudburst", peak_mm_hr=100.0, duration_hr=2.0),
}
