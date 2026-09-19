// Typed client for the FlowShield API.
import type { FeatureCollection } from 'geojson'

export type Profile = 'constant' | 'triangular' | 'cloudburst' | 'series'

export interface RainParams {
  profile: Profile
  peak_mm_hr: number
  duration_hr: number
  peak_at_hr: number
  start_hr: number
  series_mm_hr: number[]
  series_step_hr: number
  scale: number
}

export interface Thresholds {
  warning_m: number
  critical_m: number
  ward_percentile: number
}

export interface ScenarioParams {
  rain: RainParams
  hours: number
  drainage_failure: number
  drain_capacity_mm_hr: number
  lake_fill: number
  antecedent_wetness: number
  blocked_drains: number[]
  inflow_m3s: number
  inflow_hours: number
  thresholds: Thresholds
  grid_m: 100 | 200
}

export interface WardInfo {
  id: number
  no: number
  name: string
  pop2011_in_domain: number
  cells: number
  centroid: [number, number]
}

export interface City {
  shape: [number, number]
  cell_m: number
  corners: [number, number][]
  bbox: { west: number; south: number; east: number; north: number }
  wards: WardInfo[]
  lakes: { id: number; name: string; area_ha: number; cells: number }[]
  sources: string[]
  kind: Uint8Array
  ward_id: Int16Array
  population_total: number
  presets: Record<string, Partial<RainParams>>
  wardsGeo: FeatureCollection
  lakesGeo: FeatureCollection
  drainsGeo: FeatureCollection
}

export type Status = 'safe' | 'warning' | 'critical'

export interface WardResult {
  id: number
  name: string
  metric: number[]
  status: number[]
  peak_m: number
  peak_status: Status
  eta_min: number | null
  warning_eta_min: number | null
  rising: boolean[]
  pop_warning_peak: number
  pop_critical_peak: number
}

export interface SimResult {
  run_id: string
  params: ScenarioParams
  shape: [number, number]
  cell_m: number
  kind: Uint8Array
  times_min: number[]
  frame_times_min: number[]
  frames: Uint16Array[]
  rain_mm_hr: number[]
  total_rain_mm: number
  wards: WardResult[]
  critical_wards: { id: number; name: string; eta_min: number }[]
  pop_warning: number[]
  pop_critical: number[]
  area_warning_km2: number[]
  area_critical_km2: number[]
  lakes: { id: number; name: string; fill: number[] }[]
  mass_balance: {
    error: number[]
    max_abs_error: number
    v_in_m3: number[]
    v_out_m3: number[]
    storage_m3: number[]
    v_inf_m3: number[]
  }
  dt_s: number[]
  steps: number
  runtime_s: number
  max_depth_m: number
}

function decode(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`
    try {
      const j = await r.json()
      if (j.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* keep status text */
    }
    throw new Error(detail)
  }
  return r.json() as Promise<T>
}

export async function fetchCity(): Promise<City> {
  const raw = await request<any>('/city')
  return {
    ...raw,
    kind: new Uint8Array(decode(raw.kind)),
    ward_id: new Int16Array(decode(raw.ward_id)),
    wardsGeo: raw.wards_geo,
    wards: raw.wards,
    lakesGeo: raw.lakes_geo,
    drainsGeo: raw.drains_geo,
  }
}

async function inflate(b64: string): Promise<ArrayBuffer> {
  const stream = new Blob([decode(b64)]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Response(stream).arrayBuffer()
}

export async function runSimulation(p: ScenarioParams): Promise<SimResult> {
  const raw = await request<any>('/simulate', { method: 'POST', body: JSON.stringify(p) })
  const [n, rows, cols] = raw.frames_shape as [number, number, number]
  const all = new Uint16Array(await inflate(raw.frames_z))
  const size = rows * cols
  const frames = Array.from({ length: n }, (_, i) => all.subarray(i * size, (i + 1) * size))
  delete raw.frames_z
  return { ...raw, frames, kind: new Uint8Array(decode(raw.kind)) }
}

export const DEFAULT_PARAMS: ScenarioParams = {
  rain: {
    profile: 'triangular',
    peak_mm_hr: 50,
    duration_hr: 3,
    peak_at_hr: 1.5,
    start_hr: 0,
    series_mm_hr: [],
    series_step_hr: 1,
    scale: 1,
  },
  hours: 12,
  drainage_failure: 0,
  drain_capacity_mm_hr: 20,
  lake_fill: 0.5,
  antecedent_wetness: 0,
  blocked_drains: [],
  inflow_m3s: 0,
  inflow_hours: 6,
  thresholds: { warning_m: 0.15, critical_m: 0.3, ward_percentile: 95 },
  grid_m: 200,
}

export function fmtEta(min: number | null): string {
  if (min === null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`
}

