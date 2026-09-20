import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PARAMS, fetchCity, fetchForecast, runSimulation,
  type City, type EnsembleResult, type Forecast, type ParsedScenario, type ScenarioParams, type SimResult,
} from './api'
import AIScenarioBox from './components/AIScenarioBox'
import BulletinPanel from './components/BulletinPanel'
import type { SavedRun } from './components/CompareView'
import HelpSheet from './components/HelpSheet'
import InsightsPanel from './components/InsightsPanel'
import LivePanel from './components/LivePanel'
import MapView, { type MapMode } from './components/MapView'
import ScenarioPanel from './components/ScenarioPanel'
import TimeSlider from './components/TimeSlider'
import { paramsFromUrl, writeUrl } from './lib/share'
import { Segmented, Spinner } from './ui'

// Compare and Model carry Recharts' line charts and all of KaTeX. Keeping them out of
// the first load gets the map and the first simulation on screen sooner; both are
// prefetched as soon as the browser is idle, so switching tabs still feels instant.
const CompareView = lazy(() => import('./components/CompareView'))
const ModelTab = lazy(() => import('./components/ModelTab'))
const prefetchTabs = () => {
  import('./components/CompareView')
  import('./components/ModelTab')
}

type Tab = 'simulator' | 'compare' | 'model'
const TABS: { value: Tab; label: string }[] = [
  { value: 'simulator', label: 'Simulator' },
  { value: 'compare', label: 'Compare' },
  { value: 'model', label: 'Model' },
]

