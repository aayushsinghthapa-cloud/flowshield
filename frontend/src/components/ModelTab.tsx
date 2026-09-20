import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SimResult } from '../api'
import { axisTick, hourAxis, Section, tooltipStyle } from '../ui'

function Eq({ tex }: { tex: string }) {
  return <div className="overflow-x-auto py-1.5"
    dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: true, throwOnError: false }) }} />
}

const PLAIN = [
  ['Cut the city into squares', 'Each square is 100 m across and knows its height above sea level, how built-up it is, and how many people live there.'],
  ['Add the rain', 'Concrete sheds almost all of it; parks and trees soak most of it up.'],
  ['Let water flow downhill', 'Every few seconds water moves between neighbouring squares, faster on smooth roads and slower through trees.'],
  ['Drains and lakes', 'Street drains carry water to the nearest storm drain or lake. Lakes fill up and, once full, spill into the next lake downstream.'],
  ['Read the depth', '15 cm is hard to walk through, 30 cm floats a car. We report when each ward crosses those marks, and how many people are there.'],
]

const STEPS: { title: string; tex: string; note: string }[] = [
  {
    title: '1 · Rain that actually runs off',
    tex: String.raw`h_i \leftarrow h_i + C_i\,R(t)\,\Delta t, \qquad C_i = 1-(1-\textstyle\sum_k f_{ik} C_k)(1-w)`,
    note: 'C is the runoff coefficient from ESA WorldCover land-cover shares f (built 0.90, bare 0.60, crop/grass 0.35, trees 0.20); w is how wet the ground already is.',
  },
  {
    title: '2 · Storm drains and soaking in',
    tex: String.raw`d_i = \min\!\big(h_i,\; D(1-\phi)\,\Delta t\big),\quad h_i \mathrel{-}= d_i,\quad h_{r(i)} \mathrel{+}= d_i;\qquad \iota_i=\min(h_i, K p_i \Delta t)`,
    note: 'Water leaves a street cell into its nearest mapped drain or lake r(i) — a transfer inside the model, not a loss. φ is the share of drain capacity lost; ι is infiltration on the pervious share p.',
  },
  {
    title: '3 · How fast water moves (Bates et al., 2010)',
    tex: String.raw`q^{n+1}_{i+\frac12} = \frac{q^n_{i+\frac12} - g\,h_f\,\Delta t\,\dfrac{\eta_{i+1}-\eta_i}{\Delta x}}{1 + g\,\Delta t\,n^2\,|q^n_{i+\frac12}|\,/\,h_f^{7/3}},\qquad h_f=\max(\eta_i,\eta_{i+1})-\max(z_i,z_{i+1})`,
    note: 'The local-inertial shallow-water equations: gravity pulls water toward the lower water surface η = z + h, and Manning roughness n slows it down.',
  },
  {
    title: '4 · Nothing is created or lost',
    tex: String.raw`h_i^{n+1} = h_i^n + \frac{\Delta t}{\Delta x}\Big(q_{i-\frac12}-q_{i+\frac12}+q_{j-\frac12}-q_{j+\frac12}\Big)`,
    note: 'Whatever leaves one square enters its neighbour. A limiter stops a square from giving away more water than it holds, so depth can never go negative.',
  },
  {
    title: '5 · Choosing the time step',
    tex: String.raw`\Delta t = \alpha\,\frac{\Delta x}{\sqrt{g\,h_{\max}}},\ \alpha = 0.7;\qquad q_b = \frac{h^{5/3} S_0^{1/2}}{n}`,
    note: 'The CFL condition: deeper water means faster waves, so the step shrinks automatically. At the edge of the map, water leaves at normal depth.',
  },
  {
    title: '6 · The honesty check',
    tex: String.raw`\varepsilon = \frac{\big|\,V(t) - V_0 - V_{\text{rain}} - V_{\text{inflow}} + V_{\text{out}} + V_{\text{inf}}\,\big|}{V_{\text{rain}}}`,
    note: 'Rain in must equal water stored, water that left the map, and water that soaked in. We compute this every run; it stays near 10⁻¹⁴.',
  },
  {
    title: '7 · Turning depth into a warning',
    tex: String.raw`H_w(t)=P_{95}\{h_i(t): i\in w\},\qquad \text{ETA}_w=\min\{t: H_w(t)\ge 0.30\,\text{m}\}`,
    note: 'A ward counts as Critical when 5% of its land is at least 30 cm deep. ETA is the first time that happens, interpolated between 5-minute snapshots.',
  },
  {
    title: '8 · Chance of flooding',
    tex: String.raw`P(\text{ward } w \text{ critical}) = \frac{1}{N}\sum_{m=1}^{N} \mathbf{1}\big[\text{ETA}_w^{(m)} < \infty\big]`,
    note: 'Weather forecasts come as 31 slightly different futures. We simulate every one and count how many flood each ward.',
  },
]

