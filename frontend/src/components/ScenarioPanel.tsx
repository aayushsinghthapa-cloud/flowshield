import { useState } from 'react'
import type { City, Profile, ScenarioParams } from '../api'

interface Props {
  city: City
  params: ScenarioParams
  onChange: (p: ScenarioParams) => void
  onRun: () => void
  running: boolean
  blockMode: boolean
  onBlockMode: (b: boolean) => void
}

const PRESET_LABELS: Record<string, string> = {
  normal: 'Normal · 10 mm/hr',
  heavy: 'Heavy · 50 mm/hr',
  cloudburst: 'Cloudburst · 100 mm/hr',
}

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt?: (v: number) => string
  onChange: (v: number) => void
  hint?: string
}) {
  const { label, value, min, max, step, fmt, onChange, hint } = props
  return (
    <label className="block text-xs text-slate-300" title={hint}>
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-slate-100">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-400"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function ScenarioPanel({ city, params, onChange, onRun, running, blockMode, onBlockMode }: Props) {
  const [advanced, setAdvanced] = useState(false)
  const rain = params.rain
  const setRain = (patch: Partial<ScenarioParams['rain']>) => onChange({ ...params, rain: { ...rain, ...patch } })
  const set = (patch: Partial<ScenarioParams>) => onChange({ ...params, ...patch })
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div className="space-y-4">
      <section>
        <h3 className="panel-title">1 · Rainfall</h3>
        <div className="grid grid-cols-1 gap-1.5 mb-3">
          {Object.entries(city.presets).map(([k, v]) => (
            <button
              key={k}
              className="btn-ghost text-left"
              onClick={() => setRain({ ...v, series_mm_hr: [], start_hr: 0, scale: 1 } as Partial<ScenarioParams['rain']>)}
            >
              {PRESET_LABELS[k] ?? k}
            </button>
          ))}
        </div>
        {rain.profile === 'series' ? (
          <p className="text-xs text-sky-300 mb-2">
            Using a rainfall time series ({rain.series_mm_hr.length} steps). Pick a preset to switch back.
          </p>
        ) : (
          <label className="block text-xs text-slate-300 mb-2">
            Profile
            <select
              className="mt-1 w-full rounded bg-slate-800 border border-slate-700 px-2 py-1 text-slate-100"
              value={rain.profile}
              onChange={(e) => setRain({ profile: e.target.value as Profile })}
            >
              <option value="constant">Constant</option>
              <option value="triangular">Triangular (peaked storm)</option>
              <option value="cloudburst">Cloudburst (intense core)</option>
            </select>
          </label>
        )}
        <div className="space-y-2">
          {rain.profile !== 'series' && (
            <>
              <Slider label="Peak intensity" value={rain.peak_mm_hr} min={0} max={200} step={5}
                fmt={(v) => `${v} mm/hr`} onChange={(v) => setRain({ peak_mm_hr: v })} />
              <Slider label="Duration" value={rain.duration_hr} min={0.5} max={12} step={0.5}
                fmt={(v) => `${v} h`} onChange={(v) => setRain({ duration_hr: v, peak_at_hr: Math.min(rain.peak_at_hr, v) })} />
              {rain.profile === 'triangular' && (
                <Slider label="Peak at" value={rain.peak_at_hr} min={0} max={rain.duration_hr} step={0.25}
                  fmt={(v) => `${v} h`} onChange={(v) => setRain({ peak_at_hr: v })} />
              )}
            </>
          )}
          {rain.profile === 'series' && (
            <Slider label="Convective peak factor" value={rain.scale} min={1} max={4} step={0.1}
              fmt={(v) => `×${v.toFixed(1)}`} onChange={(v) => setRain({ scale: v })}
              hint="Model rain on a 9–25 km grid smooths thunderstorm peaks; scale it up to test a local cloudburst." />
          )}
        </div>
      </section>

      <section>
        <h3 className="panel-title">2 · Drainage & initial state</h3>
        <div className="space-y-2">
          <Slider label="Drainage failure" value={params.drainage_failure} min={0} max={1} step={0.05}
            fmt={pct} onChange={(v) => set({ drainage_failure: v })}
            hint="Fraction of storm-drain capacity lost to silt, garbage and broken inlets (city-wide)." />
          <Slider label="Initial lake level" value={params.lake_fill} min={0} max={1} step={0.05}
            fmt={pct} onChange={(v) => set({ lake_fill: v })}
            hint="Tank water level at the start, as a fraction of storage depth. 100% = full to the weir." />
          <Slider label="Soil already wet" value={params.antecedent_wetness} min={0} max={1} step={0.05}
            fmt={pct} onChange={(v) => set({ antecedent_wetness: v })}
            hint="Antecedent wetness: rain on previous days reduces infiltration." />
          <div className="flex items-center gap-2 pt-1">
            <button
              className={blockMode ? 'btn-danger flex-1' : 'btn-ghost flex-1'}
              onClick={() => onBlockMode(!blockMode)}
            >
              {blockMode ? 'Click drains on the map…' : 'Block a drain'}
            </button>
            {params.blocked_drains.length > 0 && (
              <button className="btn-ghost" onClick={() => set({ blocked_drains: [] })}>
                Clear {params.blocked_drains.length}
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setAdvanced(!advanced)}>
          {advanced ? '▾' : '▸'} Advanced
        </button>
        {advanced && (
          <div className="space-y-2 mt-2">
            <Slider label="Drain intake capacity" value={params.drain_capacity_mm_hr} min={0} max={80} step={5}
              fmt={(v) => `${v} mm/hr`} onChange={(v) => set({ drain_capacity_mm_hr: v })} />
            <Slider label="Upstream inflow into Madiwala" value={params.inflow_m3s} min={0} max={100} step={5}
              fmt={(v) => `${v} m³/s`} onChange={(v) => set({ inflow_m3s: v })} />
            <Slider label="Simulated hours" value={params.hours} min={3} max={24} step={1}
              fmt={(v) => `${v} h`} onChange={(v) => set({ hours: v })} />
            <Slider label="Warning depth" value={params.thresholds.warning_m} min={0.05} max={0.5} step={0.05}
              fmt={(v) => `${Math.round(v * 100)} cm`}
              onChange={(v) => set({ thresholds: { ...params.thresholds, warning_m: v } })} />
            <Slider label="Critical depth" value={params.thresholds.critical_m} min={0.1} max={1} step={0.05}
              fmt={(v) => `${Math.round(v * 100)} cm`}
              onChange={(v) => set({ thresholds: { ...params.thresholds, critical_m: v } })} />
            <Slider label="Ward percentile" value={params.thresholds.ward_percentile} min={75} max={99} step={1}
              fmt={(v) => `p${v}`}
              onChange={(v) => set({ thresholds: { ...params.thresholds, ward_percentile: v } })}
              hint="A ward is Critical when this percentile of its land-cell depths passes the critical depth." />
          </div>
        )}
      </section>

      <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs">
        {([200, 100] as const).map((g) => (
          <button key={g} onClick={() => set({ grid_m: g })}
            className={`flex-1 px-2 py-1.5 ${params.grid_m === g ? 'bg-slate-700 text-white' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
            title={g === 200 ? 'Aggregated 200 m grid: about 8x faster, good for exploring' : 'Full 100 m grid: slower, use for final numbers'}>
            {g === 200 ? 'Fast preview 200 m' : 'Detailed 100 m'}
          </button>
        ))}
      </div>

      <button className="btn-primary w-full" onClick={onRun} disabled={running}>
        {running ? 'Simulating…' : 'Run simulation'}
      </button>
    </div>
  )
}
