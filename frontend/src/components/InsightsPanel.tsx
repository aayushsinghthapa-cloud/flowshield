import { useMemo, useState } from 'react'
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmtEta, fmtPop, type SimResult, type WardResult } from '../api'
import { download, wardCsv } from '../lib/exportCsv'
import { copyLink } from '../lib/share'
import { axisTick, Section, StatusChip, tooltipStyle } from '../ui'

interface Props {
  result: SimResult
  recordIdx: number
  selectedWard: number | null
  onSelectWard: (id: number | null) => void
  runLabel: string
  onSave: () => void
  saved: boolean
}

const TONE = ['text-safe', 'text-warn', 'text-crit']
const BAR = ['bg-safe', 'bg-warn', 'bg-crit']

export default function InsightsPanel({ result: r, recordIdx, selectedWard, onSelectWard, runLabel, onSave, saved }: Props) {
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const crit = r.critical_wards
  const peakCrit = Math.max(...r.pop_critical)
  const peakWarn = Math.max(...r.pop_warning)
  const nowCrit = r.pop_critical[recordIdx] ?? 0
  const tNow = r.times_min[recordIdx]
  const severity = crit.length ? 2 : peakWarn > 0 ? 1 : 0

  const series = useMemo(() => r.times_min.map((t, i) => ({
    t: +(t / 60).toFixed(2),
    rain: r.rain_mm_hr[i],
    warning: r.pop_warning[i],
    critical: r.pop_critical[i],
  })), [r])

  const wards = useMemo(() => {
    const rank = (w: WardResult) => (w.eta_min ?? 1e9) + (w.warning_eta_min ?? 1e9) / 1e4
    return [...r.wards]
      .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => rank(a) - rank(b) || b.peak_m - a.peak_m)
  }, [r, query])

  const lakes = r.lakes.slice(0, 5)

  return (
    <>
      <Section>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">{runLabel}</p>
            <h2 className={`text-[26px] leading-tight font-semibold tracking-tight ${TONE[severity]}`}>
              {crit.length ? `${crit.length} ward${crit.length > 1 ? 's' : ''} flood` : peakWarn > 0 ? 'Streets waterlogged' : 'No flooding'}
            </h2>
            <p className="text-[13px] text-ink-2 mt-0.5">
              {crit.length
                ? <>First <b className="text-ink">{crit[0].name}</b> in <b className="text-ink num">{fmtEta(crit[0].eta_min)}</b> after the rain starts</>
                : peakWarn > 0 ? 'Water stays below 30 cm everywhere' : 'Drains and lakes cope with this storm'}
            </p>
          </div>
          <button className="btn-quiet btn-sm shrink-0" onClick={onSave} disabled={saved}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Stat label="People at risk" value={fmtPop(peakCrit + peakWarn)} sub={`${fmtPop(peakCrit)} in deep water`} />
          <Stat label="Rain total" value={`${r.total_rain_mm}`} sub="mm" />
          <Stat label="Deepest" value={`${Math.round(r.max_depth_m * 100)}`} sub="cm on land" />
        </div>
      </Section>

      <Section title="People affected over time"
        aside={<span className="text-[11px] text-ink-3 num">now {fmtPop(nowCrit)}</span>}>
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={series} margin={{ left: -14, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="t" tick={axisTick} unit="h" tickLine={false} axisLine={false} />
            <YAxis yAxisId="p" tick={axisTick} tickLine={false} axisLine={false} width={40} tickCount={4}
              allowDecimals={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
            <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={28}
              tickCount={4} allowDecimals={false} unit=" mm" />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => `${l} h after rain starts`}
              formatter={(v, n) => [n === 'rain' ? `${v} mm/hr` : fmtPop(Number(v)), n === 'rain' ? 'Rain' : n === 'critical' ? 'Deep water' : 'Waterlogged']} />
            <Bar yAxisId="r" dataKey="rain" fill="#cfe2ff" radius={[2, 2, 0, 0]} />
            <Area yAxisId="p" dataKey="warning" stroke="#c07a00" fill="#f6dfb3" type="monotone" strokeWidth={1.5} />
            <Area yAxisId="p" dataKey="critical" stroke="#d92d20" fill="#f7c9c5" type="monotone" strokeWidth={1.5} />
            <ReferenceLine yAxisId="p" x={+(tNow / 60).toFixed(2)} stroke="#1d1d1f" strokeDasharray="3 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </Section>

      <Section title={`Wards · ${crit.length} critical`}
        aside={<input className="input !py-1 !text-[12px] w-28" placeholder="Search…" value={query}
          onChange={(e) => setQuery(e.target.value)} />}>
        <div className="max-h-[300px] overflow-y-auto -mx-1 px-1">
          {wards.map((w) => {
            const s = w.status[recordIdx]
            const on = w.id === selectedWard
            return (
              <div key={w.id}>
                <button onClick={() => onSelectWard(on ? null : w.id)}
                  className={`w-full flex items-center gap-2 py-1.5 px-1 rounded-lg text-left hover:bg-canvas ${on ? 'bg-canvas' : ''}`}>
                  <span className="flex-1 min-w-0 truncate text-[13px]">
                    {w.name}
                    {w.rising[recordIdx] && <span className="ml-1 text-crit" title="Rising fast (10 cm/hr or more)">▲</span>}
                  </span>
                  <StatusChip s={s} />
                  <span className={`num text-[12px] w-14 text-right ${w.eta_min !== null ? 'text-crit' : 'text-ink-3'}`}>
                    {fmtEta(w.eta_min)}
                  </span>
                  <span className="num text-[12px] w-12 text-right text-ink-2">{fmtPop(w.pop_critical_peak)}</span>
                </button>
                {on && (
                  <div className="px-1 pb-2">
                    <p className="text-[11px] text-ink-2 mb-1">
                      Water depth in the worst 5% of this ward · peak {Math.round(w.peak_m * 100)} cm ·{' '}
                      {fmtPop(w.pop_critical_peak)} people in deep water
                    </p>
                    <ResponsiveContainer width="100%" height={96}>
                      <LineChart data={r.times_min.map((t, i) => ({ t: +(t / 60).toFixed(2), d: w.metric[i] }))}
                        margin={{ left: -24, right: 4, top: 2, bottom: 0 }}>
                        <CartesianGrid stroke="var(--color-line)" vertical={false} />
                        <XAxis dataKey="t" tick={axisTick} unit="h" tickLine={false} axisLine={false} />
                        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={34}
                          tickFormatter={(v) => `${Math.round(v * 100)}`} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(Number(v) * 100)} cm`}
                          labelFormatter={(l) => `${l} h`} />
                        <ReferenceLine y={r.params.thresholds.critical_m} stroke="#d92d20" strokeDasharray="3 3" />
                        <ReferenceLine y={r.params.thresholds.warning_m} stroke="#c07a00" strokeDasharray="3 3" />
                        <ReferenceLine x={+(tNow / 60).toFixed(2)} stroke="#1d1d1f" strokeDasharray="3 3" />
                        <Line dataKey="d" stroke="#0071e3" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )
          })}
          {wards.length === 0 && <p className="text-[12px] text-ink-3 py-2">No ward matches “{query}”.</p>}
        </div>
      </Section>

      <Section title="Lake cascade" aside={<span className="text-[11px] text-ink-3">at {fmtEta(tNow)}</span>}>
        <div className="space-y-2">
          {lakes.map((l) => {
            const fill = l.fill[recordIdx] ?? 0
            const spilling = fill >= 1
            return (
              <div key={l.id} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[12px]">{l.name.replace(' Lake', '')}</span>
                <span className="flex-1 h-2 rounded-full bg-canvas overflow-hidden">
                  <span className={`block h-full rounded-full ${spilling ? BAR[2] : 'bg-water'}`}
                    style={{ width: `${Math.min(fill, 1) * 100}%` }} />
                </span>
                <span className={`num text-[11px] w-16 text-right ${spilling ? 'text-crit' : 'text-ink-2'}`}>
                  {spilling ? 'spilling' : `${Math.round(fill * 100)}%`}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-ink-3 mt-2">
          Each tank overflows into the next one downstream. When a tank is full, the extra water goes into the streets.
        </p>
      </Section>

      <div className="flex items-center gap-2 px-1">
        <button className="btn-ghost btn-sm" onClick={() => download(`flowshield-wards-${r.run_id}.csv`, wardCsv(r))}>
          Download CSV
        </button>
        <button className="btn-ghost btn-sm" onClick={async () => { setCopied(await copyLink()); setTimeout(() => setCopied(false), 1500) }}>
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <span className="ml-auto num text-[10px] text-ink-3" title="Water in = water stored + drained away. This is the numerical error.">
          mass error {r.mass_balance.max_abs_error.toExponential(0)}
        </span>
      </div>
      {r.cell_m === 200 && (
        <p className="text-[11px] text-warn px-1">
          Fast preview (200 m cells). Switch to Detailed for the numbers you quote.
        </p>
      )}
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[10px] bg-canvas px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-3">{label}</div>
      <div className="text-[19px] font-semibold leading-tight num">{value}</div>
      <div className="text-[11px] text-ink-2 leading-tight">{sub}</div>
    </div>
  )
}
