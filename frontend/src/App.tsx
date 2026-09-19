import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_PARAMS, fetchCity, fmtPop, runSimulation, type City, type ScenarioParams, type SimResult } from './api'
import MapView, { type MapMode } from './components/MapView'
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

  const run = useCallback(async (p: ScenarioParams) => {
    setRunning(true)
    setError(null)
    setPlaying(false)
    try {
      const r = await runSimulation(p)
      setResult(r)
      setFrame(0)
      setPlaying(true)
    } catch (e) {
      setError(`Simulation failed: ${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }, [])

  useEffect(() => {
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
              {t}
            </button>
          ))}
        </nav>
        {error && <div className="ml-auto text-xs text-red-300 bg-red-950/60 border border-red-800 rounded px-2 py-1">{error}</div>}
      </header>

      {tab === 'simulator' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="lg:w-72 shrink-0 overflow-y-auto border-r border-slate-800 p-4 bg-slate-900/60">
            <ScenarioPanel city={city} params={params} onChange={setParams} onRun={() => run(params)}
              running={running} blockMode={blockMode} onBlockMode={setBlockMode} />
          </aside>

          <main className="relative flex-1 min-h-[420px]">
            <MapView city={city} result={result} frame={frame} mode={mode} blocked={params.blocked_drains}
              blockMode={blockMode} onToggleDrain={toggleDrain} selectedWard={selectedWard}
              onSelectWard={setSelectedWard} wardStatus={wardStatus} />
            <div className="absolute top-3 left-3 flex gap-1 rounded-md bg-slate-900/90 p-1 border border-slate-700 text-xs">
              {(['status', 'depth'] as MapMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-2 py-1 rounded capitalize ${mode === m ? 'bg-slate-700' : 'text-slate-400'}`}>
                  {m === 'status' ? 'Risk status' : 'Water depth'}
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
              <ResultsPanel result={result} recordIdx={recordIdx} selectedWard={selectedWard}
                onSelectWard={setSelectedWard} />
            ) : (
              <p className="text-sm text-slate-400">Run a simulation to see ward risk, ETAs and affected population.</p>
            )}
          </aside>
        </div>
      )}

      {tab !== 'simulator' && (
        <div className="flex-1 grid place-items-center text-slate-400 text-sm">Coming next.</div>
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