const PARAMS: [string, string, string][] = [
  ['Grid', '147 × 231 cells, 100 m (or 200 m preview), UTM 43N', 'Copernicus GLO-30 DEM'],
  ['Pit filling', 'Priority-flood, hollows kept ≤ 0.5 m', 'Barnes et al. 2014'],
  ['Drains', '1,031 OpenStreetMap ways, cut 2 m into the ground', 'OpenStreetMap'],
  ['Lakes', '116 tanks ≥ 1 ha, 3 m storage, full level = lowest rim point', 'OpenStreetMap'],
  ['Runoff C, roughness n', 'Area-weighted from land cover', 'ESA WorldCover 2021'],
  ['Drain intake D', '20 mm/hr (assumption, tunable)', 'No public data exists'],
  ['Infiltration K', '5 mm/hr × pervious share', 'Assumption'],
  ['Population', 'Census 2011 ward totals, spread by built-up share', 'datameet / BBMP'],
]

const CHECKS = [
  'Closed basin: error below 10⁻⁹ for every storm',
  'Depth never goes negative, even on rough terrain',
  'A still lake stays still — on a test bowl and on the real city with no rain',
  'Even rain on a flat plain stays even; symmetric ground gives symmetric water',
  'Drain transfers and infiltration are accounted for exactly',
  'More blocked drains always means more flooding, never less',
]

const LIMITS = [
  'The elevation data is a 30 m surface model averaged to 100 m, so underpasses and small dips are invisible to it.',
  'Nobody publishes Bengaluru drain capacities, so that number is an assumption you can change.',
  'Population is from Census 2011 and undercounts the city today, so treat people counts as comparative.',
  'Forecast rain is averaged over 9–25 km, which flattens cloudbursts (ERA5 shows just 18.5 mm for 4 Sep 2022 at Bellandur).',
  'The model has not been calibrated against measured flood depths. It is decision support, not an official forecast.',
]

const VALIDATION: [string, string, string][] = [
  ['9 / 10', 'reported places caught', 'the 10th was flagged Warning at 23 cm'],
  ['0.90', 'hit rate (POD)', 'of localities the press named as flooded'],
  ['131.6 mm', 'rainfall used', 'the reported city total for that night'],
]

const VALIDATION_ROWS: [string, string, string, string][] = [
  ['Sarjapur Road', 'Agaram', '95.8 cm', 'hit'],
  ['Silk Board junction', 'BTM Layout', '94.6 cm', 'hit'],
  ['Bellandur / ORR Eco Space', 'Bellanduru', '39.1 cm', 'hit'],
  ['Bommanahalli', 'Bommanahalli', '44.2 cm', 'hit'],
  ['Doddanekkundi', 'Dodda Nekkundi', '106.4 cm', 'hit'],
  ['HSR Layout', 'HSR Layout', '80.8 cm', 'hit'],
  ['Wilson Garden', 'Hombegowda Nagara', '64.2 cm', 'hit'],
  ['ST Bed Layout, Koramangala', 'Koramangala', '96.5 cm', 'hit'],
  ['Varthur', 'Varthuru', '38.8 cm', 'hit'],
  ['Marathahalli, Yemalur', 'Marathahalli', '23.3 cm', 'miss'],
]