export default function App() {
  const [city, setCity] = useState<City | null>(null)
  const [params, setParams] = useState<ScenarioParams>(() => paramsFromUrl() ?? DEFAULT_PARAMS)
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
  const [runLabel, setRunLabel] = useState('Heavy storm')
  const [scenarioName, setScenarioName] = useState('Heavy storm')
  const [setupOpen, setSetupOpen] = useState(false) // mobile drawer

  const latest = useRef(0)
  const booted = useRef(false)

  const run = useCallback(async (p: ScenarioParams, label?: string) => {
    const id = ++latest.current // only the newest request may update the UI
    if (label) setRunLabel(label)
    setRunning(true)
    setError(null)
    setPlaying(false)
    setSetupOpen(false)
    try {
      const r = await runSimulation(p)
      if (id !== latest.current) return
      setResult(r)
      writeUrl(p)
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
        run(params, 'Heavy storm')
      })
      .catch((e) => setError(`Could not load city data: ${e.message}`))
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2500))
    idle(prefetchTabs)
  }, [run, params])

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

  const probability = useMemo(() => {
    if (!ensemble || mode !== 'probability') return null
    return new Map(ensemble.wards.map((w) => [w.id, w.p_critical]))
  }, [ensemble, mode])

  const runLive = useCallback((f: Forecast, factor: number, hours: number) => {
    const p: ScenarioParams = {
      ...params,
      rain: { ...params.rain, profile: 'series', series_mm_hr: f.mm_hr.slice(0, hours), series_step_hr: 1, scale: factor, start_hr: 0 },
      hours,
      antecedent_wetness: Math.min(1, f.past_24h_mm / 40),
    }
    setParams(p)
    run(p, `Live forecast${factor > 1 ? ` x${factor}` : ''}`)
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
        const p = { ...base, hours: 24, rain: { ...params.rain, profile: 'series' as const, series_mm_hr: f.mm_hr.slice(0, 24), series_step_hr: 1, scale: a.forecast_peak_factor, start_hr: 0 } }
        setParams(p)
        run(p, 'AI scenario · live forecast')
      } catch (e) {
        setError(`Forecast unavailable: ${(e as Error).message}`)
      }
      return
    }
    const p: ScenarioParams = {
      ...base,
      rain: { ...params.rain, profile: a.profile, peak_mm_hr: a.peak_mm_hr, duration_hr: a.duration_hr, peak_at_hr: a.peak_at_hr, series_mm_hr: [], scale: 1, start_hr: 0 },
    }
    setParams(p)
    run(p, 'AI scenario')
  }, [params, run])

  const saveRun = () => {
    if (!result) return
    setSaved((s) => [...s.slice(-3), { name: `${String.fromCharCode(65 + s.length)} · ${runLabel}`, result }])
  }

  const toggleDrain = useCallback((id: number) => {
    setParams((p) => ({
      ...p,
      blocked_drains: p.blocked_drains.includes(id) ? p.blocked_drains.filter((d) => d !== id) : [...p.blocked_drains, id],
    }))
  }, [])

  if (!city) {
    return (
      <div className="h-full grid place-items-center px-6 text-center">
        {error ? <p className="text-crit text-sm max-w-sm">{error}</p> : (
          <div className="flex items-center gap-2 text-ink-2 text-sm">
            <Spinner /> Loading Bengaluru terrain, lakes, drains and wards…
          </div>
        )}
      </div>
    )
  }

  const setup = (
    <div className="space-y-3">
      <AIScenarioBox onConfirm={confirmAI} busy={running} />
      <LivePanel params={params} onRunLive={runLive} ensemble={ensemble} running={running}
        onEnsemble={(e) => { setEnsemble(e); setMode(e ? 'probability' : 'status') }} />
      <ScenarioPanel city={city} params={params}
        onChange={(p, name) => { setParams(p); setScenarioName(name ?? 'Custom scenario') }}
        onRun={() => run(params, scenarioName)}
        running={running} blockMode={blockMode} onBlockMode={setBlockMode} />
    </div>
  )

  const insights = result ? (
    <div className="space-y-3">
      <InsightsPanel result={result} recordIdx={recordIdx} selectedWard={selectedWard}
        onSelectWard={setSelectedWard} runLabel={runLabel} onSave={saveRun}
        saved={saved.some((r) => r.result.run_id === result.run_id)} />
      <BulletinPanel result={result} ensemble={ensemble} />
    </div>
  ) : (
    <div className="card card-pad text-[13px] text-ink-2">Run a scenario to see ward risk, timing and people affected.</div>
  )

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 bg-surface/80 backdrop-blur border-b border-line">
        <div className="flex items-center gap-1.5 sm:gap-4 px-2.5 sm:px-4 h-14">
          <div className="flex items-center gap-2 shrink-0">
            <Logo />
            <div className="min-w-0">
              <h1 className="text-[14px] sm:text-[15px] font-semibold leading-tight whitespace-nowrap">FlowShield</h1>
              <p className="hidden sm:block text-[11px] text-ink-2 leading-tight truncate">Bengaluru lake cascade</p>
            </div>
          </div>
          <Segmented className="mx-auto shrink-0" value={tab} onChange={setTab}
            options={TABS.map((t) => ({ ...t, label: t.value === 'compare' && saved.length ? `${t.label} ${saved.length}` : t.label }))} />
          <div className="hidden sm:flex items-center gap-2 text-[12px] text-ink-2">
            {running ? <span className="flex items-center gap-1.5 text-accent"><Spinner /> Simulating…</span>
              : result ? <span className="num">{result.cell_m} m grid · {result.runtime_s}s</span> : null}
          </div>
          <div className="hidden md:block"><HelpSheet /></div>
          <button className="btn-quiet btn-sm lg:hidden" onClick={() => setSetupOpen(true)}>Setup</button>
        </div>
        {error && (
          <div className="px-4 py-2 bg-crit-soft text-crit text-[12px] flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}
      </header>

      {tab === 'simulator' && (
        <div className="flex-1 min-h-0 lg:grid lg:grid-cols-[320px_1fr_390px] overflow-y-auto lg:overflow-hidden">
          <aside className="hidden lg:block overflow-y-auto border-r border-line p-3 bg-surface-2">{setup}</aside>

          <main className="relative h-[58vh] lg:h-auto">
            <MapView city={city} result={result} frame={frame} mode={mode} blocked={params.blocked_drains}
              blockMode={blockMode} onToggleDrain={toggleDrain} selectedWard={selectedWard}
              onSelectWard={setSelectedWard} wardStatus={wardStatus} probability={probability} />
            <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
              <div className="pointer-events-auto">
                <Segmented value={mode} onChange={setMode}
                  options={[
                    { value: 'status' as MapMode, label: 'Risk' },
                    { value: 'depth' as MapMode, label: 'Depth' },
                    ...(ensemble ? [{ value: 'probability' as MapMode, label: 'Chance' }] : []),
                  ]} />
              </div>
              {blockMode && (
                <div className="pointer-events-auto card px-3 py-1.5 text-[12px] text-crit font-medium">
                  Click a drain to block it · <button className="underline" onClick={() => setBlockMode(false)}>done</button>
                </div>
              )}
            </div>
            <Legend mode={mode} />
            {result && (
              <div className="absolute bottom-8 lg:bottom-7 left-3 right-3 lg:left-1/2 lg:-translate-x-1/2 lg:w-[520px]">
                <TimeSlider times={result.frame_times_min} frame={frame} onFrame={setFrame}
                  playing={playing} onPlaying={setPlaying} rainNow={result.rain_mm_hr[recordIdx] ?? 0} />
              </div>
            )}
          </main>

          <aside className="overflow-y-auto border-l border-line p-3 bg-surface-2">{insights}</aside>

          <div className="lg:hidden p-3">
            <button className="btn-primary w-full" onClick={() => setSetupOpen(true)}>Change the scenario</button>
          </div>
        </div>
      )}

      {(tab === 'compare' || tab === 'model') && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={<div className="grid place-items-center p-10 text-[13px] text-ink-2"><Spinner /></div>}>
            {tab === 'compare'
              ? <CompareView runs={saved} onRemove={(i) => setSaved((s) => s.filter((_, j) => j !== i))} />
              : <ModelTab result={result} />}
          </Suspense>
        </div>
      )}

      {setupOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setSetupOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface-2 p-3 pb-8">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-[15px] font-semibold">Set up a scenario</h2>
              <button className="btn-quiet btn-sm" onClick={() => setSetupOpen(false)}>Close</button>
            </div>
            {setup}
          </div>
        </div>
      )}

      <footer className="shrink-0 px-4 py-1.5 text-[10px] text-ink-3 border-t border-line bg-surface">
        Copernicus DEM · ESA WorldCover · © OpenStreetMap (ODbL) · BBMP wards &amp; Census 2011 (datameet) · Open-Meteo ·
        Esri basemap — decision-support prototype, not an official forecast.
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.6c3.9 3.3 6.2 6.6 6.2 9.8a6.2 6.2 0 1 1-12.4 0c0-3.2 2.3-6.5 6.2-9.8z" fill="#2d7ff9" opacity="0.18" />
      <path d="M12 2.6c3.9 3.3 6.2 6.6 6.2 9.8a6.2 6.2 0 1 1-12.4 0c0-3.2 2.3-6.5 6.2-9.8z" stroke="#0071e3" strokeWidth="1.4" />
      <path d="M8.4 13.6c1 0 1 1 2 1s1-1 2-1 1 1 2 1 1-1 2-1" stroke="#0071e3" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function Legend({ mode }: { mode: MapMode }) {
  const items = mode === 'probability'
    ? [['#d92d20', 'Likely (≥50%)'], ['#c07a00', 'Possible (≥20%)'], ['#1d9a6c', 'Unlikely']]
    : mode === 'depth'
      ? [['#bfdcff', '5 cm'], ['#61a5fa', '30 cm'], ['#1d4ed8', '1 m+']]
      : [['#d92d20', 'Critical ≥30 cm'], ['#c07a00', 'Warning ≥15 cm'], ['#1d9a6c', 'Safe']]
  return (
    <div className="absolute top-14 right-3 lg:top-auto lg:bottom-[104px] card px-2 py-1.5 text-[10px] lg:text-[11px] space-y-0.5 lg:space-y-1">
      {items.map(([c, l]) => (
        <div key={l} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} /> {l}
        </div>
      ))}
      <div className="hidden lg:flex items-center gap-1.5 pt-0.5 border-t border-line mt-1">
        <span className="w-2.5 h-[2px] bg-water" /> Storm drain
      </div>
    </div>
  )
}
