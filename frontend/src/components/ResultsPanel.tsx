import { useMemo } from 'react'
import {
  Area, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtEta, fmtPop, type SimResult, type WardResult } from '../api'

const STATUS = ['Safe', 'Warning', 'Critical']
const CHIP = ['bg-emerald-500/20 text-emerald-300', 'bg-amber-500/20 text-amber-300', 'bg-red-500/25 text-red-300']

interface Props {
  result: SimResult
  recordIdx: number                // index into times_min for the current frame
  selectedWard: number | null
  onSelectWard: (id: number | null) => void
}

export function StatusChip({ s }: { s: number }) {
  return <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${CHIP[s]}`}>{STATUS[s]}</span>
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-lg font-semibold ${tone ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

export default function ResultsPanel({ result, recordIdx, selectedWard, onSelectWard }: Props) {
  const r = result
  const crit = r.critical_wards
  const peakCrit = Math.max(...r.pop_critical)
  const peakWarn = Math.max(...r.pop_warning)
  const tNow = r.times_min[recordIdx]

  const series = useMemo(
    () =>
      r.times_min.map((t, i) => ({
        t: +(t / 60).toFixed(2),
        rain: r.rain_mm_hr[i],
        critical: r.pop_critical[i],
        warning: r.pop_warning[i],
      })),
    [r],
  )

  const wards = useMemo(() => {
    const rank = (w: WardResult) => (w.eta_min ?? 1e9) + (w.warning_eta_min ?? 1e9) / 1e4
    return [...r.wards].sort((a, b) => rank(a) - rank(b) || b.peak_m - a.peak_m)
  }, [r])

  const sel = r.wards.find((w) => w.id === selectedWard) ?? null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Card label="Critical wards" value={`${crit.length} / ${r.wards.length}`}
          tone={crit.length ? 'text-red-400' : 'text-emerald-400'}
          sub={crit.length ? `first: ${crit[0].name}` : 'none reach critical'} />
        <Card label="Earliest ETA" value={crit.length ? fmtEta(crit[0].eta_min) : '—'}
          tone={crit.length ? 'text-red-400' : undefined} sub="to critical, from rain start" />
        <Card label="People at critical" value={fmtPop(peakCrit)} tone="text-red-300"
          sub={`+${fmtPop(peakWarn)} at warning (peak)`} />
        <Card label="Rain total" value={`${r.total_rain_mm} mm`} sub={`max depth ${r.max_depth_m} m`} />
      </div>

      <div className="rounded-lg bg-slate-800/40 border border-slate-700 p-2">
        <div className="text-xs text-slate-300 mb-1">Rainfall & people affected</div>
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={series} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
            <YAxis yAxisId="p" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => fmtPop(v)} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} width={28} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
              formatter={(v, n) => (n === 'rain' ? `${v} mm/hr` : fmtPop(Number(v)))} labelFormatter={(l) => `T+${l} h`} />
            <Bar yAxisId="r" dataKey="rain" fill="#38bdf8" opacity={0.35} />
            <Area yAxisId="p" dataKey="warning" stroke="#f59e0b" fill="#f59e0b33" type="monotone" />
            <Area yAxisId="p" dataKey="critical" stroke="#ef4444" fill="#ef444444" type="monotone" />
            <ReferenceLine yAxisId="p" x={+(tNow / 60).toFixed(2)} stroke="#e2e8f0" strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {sel && (
        <div className="rounded-lg bg-slate-800/40 border border-slate-600 p-2">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-slate-100 font-medium">{sel.name}</span>
            <button className="text-slate-400 hover:text-slate-100" onClick={() => onSelectWard(null)}>✕</button>
          </div>
          <div className="text-[11px] text-slate-400 mb-1">
            p{r.params.thresholds.ward_percentile} land depth · ETA {fmtEta(sel.eta_min)} · peak {sel.peak_m.toFixed(2)} m ·{' '}
            {fmtPop(sel.pop_critical_peak)} people critical
          </div>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={r.times_min.map((t, i) => ({ t: +(t / 60).toFixed(2), d: sel.metric[i] }))}
              margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                formatter={(v) => `${Number(v).toFixed(2)} m`} labelFormatter={(l) => `T+${l} h`} />
              <ReferenceLine y={r.params.thresholds.critical_m} stroke="#ef4444" strokeDasharray="4 2" />
              <ReferenceLine y={r.params.thresholds.warning_m} stroke="#f59e0b" strokeDasharray="4 2" />
              <ReferenceLine x={+(tNow / 60).toFixed(2)} stroke="#e2e8f0" strokeDasharray="4 2" />
              <Line dataKey="d" stroke="#38bdf8" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <div className="flex justify-between text-xs text-slate-300 mb-1">
          <span>Wards (status now · ETA to critical)</span>
          <span className="text-slate-500">click a row or the map</span>
        </div>
        <div className="max-h-72 overflow-y-auto rounded border border-slate-700">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr>
                <th className="text-left px-2 py-1">Ward</th>
                <th className="px-1">Now</th>
                <th className="px-1">ETA</th>
                <th className="text-right px-2">Crit. pop</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => {
                const s = w.status[recordIdx]
                return (
                  <tr key={w.id}
                    className={`cursor-pointer border-t border-slate-800 hover:bg-slate-800 ${w.id === selectedWard ? 'bg-slate-800' : ''}`}
                    onClick={() => onSelectWard(w.id)}>
                    <td className="px-2 py-1 text-slate-200">
                      {w.name}
                      {w.rising[recordIdx] && <span className="ml-1 text-red-400" title="Rising fast (≥10 cm/hr)">▲</span>}
                    </td>
                    <td className="px-1 text-center"><StatusChip s={s} /></td>
                    <td className={`px-1 text-center font-mono ${w.eta_min !== null ? 'text-red-300' : 'text-slate-500'}`}>
                      {fmtEta(w.eta_min)}
                    </td>
                    <td className="px-2 text-right font-mono text-slate-300">{fmtPop(w.pop_critical_peak)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg bg-slate-800/40 border border-slate-700 p-2">
        <div className="text-xs text-slate-300 mb-1">Lake cascade: tank level (% of storage)</div>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={r.times_min.map((t, i) => {
            const row: Record<string, number> = { t: +(t / 60).toFixed(2) }
            r.lakes.slice(0, 5).forEach((l) => (row[l.name] = Math.round(l.fill[i] * 100)))
            return row
          })} margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="h" />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {r.lakes.slice(0, 5).map((l, i) => (
              <Line key={l.id} dataKey={l.name} dot={false} stroke={['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'][i]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-slate-500 font-mono">
        mass-balance error {r.mass_balance.max_abs_error.toExponential(1)} · {r.steps} steps · {r.runtime_s}s
      </div>
    </div>
  )
}