export default function ModelTab({ result }: { result: SimResult | null }) {
  const mb = result?.mass_balance
  const maxH = result ? (result.times_min[result.times_min.length - 1] ?? 0) / 60 : 0
  const data = result ? result.times_min.map((t, i) => ({
    t: +(t / 60).toFixed(2),
    rain: mb!.v_in_m3[i] / 1e6,
    out: mb!.v_out_m3[i] / 1e6,
    inf: (mb!.v_inf_m3?.[i] ?? 0) / 1e6,
    stored: (mb!.storage_m3[i] - mb!.storage_m3[0]) / 1e6,
    err: Math.max(Math.abs(mb!.error[i]), 1e-17),
    dt: result.dt_s[i] || null,
  })) : []

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-3">
      <header className="px-1 pt-2">
        <h2 className="text-[26px] font-semibold tracking-tight">How the model works</h2>
        <p className="text-[14px] text-ink-2 mt-1 max-w-2xl">
          FlowShield solves the shallow-water equations over a real map of south-east Bengaluru. Every number in the
          dashboard comes from this simulation, not from a lookup table.
        </p>
      </header>

      <Section title="In plain words">
        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {PLAIN.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-accent-soft text-accent grid place-items-center text-[12px] font-semibold num">{i + 1}</span>
              <div>
                <div className="text-[13px] font-medium">{t}</div>
                <div className="text-[12px] text-ink-2 leading-snug">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-3">
        {STEPS.map((s) => (
          <Section key={s.title}>
            <div className="text-[13px] font-medium text-accent">{s.title}</div>
            <Eq tex={s.tex} />
            <p className="text-[12px] text-ink-2">{s.note}</p>
          </Section>
        ))}
      </div>

      {result && (
        <div className="grid md:grid-cols-2 gap-3">
          <Section title="Where the water went (million m³)">
            <p className="text-[12px] text-ink-2 mb-2">
              Rain in = stored + left the map + soaked in. Largest error this run:{' '}
              <span className="num text-safe">{mb!.max_abs_error.toExponential(2)}</span>.
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data} margin={{ left: -12, right: 8 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="t" tick={axisTick} tickLine={false} axisLine={false} {...hourAxis(maxH)} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toFixed(3)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area dataKey="stored" name="still on the ground" stackId="a" fill="#cfe2ff" stroke="#2d7ff9" />
                <Area dataKey="out" name="left the map" stackId="a" fill="#e6d9fb" stroke="#7c3aed" />
                <Area dataKey="inf" name="soaked in" stackId="a" fill="#d6f0e4" stroke="#1d9a6c" />
                <Line dataKey="rain" name="rain that fell" stroke="#1d1d1f" strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Section>
          <Section title="Error and time step">
            <p className="text-[12px] text-ink-2 mb-2">{result.steps} steps · solver {result.runtime_s}s · {result.cell_m} m cells</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="t" tick={axisTick} tickLine={false} axisLine={false} {...hourAxis(maxH)} />
                <YAxis yAxisId="e" scale="log" domain={[1e-17, 1e-6]} allowDataOverflow tick={axisTick}
                  tickLine={false} axisLine={false} width={52} tickFormatter={(v) => Number(v).toExponential(0)} />
                <YAxis yAxisId="dt" orientation="right" tick={axisTick} tickLine={false} axisLine={false} width={30} unit="s" />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v, n) => (n === 'time step' ? `${v} s` : Number(v).toExponential(2))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="e" dataKey="err" name="mass-balance error" stroke="#1d9a6c" dot={false} />
                <Line yAxisId="dt" dataKey="dt" name="time step" stroke="#c07a00" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Section>
        </div>
      )}


      <Section title="Checked against a real flood · 4–5 Sep 2022">
        <p className="text-[12px] text-ink-2 mb-3 max-w-3xl">
          Bengaluru recorded <b>131.6&nbsp;mm</b> that night, its wettest September day since 2014, onto tanks already
          full after the second wettest August on record. We geocoded the localities the press reported under water,
          found which ward each falls in, and ran the model on that rainfall. Nothing was tuned to match.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          {VALIDATION.map(([v, k, note]) => (
            <div key={k} className="rounded-[10px] bg-canvas p-3">
              <div className="text-[22px] font-semibold num leading-none">{v}</div>
              <div className="text-[12px] font-medium mt-1">{k}</div>
              <div className="text-[11px] text-ink-3 leading-snug mt-0.5">{note}</div>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-ink-2 text-[11px] uppercase tracking-wide text-left">
              <tr><th className="py-1 font-medium">Reported flooded</th><th className="font-medium">Ward</th>
                <th className="font-medium">Model peak</th><th className="font-medium">Verdict</th></tr>
            </thead>
            <tbody>
              {VALIDATION_ROWS.map(([loc, ward, depth, ok]) => (
                <tr key={ward} className="border-t border-line">
                  <td className="py-1.5 pr-3">{loc}</td>
                  <td className="pr-3 text-ink-2">{ward}</td>
                  <td className="num pr-3">{depth}</td>
                  <td className={ok === 'hit' ? 'text-safe' : 'text-warn'}>
                    {ok === 'hit' ? '✓ Critical' : '~ Warning only'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-3 mt-3 leading-snug max-w-3xl">
          <b>Read this honestly.</b> The model also flags 32 wards the press never named. Coverage reports the
          newsworthy, so that is an upper bound on false alarms rather than an error rate — but the model does
          over-predict how far flooding spreads, because rain falls uniformly, drain capacity is a single assumed
          number, and 100&nbsp;m cells cannot drain along a street. Trust the <b>ranking</b> of wards more than the
          absolute headcount. Full method, sources and sensitivity table: <span className="num">docs/validation.md</span>.
        </p>
      </Section>

      <div className="grid md:grid-cols-2 gap-3">
        <Section title="Inputs and settings">
          <table className="w-full text-[12px]">
            <tbody>
              {PARAMS.map(([a, b, c]) => (
                <tr key={a} className="border-t border-line first:border-0">
                  <td className="py-1.5 pr-3 text-ink-2 align-top">{a}</td>
                  <td className="py-1.5 pr-3">{b}</td>
                  <td className="py-1.5 text-ink-3 align-top">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <div className="space-y-3">
          <Section title="Automatic checks (12 tests)">
            <ul className="text-[12px] space-y-1.5">
              {CHECKS.map((c) => (
                <li key={c} className="flex gap-2"><span className="text-safe">✓</span>{c}</li>
              ))}
            </ul>
          </Section>
          <Section title="What this model cannot do">
            <ul className="text-[12px] text-ink-2 space-y-1.5 list-disc pl-4">
              {LIMITS.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