export function fmtPop(n: number): string {
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} lakh`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return `${Math.round(n)}`
}

// ---------------------------------------------------------------- live weather
export interface Forecast {
  source: string
  fetched_at: string
  times: string[]
  mm_hr: number[]
  probability: (number | null)[]
  past_24h_mm: number
  next_total_mm: number
}

export const fetchForecast = () => request<Forecast>('/live/forecast?hours=48')

export interface EnsembleResult {
  n_members: number
  source: string
  fetched_at: string
  peak_factor: number
  times: string[]
  member_totals_mm: number[]
  member_hourly_mean: number[]
  wards: { id: number; name: string; p_critical: number; eta_median_min: number | null; eta_p10_min: number | null }[]
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const percentile = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo)
}

// Fetch ensemble rain, run members in parallel batches (one serverless call each),
// then P(ward critical) = members reaching critical / N.
export async function runEnsemble(body: {
  model: string
  hours: number
  peak_factor: number
  drainage_failure: number
  lake_fill: number
  antecedent_wetness: number
  blocked_drains: number[]
}): Promise<EnsembleResult> {
  const ens = await request<{ source: string; times: string[]; members: number[][]; fetched_at: string }>(
    '/ensemble/members', { method: 'POST', body: JSON.stringify({ model: body.model, hours: body.hours }) })
  const { model: _m, hours: _h, ...domain } = body
  const BATCHES = 4
  const size = Math.ceil(ens.members.length / BATCHES)
  const chunks = Array.from({ length: BATCHES }, (_, i) => ens.members.slice(i * size, (i + 1) * size)).filter((c) => c.length)
  const parts = await Promise.all(chunks.map((members) =>
    request<{ etas: Record<string, number | null>[]; wards: Record<string, string> }>(
      '/ensemble/run', { method: 'POST', body: JSON.stringify({ members, ...domain }) })))
  const etas = parts.flatMap((p) => p.etas)
  const names = parts[0].wards
  const n = etas.length
  const wards = Object.keys(names).map((id) => {
    const hit = etas.map((e) => e[id]).filter((v): v is number => v !== null && v !== undefined)
    return {
      id: Number(id), name: names[id], p_critical: hit.length / n,
      eta_median_min: hit.length ? median(hit) : null,
      eta_p10_min: hit.length ? percentile(hit, 0.1) : null,
    }
  })
  return {
    n_members: n, source: ens.source, fetched_at: ens.fetched_at, peak_factor: body.peak_factor, times: ens.times,
    member_totals_mm: ens.members.map((m) => m.reduce((a, b) => a + b, 0) * body.peak_factor),
    member_hourly_mean: ens.times.map((_, i) => ens.members.reduce((a, m) => a + (m[i] ?? 0), 0) / n),
    wards,
  }
}

// ---------------------------------------------------------------- AI
export interface AIMeta {
  model: string
  retries: number
  latency_s: number
  input_tokens: number | null
  output_tokens: number | null
}

export interface ParsedScenario {
  parsed: {
    profile: 'constant' | 'triangular' | 'cloudburst' | 'live_forecast'
    peak_mm_hr: number
    duration_hr: number
    peak_at_hr: number
    drainage_failure: number
    lake_fill: number
    antecedent_wetness: number
    hours: number
    blocked_places: string[]
    forecast_peak_factor: number
    summary: string
  }
  blocked_drains: number[]
  blocked_places: { place: string; drains: number }[]
  unknown_places: string[]
  clamped: string[]
  ai: AIMeta
  input: string
}

export const aiParseScenario = (text: string) =>
  request<ParsedScenario>('/ai/scenario', { method: 'POST', body: JSON.stringify({ text }) })

export interface BulletinResult {
  bulletin: {
    severity: string
    headline: string
    authority_advisory: string[]
    public_alert_en: string
    public_alert_kn: string
  }
  grounding: { numbers_checked: number; unverified: string[]; ok: boolean }
  facts: Record<string, unknown>
  ai: AIMeta
}

export const aiBulletin = (r: SimResult, ensemble?: EnsembleResult | null) => {
  // Only what the bulletin needs; the server builds the model's facts from it.
  const result = {
    params: r.params, critical_wards: r.critical_wards, total_rain_mm: r.total_rain_mm,
    rain_mm_hr: r.rain_mm_hr, pop_critical: r.pop_critical, pop_warning: r.pop_warning, lakes: r.lakes,
    wards: r.wards.map(({ id, name, peak_status, eta_min, warning_eta_min, pop_critical_peak }) =>
      ({ id, name, peak_status, eta_min, warning_eta_min, pop_critical_peak })),
  }
  const ens = ensemble ? { n_members: ensemble.n_members, wards: ensemble.wards } : null
  return request<BulletinResult>('/ai/bulletin', { method: 'POST', body: JSON.stringify({ result, ensemble: ens }) })
}
