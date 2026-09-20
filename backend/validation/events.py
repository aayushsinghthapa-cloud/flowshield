"""Observed Bengaluru flood events, from reported rainfall and reported flooding.

Every number here comes from contemporaneous IMD/KSNDMC figures quoted in the press;
sources are listed in docs/validation.md. Nothing is invented or interpolated.

Rainfall totals are the *reported gauge* totals, not reanalysis: Open-Meteo's ERA5
archive gives 30.3 mm for the night of 4-5 Sep 2022 against a reported 131.6 mm, a
4.3x underestimate, because reanalysis smooths convective peaks over its grid box. We
therefore drive the model with what the gauges measured.

`localities` are the places the press named as flooded. They are geocoded and mapped
onto our ward polygons at run time, so nothing is hand-assigned to a ward.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Event:
    key: str
    label: str
    total_mm: float
    duration_hr: float
    lake_fill: float
    antecedent_wetness: float
    note: str
    localities: list[tuple[str, str]] = field(default_factory=list)

    @property
    def hours(self) -> float:
        return self.duration_hr + 12.0

    @property
    def peak_mm_hr(self) -> float:
        """Peak of a triangular hyetograph carrying total_mm over duration_hr."""
        return 2.0 * self.total_mm / self.duration_hr


SEP_2022 = Event(
    key="sep2022",
    label="4-5 Sep 2022 (severe, city-wide)",
    total_mm=131.6, duration_hr=6.0,
    # August 2022 was the second wettest August on record, so the tanks were full
    # and the ground saturated. This is read off the record, not tuned.
    lake_fill=0.95, antecedent_wetness=0.9,
    note="131.6 mm, wettest September day since 2014, onto full tanks",
    localities=[
        ("Bellandur / ORR Eco Space", "Bellandur, Bengaluru, Karnataka, India"),
        ("Varthur", "Varthur, Bengaluru, Karnataka, India"),
        ("HSR Layout", "HSR Layout, Bengaluru, Karnataka, India"),
        ("Silk Board junction", "Central Silk Board, Bengaluru, Karnataka, India"),
        ("ST Bed Layout, Koramangala", "Koramangala, Bengaluru, Karnataka, India"),
        ("Marathahalli", "Marathahalli, Bengaluru, Karnataka, India"),
        ("Doddanekkundi", "Doddanekkundi, Bengaluru, Karnataka, India"),
        ("Yemalur", "Yemalur, Bengaluru, Karnataka, India"),
        ("Wilson Garden", "Wilson Garden, Bengaluru, Karnataka, India"),
        ("Sarjapur Road", "Sarjapur Road, Bengaluru, Karnataka, India"),
        ("Bommanahalli", "Bommanahalli, Bengaluru, Karnataka, India"),
    ],
)

OCT_2022 = Event(
    key="oct2022",
    label="20 Oct 2022 (moderate, localised)",
    # IMD: 54.5 mm over the city between 20:30 and 23:30; HAL airport 71.2 mm.
    total_mm=54.5, duration_hr=3.0,
    # Nothing in the record describes the antecedent state for this night, so we use
    # the simulator's own defaults rather than choosing values that flatter the score.
    lake_fill=0.5, antecedent_wetness=0.3,
    note="54.5 mm in 3 h; central, southern and eastern city worst hit",
    localities=[
        ("Koramangala", "Koramangala, Bengaluru, Karnataka, India"),
        ("Indiranagar", "Indiranagar, Bengaluru, Karnataka, India"),
        ("Double Road", "Double Road, Bengaluru, Karnataka, India"),
        ("Seshadripuram", "Seshadripuram, Bengaluru, Karnataka, India"),
        ("K R Puram", "Krishnarajapuram, Bengaluru, Karnataka, India"),
    ],
)

EVENTS = {e.key: e for e in (SEP_2022, OCT_2022)}
