import { useEffect, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { fetchForecast, fmtEta, runEnsemble, type EnsembleResult, type Forecast, type ScenarioParams } from '../api'
import { Section, Slider, Spinner, tooltipStyle } from '../ui'

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
  const [busy, setBusy] = useState(false)
  const [ensErr, setEnsErr] = useState<string | null>(null)

  const load = () => {
    setErr(null)
    fetchForecast().then(setFc).catch((e) => setErr(e.message))
  }
  useEffect(load, [])

  async function ens() {
    setBusy(true)
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
      setBusy(false)
    }
  }

  const next24 = fc ? fc.mm_hr.slice(0, 24) : []
  const total = next24.reduce((a, b) => a + b, 0)
  const risky = ensemble?.wards.filter((w) => w.p_critical > 0).sort((a, b) => b.p_critical - a.p_critical) ?? []

  return (
    <Section title="Live forecast"
      aside={<span className="flex items-center gap-1 text-[11px] text-ink-3">
        <span className="w-1.5 h-1.5 rounded-full bg-crit animate-pulse" />Open-Meteo
      </span>}>
      {err && <p className="text-[12px] text-crit">Forecast unavailable: {err} <button className="underline" onClick={load}>retry</button></p>}
      {!fc && !err && <p className="text-[12px] text-ink-2 flex items-center gap-1.5"><Spinner /> Fetching…</p>}
      {fc && (
        <>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-[22px] font-semibold num leading-none">{total.toFixed(1)}<span className="text-[13px] font-normal text-ink-2"> mm</span></div>
              <div className="text-[11px] text-ink-2">expected in 24 h</div>
            </div>
            <div>
              <div className="text-[15px] font-medium num leading-none">{fc.past_24h_mm}<span className="text-[12px] font-normal text-ink-2"> mm</span></div>
              <div className="text-[11px] text-ink-2">fell in past 24 h</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={44}>
            <BarChart data={next24.map((v, i) => ({ t: fc.times[i]?.slice(11, 16), v }))} margin={{ top: 6, bottom: 0, left: 0, right: 0 }}>
              <XAxis dataKey="t" hide />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} mm/hr`} />
              <Bar dataKey="v" fill="#2d7ff9" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Slider label="Thunderstorm peak factor" value={factor} min={1} max={4} step={0.25}
            fmt={(v) => `x${v}`} onChange={setFactor}
            hint="Forecasts average rain over 9-25 km, which flattens local cloudbursts." />
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button className="btn-quiet" disabled={running} onClick={() => onRunLive(fc, factor, 24)}>Simulate 24 h</button>
            <button className="btn-quiet" disabled={busy} onClick={ens}>
              {busy ? <><Spinner /> 31 runs…</> : 'Chance of flooding'}
            </button>
          </div>
          <p className="text-[10px] text-ink-3 mt-1.5">
            {fc.source} · from {fc.times[0]?.replace('T', ' ')} IST
          </p>
        </>
      )}

      {ensErr && <p className="text-[12px] text-crit mt-2">Could not run the ensemble: {ensErr}</p>}
      {ensemble && (
        <div className="mt-3 pt-3 divider">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-medium">Chance of flooding · next 24 h</span>
            <button className="text-ink-3 hover:text-ink" onClick={() => onEnsemble(null)} aria-label="Clear">✕</button>
          </div>
          {risky.length === 0 ? (
            <p className="text-[12px] text-safe">None of the {ensemble.n_members} forecasts floods any ward. Low risk.</p>
          ) : (
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {risky.map((w) => (
                <li key={w.id} className="flex items-center gap-2">
                  <span className="w-20 truncate text-[12px]">{w.name}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-canvas overflow-hidden">
                    <span className="block h-full rounded-full bg-crit" style={{ width: `${w.p_critical * 100}%` }} />
                  </span>
                  <span className="num text-[11px] w-8 text-right">{Math.round(w.p_critical * 100)}%</span>
                  <span className="num text-[11px] w-12 text-right text-ink-3">{fmtEta(w.eta_median_min)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-ink-3 mt-1.5">
            {ensemble.n_members} forecast members, each simulated · totals {Math.min(...ensemble.member_totals_mm).toFixed(0)}–{Math.max(...ensemble.member_totals_mm).toFixed(0)} mm
          </p>
        </div>
      )}
    </Section>
  )
}
