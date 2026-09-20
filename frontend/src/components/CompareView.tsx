import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtEta, fmtPop, type SimResult } from '../api'
import { axisTick, Section, tooltipStyle } from '../ui'

export interface SavedRun {
  name: string
  result: SimResult
}

const COLORS = ['#0071e3', '#d92d20', '#7c3aed', '#c07a00']

export function describe(r: SimResult): string {
  const p = r.params
  const bits = [p.rain.profile === 'series' ? `live forecast x${p.rain.scale}` : `${p.rain.peak_mm_hr} mm/hr ${p.rain.profile}`]
  if (p.drainage_failure > 0) bits.push(`${Math.round(p.drainage_failure * 100)}% drains lost`)
  if (p.blocked_drains.length) bits.push(`${p.blocked_drains.length} blocked`)
  if (p.lake_fill !== 0.5) bits.push(`lakes ${Math.round(p.lake_fill * 100)}%`)
  return bits.join(' · ')
}

export default function CompareView({ runs, onRemove }: { runs: SavedRun[]; onRemove: (i: number) => void }) {
  if (runs.length === 0) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <h2 className="text-[19px] font-semibold">Nothing to compare yet</h2>
        <p className="text-[13px] text-ink-2 mt-2">
          Run a scenario and press <b>Save</b> in the results panel. Save up to four, then come back here to see which
          wards flood sooner and how many more people are affected. A good pair: a heavy storm, then the same storm with
          the drain near Ejipura blocked.
        </p>
      </div>
    )
  }

  const longest = runs.reduce((a, b) => (b.result.times_min.length > a.result.times_min.length ? b : a)).result
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

  const chart = (key: 'area_critical_km2' | 'pop_critical', title: string, fmt: (v: number) => string) => (
    <Section title={title}>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={series(key)} margin={{ left: -8, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="t" unit="h" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmt} width={52}
            tickCount={4} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `${l} h after rain starts`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {runs.map((r, j) => (
            <Line key={j} dataKey={`r${j}`} name={r.name.length > 28 ? `${r.name.slice(0, 28)}…` : r.name}
              stroke={COLORS[j]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Section>
  )

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-3">
      <Section title="Scenarios">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-ink-2 text-[11px] uppercase tracking-wide">
              <tr className="text-left">
                <th className="py-1.5 font-medium">Scenario</th>
                <th className="font-medium">Rain</th>
                <th className="font-medium">Wards flooded</th>
                <th className="font-medium">First at</th>
                <th className="font-medium">People in deep water</th>
                <th className="font-medium">Flooded area</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.map((r, j) => (
                <tr key={j} className="border-t border-line">
                  <td className="py-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: COLORS[j] }} />
                    {r.name}
                    <div className="text-[11px] text-ink-3 ml-[18px]">{describe(r.result)}</div>
                  </td>
                  <td className="num">{r.result.total_rain_mm} mm</td>
                  <td className="num text-crit">{r.result.critical_wards.length}</td>
                  <td className="num">{fmtEta(r.result.critical_wards[0]?.eta_min ?? null)}</td>
                  <td className="num">{fmtPop(Math.max(...r.result.pop_critical))}</td>
                  <td className="num">{Math.max(...r.result.area_critical_km2).toFixed(2)} km²</td>
                  <td><button className="text-ink-3 hover:text-ink" onClick={() => onRemove(j)} aria-label="Remove">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-3">
        {chart('pop_critical', 'People in deep water over time', fmtPop)}
        {chart('area_critical_km2', 'Flooded area over time (km²)', (v) => v.toFixed(1))}
      </div>

      {wardRows.length > 0 && (
        <Section title="When each ward floods">
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-wide text-ink-2">
                <tr>
                  <th className="text-left py-1.5 font-medium">Ward</th>
                  {runs.map((r, j) => <th key={j} className="font-medium" style={{ color: COLORS[j] }}>{r.name.split(' · ')[0]}</th>)}
                </tr>
              </thead>
              <tbody>
                {wardRows.map((w) => (
                  <tr key={w.id} className="border-t border-line">
                    <td className="py-1.5">{w.name}</td>
                    {w.etas.map((e, j) => (
                      <td key={j} className={`text-center num ${e === null ? 'text-ink-3' : 'text-crit'}`}>{fmtEta(e)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-3 mt-2">“—” means the ward never reaches 30 cm in that scenario.</p>
        </Section>
      )}
    </div>
  )
}
