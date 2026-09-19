import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtEta, fmtPop, type SimResult } from '../api'

export interface SavedRun {
  name: string
  result: SimResult
}

const COLORS = ['#38bdf8', '#f43f5e', '#a78bfa', '#fbbf24']

export function describe(r: SimResult): string {
  const p = r.params
  const rain = p.rain.profile === 'series' ? `live ×${p.rain.scale}` : `${p.rain.profile} ${p.rain.peak_mm_hr} mm/hr`
  const bits = [rain]
  if (p.drainage_failure > 0) bits.push(`${Math.round(p.drainage_failure * 100)}% drain fail`)
  if (p.blocked_drains.length) bits.push(`${p.blocked_drains.length} blocked`)
  if (p.lake_fill !== 0.5) bits.push(`lakes ${Math.round(p.lake_fill * 100)}%`)
  return bits.join(' · ')
}

export default function CompareView({ runs, onRemove }: { runs: SavedRun[]; onRemove: (i: number) => void }) {
  if (runs.length === 0) {
    return (
      <div className="p-8 text-sm text-slate-400 max-w-xl">
        No saved runs yet. In the Simulator, run a scenario and press <b>Save to compare</b> (up to 4). Try a heavy
        storm, then the same storm with a blocked drain or 50% drainage failure.
      </div>
    )
  }
  const maxLen = Math.max(...runs.map((r) => r.result.times_min.length))
  const longest = runs.find((r) => r.result.times_min.length === maxLen)!.result
  const series = (key: 'area_critical_km2' | 'pop_critical') =>
    longest.times_min.map((t, i) => {
      const row: Record<string, number> = { t: +(t / 60).toFixed(2) }
      runs.forEach((r, j) => {
        const v = r.result[key][i]
        if (v !== undefined) row[`r${j}`] = v
      })
      return row
    })

  const wardIds = new Set<number>()
  runs.forEach((r) => r.result.critical_wards.forEach((w) => wardIds.add(w.id)))
  const wardRows = [...wardIds].map((id) => {
    const etas = runs.map((r) => r.result.wards.find((w) => w.id === id)?.eta_min ?? null)
    const name = runs.map((r) => r.result.wards.find((w) => w.id === id)?.name).find(Boolean) ?? String(id)
    return { id, name, etas, first: Math.min(...etas.map((e) => e ?? 1e9)) }
  }).sort((a, b) => a.first - b.first)

  const chart = (key: 'area_critical_km2' | 'pop_critical', label: string, fmt: (v: number) => string) => (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700 p-3">
      <div className="text-sm text-slate-200 mb-2">{label}</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={series(key)} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis dataKey="t" unit="h" tick={{ fontSize: 11, fill: '#94a3b8' }} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmt} />
          <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
            formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `T+${l} h`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {runs.map((r, j) => (
            <Line key={j} dataKey={`r${j}`} name={r.name} stroke={COLORS[j]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <table className="w-full text-sm">
        <thead className="text-slate-400 text-xs">
          <tr className="text-left">
            <th className="py-1">Scenario</th><th>Rain</th><th>Critical wards</th><th>Earliest ETA</th>
            <th>Peak people critical</th><th>Peak critical area</th><th>Mass error</th><th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r, j) => {
            const res = r.result
            return (
              <tr key={j} className="border-t border-slate-800">
                <td className="py-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: COLORS[j] }} />
                  <span className="text-slate-100">{r.name}</span>
                  <div className="text-[11px] text-slate-500 ml-4">{describe(res)}</div></td>
                <td>{res.total_rain_mm} mm</td>
                <td className="text-red-300">{res.critical_wards.length}</td>
                <td className="font-mono">{fmtEta(res.critical_wards[0]?.eta_min ?? null)}</td>
                <td className="font-mono">{fmtPop(Math.max(...res.pop_critical))}</td>
                <td className="font-mono">{Math.max(...res.area_critical_km2).toFixed(2)} km²</td>
                <td className="font-mono text-xs text-slate-400">{res.mass_balance.max_abs_error.toExponential(1)}</td>
                <td><button className="text-slate-500 hover:text-slate-200" onClick={() => onRemove(j)}>✕</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="grid lg:grid-cols-2 gap-4">
        {chart('area_critical_km2', 'Critical area over time (km²)', (v) => v.toFixed(1))}
        {chart('pop_critical', 'People in critical cells over time', fmtPop)}
      </div>

      {wardRows.length > 0 && (
        <div className="rounded-lg bg-slate-800/40 border border-slate-700 p-3">
          <div className="text-sm text-slate-200 mb-2">Time to critical by ward</div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 sticky top-0 bg-slate-900">
                <tr><th className="text-left py-1">Ward</th>{runs.map((r, j) => <th key={j} style={{ color: COLORS[j] }}>{r.name}</th>)}</tr>
              </thead>
              <tbody>
                {wardRows.map((w) => (
                  <tr key={w.id} className="border-t border-slate-800">
                    <td className="py-1 text-slate-200">{w.name}</td>
                    {w.etas.map((e, j) => (
                      <td key={j} className={`text-center font-mono ${e === null ? 'text-slate-600' : 'text-red-300'}`}>{fmtEta(e)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
