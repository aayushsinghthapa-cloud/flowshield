# Validation against the 4–5 September 2022 Bengaluru flood

**Headline: the model finds 9 of the 10 reported flood locations (POD 0.90), and the
one it misses it still flags as Warning. It over-predicts how *far* the flooding
spreads, so treat the affected-population figure as an upper bound, not a forecast.**

Reproduce with:

```bash
cd backend && ../.venv/bin/python -m validation.sept2022          # the scored run
cd backend && ../.venv/bin/python -m validation.sept2022 --sweep  # sensitivity table
```

## The event

On 5 September 2022 Bengaluru recorded **131.6 mm**, its wettest September day since
2014, as an overnight downpour. Marathahalli, Doddanekkundi, Varthur and HAL Road each
reported **over 100 mm**; IMD put Sampangiramanagar at 148 mm, and KSNDMC had HSR Layout
at 65 mm by 03:30. **August 2022 had been the second wettest August on record**, so the
tanks were already full and the ground saturated — which is why the run below starts
lakes at 95% and antecedent wetness at 0.9 rather than guessing.

Bellandur, Hallanayakanahalli and Varthur lakes overflowed. Two SDRF teams were deployed
to Mahadevapura and Bommanahalli.

## Method

1. Take the localities that contemporaneous reporting named as flooded (list below).
2. Geocode each with **OpenStreetMap Nominatim**, then find which BBMP ward polygon the
   point falls inside. "Observed flooded" therefore becomes a set of ward ids on our own
   grid — no hand-matching of names.
3. Run the model on the real terrain with the reported rainfall: 131.6 mm as a triangular
   hyetograph over 6 h, lakes 95% full, ground 90% wet, 100 m cells.
4. Score the model's **Critical** wards against that set.

This is a **categorical** check — *where* flooding happened, not how deep. No measured
flood depths were published for these streets, so there is nothing to regress against.

## Result

| Reported locality | Ward | Model peak depth | Verdict |
|---|---|---|---|
| Sarjapur Road | Agaram | 95.8 cm | **hit** |
| Silk Board junction | BTM Layout | 94.6 cm | **hit** |
| Bellandur / ORR Eco Space | Bellanduru | 39.1 cm | **hit** |
| Bommanahalli | Bommanahalli | 44.2 cm | **hit** |
| Doddanekkundi | Dodda Nekkundi | 106.4 cm | **hit** |
| HSR Layout | HSR Layout | 80.8 cm | **hit** |
| Wilson Garden | Hombegowda Nagara | 64.2 cm | **hit** |
| ST Bed Layout, Koramangala | Koramangala | 96.5 cm | **hit** |
| Varthur | Varthuru | 38.8 cm | **hit** |
| Marathahalli, Yemalur | Marathahalli | 23.3 cm | **miss** — Warning, 6.7 cm short of Critical |

```
observed wards        10
model critical wards  41
hits                   9
misses                 1   (flagged Warning, not Critical)
POD (hit rate)      0.90
FAR (upper bound)   0.78
CSI                 0.21
peak people in deep water   173,200
peak flooded area            25.0 km²
```

## How to read those numbers honestly

**POD 0.90 is the meaningful score.** Of the places Bengaluru reported under water that
night, the model independently put nine of them past 30 cm, and the tenth past 15 cm.
It was not tuned to do this: the terrain, lakes, drains and wards all come from public
data, and the only inputs are the reported rainfall and antecedent state.

**FAR 0.78 is an upper bound, not an error rate.** News coverage names the newsworthy —
the IT corridor, the arterial junctions. A ward's absence from that list is not evidence
it stayed dry, and the same reporting described the whole city as submerged. Most of the
32 "false alarms" are places nobody wrote about, not places the model invented.

**But the model does over-predict extent, and we should say so.** 41 of 72 wards critical,
25 km² and 173,000 people is more than the reporting supports. Three reasons, all
structural rather than fixable tonight:

- Rain falls **uniformly** across the domain. Real storms are patchy; the observed totals
  ranged from 65 mm at HSR to 148 mm at Sampangiramanagar in the same night.
- **Drain capacity is a single assumed number** (20 mm/hr) because BBMP publishes none.
- **100 m cells** cannot drain along a street, so water that would run off down a road
  sits in the cell.

So: trust the model's **ranking** — which wards go first, and by how much a blocked drain
moves that — more than its absolute headcount.

## Sensitivity

The same scoring under different assumptions about how the 131.6 mm fell and how wet the
city already was:

| Storm duration | Lakes | Ground | Critical wards | Hits | POD | Flooded km² |
|---|---|---|---|---|---|---|
| **6 h** | **0.95** | **0.9** | **41** | **9** | **0.90** | **25.0** |
| 6 h | 0.75 | 0.6 | 39 | 8 | 0.80 | 19.0 |
| 12 h | 0.95 | 0.9 | 36 | 6 | 0.60 | 22.9 |
| 12 h | 0.75 | 0.6 | 34 | 6 | 0.60 | 18.6 |
| 24 h | 0.95 | 0.9 | 34 | 6 | 0.60 | 22.0 |
| 24 h | 0.60 | 0.4 | 26 | 5 | 0.50 | 15.5 |

The best agreement comes from the assumption that matches the reporting — a short,
intense overnight burst onto full tanks — which is a reassuring sign rather than a fitted
result: we did not pick the row with the best score, we picked the row the news describes.
Note how strongly the **antecedent state** matters: the same 131.6 mm over 24 h onto
60%-full tanks floods 26 wards instead of 41. That is the lake-cascade argument in one line.

## What this does not establish

- No depth calibration. POD says *where*, never *how deep*.
- One event. Two or three more would be needed before quoting a skill score with any
  confidence.
- Ward boundaries are the BBMP 198-ward set; population is Census 2011.
- Doddakanneli could not be geocoded and was excluded rather than hand-placed.
- **This remains decision support, not an official forecast.**

## Sources

- [Deccan Herald — Parts of Bengaluru still inundated after rains batter city](https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Fbengaluru%2Fparts-of-bengaluru-still-inundated-after-rains-batter-city-1142614.html)
- [Deccan Herald — In pics: Bengaluru, India's Silicon Valley, drowns after overnight rains](https://www.deccanherald.com/archives/in-pics-bengaluru-indias-silicon-valley-drowns-after-overnight-rains-1142270-1451902)
- [Deccan Herald — Bengaluru bears brunt of downpour, grim forecast for today](https://www.deccanherald.com/india/karnataka/bengaluru/bengaluru-bears-brunt-of-downpour-grim-forecast-for-today-1140564.html)
- [Deccan Herald — Second wettest August on record for Bengaluru](https://www.deccanherald.com/amp/story/india%2Fkarnataka%2Fbengaluru%2Fsecond-wettest-august-on-record-for-bengaluru-1140843.html)
- [The News Minute — Bengaluru flooded again after rains: Marathahalli, ORR under water](https://www.thenewsminute.com/article/bengaluru-flooded-again-after-rains-marathahalli-orr-under-water-167535)
- [The Quint — Rains in Bengaluru continue to wreak havoc, Bellandur lake overflows into homes](https://www.thequint.com/south-india/rains-in-bengaluru-continue-to-wreak-havoc-three-lakes-overflow-into-homes)
- Geocoding: OpenStreetMap Nominatim. Ward polygons: BBMP via datameet.
