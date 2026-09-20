// Whole-scenario presets (rain + city state), not just rainfall shapes.
import { DEFAULT_PARAMS, type ScenarioParams } from '../api'

export interface Preset {
  id: string
  label: string
  note: string
  params: ScenarioParams
}

const base = DEFAULT_PARAMS

export const PRESETS: Preset[] = [
  {
    id: 'normal',
    label: 'Normal rain',
    note: '10 mm/hr, 3 h. An ordinary shower.',
    params: { ...base, rain: { ...base.rain, profile: 'constant', peak_mm_hr: 10, duration_hr: 3, series_mm_hr: [], scale: 1 }, hours: 8, drainage_failure: 0, lake_fill: 0.5, antecedent_wetness: 0 },
  },
  {
    id: 'heavy',
    label: 'Heavy storm',
    note: '50 mm/hr peak, 3 h. IMD “heavy”.',
    params: { ...base, rain: { ...base.rain, profile: 'triangular', peak_mm_hr: 50, duration_hr: 3, peak_at_hr: 1.5, series_mm_hr: [], scale: 1 }, hours: 12, drainage_failure: 0, lake_fill: 0.5, antecedent_wetness: 0 },
  },
  {
    id: 'cloudburst',
    label: 'Cloudburst',
    note: '100 mm/hr core, 2 h. Extreme burst.',
    params: { ...base, rain: { ...base.rain, profile: 'cloudburst', peak_mm_hr: 100, duration_hr: 2, series_mm_hr: [], scale: 1 }, hours: 12, drainage_failure: 0.2, lake_fill: 0.6, antecedent_wetness: 0.3 },
  },
  {
    id: 'sep2022',
    label: 'Sept 2022-style event',
    note: '131.6 mm, 6 h, tanks full. Catches 9 of 10 reported flood spots.',
    params: {
      // The configuration scored in docs/validation.md against the real event:
      // the reported city total as a 6 h triangular burst onto near-full tanks.
      ...base,
      rain: { ...base.rain, profile: 'triangular', peak_mm_hr: 43.9, duration_hr: 6, peak_at_hr: 2.4, series_mm_hr: [], scale: 1 },
      hours: 18, drainage_failure: 0, lake_fill: 0.95, antecedent_wetness: 0.9,
    },
  },
]
