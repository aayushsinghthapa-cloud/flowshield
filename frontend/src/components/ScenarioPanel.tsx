import { useState } from 'react'
import type { City, Profile, ScenarioParams } from '../api'
import { PRESETS } from '../lib/presets'
import { Section, Segmented, Slider } from '../ui'

interface Props {
  city: City
  params: ScenarioParams
  onChange: (p: ScenarioParams, name?: string) => void
  onRun: () => void
  running: boolean
  blockMode: boolean
  onBlockMode: (b: boolean) => void
}

export default function ScenarioPanel({ params, onChange, onRun, running, blockMode, onBlockMode }: Props) {
  const [advanced, setAdvanced] = useState(false)
  const rain = params.rain
  const setRain = (patch: Partial<ScenarioParams['rain']>) => onChange({ ...params, rain: { ...rain, ...patch } })
  const set = (patch: Partial<ScenarioParams>) => onChange({ ...params, ...patch })
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const live = rain.profile === 'series'

  return (
    <Section title="Scenario">
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.id} title={p.note} data-preset={p.id} onClick={() => onChange({ ...p.params, grid_m: params.grid_m }, p.label)}
            className="rounded-[10px] border border-line bg-surface px-2.5 py-2 text-left hover:border-accent hover:bg-accent-soft/40 transition-colors">
            <div className="text-[13px] font-medium leading-tight">{p.label}</div>
            <div className="text-[11px] text-ink-2 leading-snug mt-0.5 line-clamp-2">{p.note}</div>
          </button>
        ))}
      </div>

      <div className="divider my-3" />

      <div className="space-y-2.5">
        {live ? (
          <p className="text-[12px] text-accent">
            Using live forecast rain ({rain.series_mm_hr.length} h). Pick a preset above to switch back.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <span className="block text-[13px] text-ink-2">Storm shape</span>
              <Segmented value={rain.profile} onChange={(v) => setRain({ profile: v as Profile })}
                options={[
                  { value: 'constant', label: 'Steady', title: 'Same intensity throughout' },
                  { value: 'triangular', label: 'Peaked', title: 'Builds to a peak, then eases' },
                  { value: 'cloudburst', label: 'Burst', title: 'Short, very intense core' },
                ]} />
            </div>
            <Slider label="Peak rainfall" value={rain.peak_mm_hr} min={0} max={200} step={5}
              fmt={(v) => `${v} mm/hr`} onChange={(v) => setRain({ peak_mm_hr: v })} />
            <Slider label="Duration" value={rain.duration_hr} min={0.5} max={12} step={0.5}
              fmt={(v) => `${v} h`} onChange={(v) => setRain({ duration_hr: v, peak_at_hr: Math.min(rain.peak_at_hr, v) })} />
            {rain.profile === 'triangular' && (
              <Slider label="Peaks after" value={rain.peak_at_hr} min={0} max={rain.duration_hr} step={0.25}
                fmt={(v) => `${v} h`} onChange={(v) => setRain({ peak_at_hr: v })} />
            )}
          </>
        )}
        {live && (
          <Slider label="Thunderstorm peak factor" value={rain.scale} min={1} max={4} step={0.25}
            fmt={(v) => `x${v}`} onChange={(v) => setRain({ scale: v })}
            hint="Forecast models average rain over 9-25 km, which flattens local cloudbursts." />
        )}
      </div>

      <div className="divider my-3" />

      <div className="space-y-2.5">
        <Slider label="Drains blocked or silted" value={params.drainage_failure} min={0} max={1} step={0.05}
          fmt={pct} onChange={(v) => set({ drainage_failure: v })}
          hint="Share of storm-drain capacity lost city-wide to silt, garbage and broken inlets." />
        <Slider label="Lakes already full" value={params.lake_fill} min={0} max={1} step={0.05}
          fmt={pct} onChange={(v) => set({ lake_fill: v })}
          hint="Water level in the tanks when the storm starts. 100% = full to the weir." />
        <Slider label="Ground already wet" value={params.antecedent_wetness} min={0} max={1} step={0.05}
          fmt={pct} onChange={(v) => set({ antecedent_wetness: v })}
          hint="After days of rain the soil soaks up almost nothing, so more water runs off." />

        <div className="flex items-center gap-2">
          <button className={`${blockMode ? 'btn-danger' : 'btn-quiet'} flex-1`} onClick={() => onBlockMode(!blockMode)}>
            {blockMode ? 'Picking drains…' : 'Block a drain'}
          </button>
          {params.blocked_drains.length > 0 && (
            <button className="btn-ghost btn-sm" onClick={() => set({ blocked_drains: [] })}>
              Clear {params.blocked_drains.length}
            </button>
          )}
        </div>
      </div>

      <button className="text-[12px] text-accent mt-3" onClick={() => setAdvanced(!advanced)}>
        {advanced ? 'Hide' : 'Show'} advanced settings
      </button>
      {advanced && (
        <div className="space-y-2.5 mt-2.5">
          <Slider label="Drain intake capacity" value={params.drain_capacity_mm_hr} min={0} max={80} step={5}
            fmt={(v) => `${v} mm/hr`} onChange={(v) => set({ drain_capacity_mm_hr: v })}
            hint="How fast street drains can swallow water. No public data exists, so this is tunable." />
          <Slider label="Upstream inflow (Madiwala)" value={params.inflow_m3s} min={0} max={100} step={5}
            fmt={(v) => `${v} m³/s`} onChange={(v) => set({ inflow_m3s: v })}
            hint="Water arriving from the catchment upstream of the domain." />
          <Slider label="Hours to simulate" value={params.hours} min={3} max={24} step={1}
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
            hint="p95 = a ward counts as Critical when 5% of its land is that deep." />
        </div>
      )}

      <div className="divider my-3" />

      <div className="flex items-center justify-between gap-2">
        <Segmented value={params.grid_m} onChange={(v) => set({ grid_m: v })}
          options={[
            { value: 200, label: 'Fast', title: '200 m cells: about 8x faster, good for exploring' },
            { value: 100, label: 'Detailed', title: '100 m cells: slower, use for final numbers' },
          ]} />
        <button className="btn-primary flex-1" onClick={onRun} disabled={running}>
          {running ? 'Simulating…' : 'Run simulation'}
        </button>
      </div>
    </Section>
  )
}
