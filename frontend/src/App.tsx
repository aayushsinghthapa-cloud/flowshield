import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PARAMS, fetchCity, fetchForecast, fmtPop, runSimulation,
  type City, type EnsembleResult, type Forecast, type ParsedScenario, type ScenarioParams, type SimResult,
} from './api'
import AIScenarioBox from './components/AIScenarioBox'
import BulletinPanel from './components/BulletinPanel'
import CompareView, { describe, type SavedRun } from './components/CompareView'
import LivePanel from './components/LivePanel'
import MapView, { type MapMode } from './components/MapView'
import ModelTab from './components/ModelTab'
import ResultsPanel from './components/ResultsPanel'
import ScenarioPanel from './components/ScenarioPanel'
import TimeSlider from './components/TimeSlider'

type Tab = 'simulator' | 'compare' | 'model'

export default function App() {
  const [city, setCity] = useState<City | null>(null)
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS)
  const [result, setResult] = useState<SimResult | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<MapMode>('status')
  const [blockMode, setBlockMode] = useState(false)
  const [selectedWard, setSelectedWard] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('simulator')
  const [saved, setSaved] = useState<SavedRun[]>([])
  const [ensemble, setEnsemble] = useState<EnsembleResult | null>(null)
  const [runLabel, setRunLabel] = useState('Heavy storm (default)')

  const latest = useRef(0)
  const booted = useRef(false)
  const run = useCallback(async (p: ScenarioParams, label?: string) => {
    const id = ++latest.current // only the most recent request may update the UI
    if (label) setRunLabel(label)
    setRunning(true)
    setError(null)
    setPlaying(false)
    try {
      const r = await runSimulation(p)
      if (id !== latest.current) return
      setResult(r)
      setFrame(0)
      setPlaying(true)
    } catch (e) {
      if (id === latest.current) setError(`Simulation failed: ${(e as Error).message}`)
    } finally {
      if (id === latest.current) setRunning(false)
    }
  }, [])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    fetchCity()
      .then((c) => {
        setCity(c)
        run(DEFAULT_PARAMS)
      })
      .catch((e) => setError(`Could not load city data: ${e.message}`))
  }, [run])

  const recordIdx = useMemo(() => {
    if (!result) return 0
    const t = result.frame_times_min[frame] ?? 0
    return Math.max(0, result.times_min.indexOf(t))
  }, [result, frame])

  const wardStatus = useMemo(() => {
    const m = new Map<number, number>()
    result?.wards.forEach((w) => m.set(w.id, w.status[recordIdx]))
    return m
  }, [result, recordIdx])

  const runLive = useCallback((f: Forecast, factor: number, hours: number) => {
    const series = f.mm_hr.slice(0, hours)
    const p: ScenarioParams = {
      ...params,
      rain: { ...params.rain, profile: 'series', series_mm_hr: series, series_step_hr: 1, scale: factor, start_hr: 0 },
      hours,
      antecedent_wetness: Math.min(1, f.past_24h_mm / 40),
    }
    setParams(p)
    run(p, `Live forecast from ${f.times[0]?.slice(5, 16).replace('T', ' ')}${factor > 1 ? ` ×${factor}` : ''}`)
  }, [params, run])

  const confirmAI = useCallback(async (ps: ParsedScenario) => {
    const a = ps.parsed
    const base: ScenarioParams = {
      ...params,
      drainage_failure: a.drainage_failure,
      lake_fill: a.lake_fill,
      antecedent_wetness: a.antecedent_wetness,
      blocked_drains: ps.blocked_drains,
      hours: a.hours,
    }
    if (a.profile === 'live_forecast') {
      try {
        const f = await fetchForecast()
        const series = f.mm_hr.slice(0, 24)
        const p = { ...base, hours: 24, rain: { ...params.rain, profile: 'series' as const, series_mm_hr: series, series_step_hr: 1, scale: a.forecast_peak_factor, start_hr: 0 } }
        setParams(p)
        run(p, `AI: ${a.summary}`)
      } catch (e) {
        setError(`Forecast unavailable: ${(e as Error).message}`)
      }
      return
    }
    const p: ScenarioParams = {
      ...base,
      rain: { ...params.rain, profile: a.profile, peak_mm_hr: a.peak_mm_hr, duration_hr: a.duration_hr,
        peak_at_hr: a.peak_at_hr, series_mm_hr: [], scale: 1, start_hr: 0 },
    }
    setParams(p)
    run(p, `AI: ${a.summary}`)
  }, [params, run])

  const saveRun = () => {
    if (!result) return
    setSaved((s) => [...s.slice(-3), { name: `${String.fromCharCode(65 + (s.length % 26))} · ${runLabel.slice(0, 40)}`, result }])
  }

  const probability = useMemo(() => {
    if (!ensemble || mode !== 'probability') return null
    return new Map(ensemble.wards.map((w) => [w.id, w.p_critical]))
  }, [ensemble, mode])

  const toggleDrain = useCallback((id: number) => {
    setParams((p) => ({
      ...p,
      blocked_drains: p.blocked_drains.includes(id)
        ? p.blocked_drains.filter((d) => d !== id)
        : [...p.blocked_drains, id],
    }))
  }, [])

  if (!city) {
    return (
      <div className="h-full grid place-items-center text-slate-400">
        {error ?? 'Loading Bengaluru terrain, lakes, drains and wards…'}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-slate-800 bg-slate-900">
        <div>
          <h1 className="text-base font-semibold leading-tight">
            FlowShield <span className="text-sky-400">Bengaluru</span>
          </h1>
          <p className="text-[11px] text-slate-400 leading-tight">
            Koramangala–Challaghatta lake cascade · {city.wards.length} wards · {fmtPop(city.population_total)} people
          </p>
        </div>
        <nav className="flex gap-1 ml-4">
          {(['simulator', 'compare', 'model'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-sm capitalize ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t}{t === 'compare' && saved.length > 0 ? ` (${saved.length})` : ''}
            </button>
          ))}
        </nav>
        {error && <div className="ml-auto text-xs text-red-300 bg-red-950/60 border border-red-800 rounded px-2 py-1">{error}</div>}
      </header>

      {tab === 'simulator' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-72 shrink-0 overflow-y-auto border-r border-slate-800 p-4 bg-slate-900/60">
            <div className="space-y-4">
              <AIScenarioBox onConfirm={confirmAI} busy={running} />
              <LivePanel params={params} onRunLive={runLive} ensemble={ensemble}
                onEnsemble={(e) => { setEnsemble(e); if (e) setMode('probability'); else if (mode === 'probability') setMode('status') }}
                running={running} />
              <ScenarioPanel city={city} params={params} onChange={setParams}
                onRun={() => run(params, describe({ params } as SimResult))}
                running={running} blockMode={blockMode} onBlockMode={setBlockMode} />
            </div>
          </aside>

          <main className="relative flex-1 min-h-[420px]">
            <MapView city={city} result={result} frame={frame} mode={mode} blocked={params.blocked_drains}
              blockMode={blockMode} onToggleDrain={toggleDrain} selectedWard={selectedWard}
              onSelectWard={setSelectedWard} wardStatus={wardStatus} probability={probability} />
            <div className="absolute top-3 left-3 flex gap-1 rounded-md bg-slate-900/90 p-1 border border-slate-700 text-xs">
              {(['status', 'depth', ...(ensemble ? ['probability'] : [])] as MapMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2 py-1 rounded capitalize ${mode === m ? 'bg-slate-700' : 'text-slate-400'}`}>
                  {m === 'status' ? 'Risk status' : m === 'depth' ? 'Water depth' : 'Ensemble P(critical)'}
                </button>
              ))}
            </div>
            <Legend />
            {running && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/40 pointer-events-none">
                <div className="rounded-lg bg-slate-900 border border-slate-700 px-4 py-2 text-sm">
                  Solving shallow-water equations on {city.shape[0] * city.shape[1]} cells…
                </div>
              </div>
            )}
            {result && (
              <div className="absolute bottom-8 left-3 right-3 lg:left-1/2 lg:-translate-x-1/2 lg:w-[560px]">
                <TimeSlider times={result.frame_times_min} frame={frame} onFrame={setFrame}
                  playing={playing} onPlaying={setPlaying} rainNow={result.rain_mm_hr[recordIdx] ?? 0} />
              </div>
            )}
          </main>

          <aside className="lg:w-96 shrink-0 overflow-y-auto border-l border-slate-800 p-4 bg-slate-900/60">
            {result ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Current run</div>
                    <div className="text-sm text-slate-200 truncate" title={runLabel}>{runLabel}</div>
                  </div>
                  <button className="btn-ghost shrink-0" onClick={saveRun} disabled={saved.some((r) => r.result.run_id === result.run_id)}>
                    {saved.some((r) => r.result.run_id === result.run_id) ? 'Saved ✓' : 'Save to compare'}
                  </button>
                </div>
                <ResultsPanel result={result} recordIdx={recordIdx} selectedWard={selectedWard}
                  onSelectWard={setSelectedWard} />
                <BulletinPanel result={result} ensemble={ensemble} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">Run a simulation to see ward risk, ETAs and affected population.</p>
            )}
          </aside>
        </div>
      )}

      {tab === 'compare' && (
        <div className="flex-1 min-h-0">
          <CompareView runs={saved} onRemove={(i) => setSaved((s) => s.filter((_, j) => j !== i))} />
        </div>
      )}
      {tab === 'model' && (
        <div className="flex-1 min-h-0">
          <ModelTab result={result} />
        </div>
      )}

      <footer className="px-4 py-1 text-[10px] text-slate-500 border-t border-slate-800">
        Data: Copernicus GLO-30 DEM · ESA WorldCover 2021 · © OpenStreetMap contributors (ODbL) · BBMP wards &amp; Census 2011
        via datameet · Open-Meteo. Terrain and drain capacities are approximations; this is a decision-support prototype, not an official forecast.
      </footer>
    </div>
  )
}

function Legend() {
  return (
    <div className="absolute top-3 right-12 rounded-md bg-slate-900/90 border border-slate-700 px-2 py-1.5 text-[11px] space-y-0.5">
      <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500" /> Critical ≥ 30 cm</div>
      <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Warning ≥ 15 cm</div>
      <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-sky-400" /> Water</div>
      <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-sky-400" /> Drain (OSM)</div>
      <div className="flex items-center gap-1.5"><span className="w-3 h-1 bg-rose-500" /> Blocked drain</div>
    </div>
  )
}
