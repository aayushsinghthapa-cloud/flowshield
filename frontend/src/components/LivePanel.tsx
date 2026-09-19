import { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { fetchForecast, fmtEta, runEnsemble, type EnsembleResult, type Forecast, type ScenarioParams } from '../api'
import { Slider } from './ScenarioPanel'

interface Props {
  params: ScenarioParams
  onRunLive: (f: Forecast, factor: number, hours: number) => void
  ensemble: EnsembleResult | null
  onEnsemble: (e: EnsembleResult | null) => void
  running: boolean
}

export default function LivePanel({ params, onRunLive, ensemble, onEnsemble, running }: Props) {
  const [fc, setFc] = useState<Forecast | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [factor, setFactor] = useState(1)
  const [ensBusy, setEnsBusy] = useState(false)
  const [ensErr, setEnsErr] = useState<string | null>(null)

  const load = () => {
    setErr(null)
    fetchForecast().then(setFc).catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  async function ens() {
    setEnsBusy(true)
    setEnsErr(null)
    try {
      onEnsemble(await runEnsemble({
        model: 'gfs025', hours: 24, peak_factor: factor,
        drainage_failure: params.drainage_failure, lake_fill: params.lake_fill,
        antecedent_wetness: fc ? Math.min(1, fc.past_24h_mm / 40) : params.antecedent_wetness,
        blocked_drains: params.blocked_drains,
      }))
    } catch (e) {
      setEnsErr((e as Error).message)
    } finally {
      setEnsBusy(false)
    }
  }

  const next24 = fc ? fc.mm_hr.slice(0, 24) : []
  return (
    <section className="rounded-lg border border-sky-500/40 bg-sky-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="panel-title !mb-0 !text-sky-300">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1.5" />Live forecast
        </h3>
        <button className="text-[10px] text-slate-400 hover:text-slate-100" onClick={load}>refresh</button>
      </div>
      {err && <p className="text-xs text-red-300">Forecast unavailable: {err}</p>}
      {!fc && !err && <p className="text-xs text-slate-400">Fetching Open-Meteo…</p>}
      {fc && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><div className="text-slate-400">Next 24 h</div>
              <div className="font-semibold">{next24.reduce((a, b) => a + b, 0).toFixed(1)} mm</div></div>
            <div><div className="text-slate-400">Past 24 h</div>
              <div className="font-semibold">{fc.past_24h_mm} mm</div></div>
          </div>
          <ResponsiveContainer width="100%" height={50}>
            <BarChart data={next24.map((v, i) => ({ t: fc.times[i]?.slice(11, 16), v }))} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <XAxis dataKey="t" hide />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }}
                formatter={(v) => `${v} mm/hr`} />
              <Bar dataKey="v" fill="#38bdf8" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-500">
            {fc.source} · from {fc.times[0]?.replace('T', ' ')} IST · fetched {fc.fetched_at.slice(11, 16)}
          </p>
          <Slider label="Thunderstorm peak factor" value={factor} min={1} max={4} step={0.25}
            fmt={(v) => `×${v}`} onChange={setFactor}
            hint="Forecast models average rain over 9–25 km cells, which flattens local cloudbursts. Scale peaks to stress-test." />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost !border-sky-500/60" disabled={running} onClick={() => onRunLive(fc, factor, 24)}>
              Simulate next 24 h
            </button>
            <button className="btn-ghost !border-sky-500/60" disabled={ensBusy} onClick={ens}>
              {ensBusy ? 'Running 31 members…' : 'Ensemble risk'}
            </button>
          </div>
        </>
      )}
      {ensErr && <p className="text-xs text-red-300">Ensemble failed: {ensErr}</p>}
      {ensemble && (
        <div className="text-xs space-y-1">
          <div className="flex justify-between text-slate-300">
            <span>P(ward critical in 24 h) · {ensemble.n_members} members ×{ensemble.peak_factor}</span>
            <button className="text-slate-400 hover:text-slate-100" onClick={() => onEnsemble(null)}>✕</button>
          </div>
          {ensemble.wards.filter((w) => w.p_critical > 0).length === 0 ? (
            <p className="text-emerald-300">No member takes any ward to Critical. Low flood risk in the next 24 h.</p>
          ) : (
            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
              {[...ensemble.wards].filter((w) => w.p_critical > 0).sort((a, b) => b.p_critical - a.p_critical).map((w) => (
                <li key={w.id} className="flex items-center gap-2">
                  <span className="w-28 truncate text-slate-200">{w.name}</span>
                  <span className="flex-1 h-2 rounded bg-slate-800 overflow-hidden">
                    <span className="block h-full bg-red-500" style={{ width: `${w.p_critical * 100}%` }} />
                  </span>
                  <span className="w-9 text-right font-mono">{Math.round(w.p_critical * 100)}%</span>
                  <span className="w-14 text-right font-mono text-slate-400" title="median ETA among members">{fmtEta(w.eta_median_min)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-500">{ensemble.source} · 200 m grid · member totals {Math.min(...ensemble.member_totals_mm).toFixed(0)}–{Math.max(...ensemble.member_totals_mm).toFixed(0)} mm</p>
        </div>
      )}
    </section>
  )
}
