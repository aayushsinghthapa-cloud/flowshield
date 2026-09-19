"""Rainfall hyetographs R(t) in mm/hr, t in hours from simulation start."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

PROFILES = ("constant", "triangular", "cloudburst", "series")


@dataclass
class Rain:
    profile: str = "triangular"
    peak_mm_hr: float = 50.0
    duration_hr: float = 3.0
    peak_at_hr: float = 1.5          # triangular: time of peak
    start_hr: float = 0.0
    series_mm_hr: list[float] = field(default_factory=list)  # "series": one value per step
    series_step_hr: float = 1.0
    scale: float = 1.0               # multiplier (e.g. convective peak factor for forecasts)

    def intensity(self, t_hr: float) -> float:
        """Rain intensity at time t (mm/hr)."""
        s = t_hr - self.start_hr
        if self.profile == "series":
            i = int(s // self.series_step_hr)
            if s < 0 or i >= len(self.series_mm_hr):
                return 0.0
            return max(0.0, self.series_mm_hr[i]) * self.scale
        if s < 0 or s >= self.duration_hr:
            return 0.0
        if self.profile == "constant":
            r = self.peak_mm_hr
        elif self.profile == "triangular":
            tp = min(max(self.peak_at_hr, 1e-6), self.duration_hr - 1e-6)
            r = self.peak_mm_hr * (s / tp if s <= tp else (self.duration_hr - s) / (self.duration_hr - tp))
        elif self.profile == "cloudburst":
            # 20% of the duration at peak intensity in the middle, 25% of peak elsewhere.
            mid0, mid1 = 0.4 * self.duration_hr, 0.6 * self.duration_hr
            r = self.peak_mm_hr if mid0 <= s < mid1 else 0.25 * self.peak_mm_hr
        else:
            raise ValueError(f"unknown profile {self.profile}")
        return r * self.scale

    def end_hr(self) -> float:
        if self.profile == "series":
            return self.start_hr + len(self.series_mm_hr) * self.series_step_hr
        return self.start_hr + self.duration_hr

    def total_mm(self, dt_hr: float = 1 / 60) -> float:
        t = np.arange(0, self.end_hr(), dt_hr)
        return float(sum(self.intensity(x + dt_hr / 2) for x in t) * dt_hr)
