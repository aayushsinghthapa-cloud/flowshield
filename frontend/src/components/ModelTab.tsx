import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Area, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SimResult } from '../api'

function Eq({ tex }: { tex: string }) {
  return <div className="overflow-x-auto py-1" dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: true, throwOnError: false }) }} />
}

function M({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { throwOnError: false }) }} />
}

const STEPS: { title: string; tex: string; note: string }[] = [
  {
    title: '1 · Effective rainfall (rational method)',
    tex: String.raw`h_i \leftarrow h_i + C_i\,R(t)\,\Delta t, \qquad C_i = 1-(1-\textstyle\sum_k f_{ik} C_k)(1-w)`,
    note: 'C from ESA WorldCover fractions f (built 0.90, bare 0.60, crop/grass 0.35, trees 0.20); w = antecedent wetness.',
  },
  {
    title: '2 · Storm-drain transfer and infiltration',
    tex: String.raw`d_i = \min\!\big(h_i,\; D(1-\phi)\,\Delta t\big),\quad h_i \mathrel{-}= d_i,\quad h_{r(i)} \mathrel{+}= d_i;\qquad \iota_i=\min(h_i, K p_i \Delta t)`,
    note: 'Water leaves street cells into the nearest mapped drain/lake r(i) (a transfer, not a loss); φ = drainage failure; ι = ponded infiltration on pervious fraction p.',
  },
  {
    title: '3 · Local-inertial momentum (Bates et al., 2010)',
    tex: String.raw`q^{n+1}_{i+\frac12} = \frac{q^n_{i+\frac12} - g\,h_f\,\Delta t\,\dfrac{\eta_{i+1}-\eta_i}{\Delta x}}{1 + g\,\Delta t\,n^2\,|q^n_{i+\frac12}|\,/\,h_f^{7/3}},\qquad h_f=\max(\eta_i,\eta_{i+1})-\max(z_i,z_{i+1})`,
    note: 'Shallow-water equations without advection; η = z + h is the water surface, n is Manning roughness from land cover. |q| is capped at Froude 1.',
  },
  {
    title: '4 · Continuity (exactly conservative flux form)',
    tex: String.raw`h_i^{n+1} = h_i^n + \frac{\Delta t}{\Delta x}\Big(q_{i-\frac12}-q_{i+\frac12}+q_{j-\frac12}-q_{j+\frac12}\Big)`,
    note: 'A positivity limiter scales each cell’s outgoing fluxes so it never gives more than it holds, so h ≥ 0 and volume is conserved.',
  },
  {
    title: '5 · Stability (CFL) and open boundary',
    tex: String.raw`\Delta t = \alpha\,\frac{\Delta x}{\sqrt{g\,h_{\max}}},\ \alpha = 0.7;\qquad q_b = \frac{h^{5/3} S_0^{1/2}}{n}\ \text{(normal-depth outflow at edges)}`,
    note: 'Lakes on the boundary are closed; tanks spill over their weir first.',
  },
  {
    title: '6 · Mass balance (checked every run)',
    tex: String.raw`\varepsilon = \frac{\big|\,V(t) - V_0 - V_{\text{rain}} - V_{\text{inflow}} + V_{\text{out}} + V_{\text{inf}}\,\big|}{V_{\text{rain}}}`,
    note: 'Float64 arithmetic; typical ε ≈ 10⁻¹⁴ on the real grid.',
  },
  {
    title: '7 · Risk classification and early warning',
    tex: String.raw`\text{status}_i=\begin{cases}\text{Critical} & h_i \ge 0.30\text{ m}\\ \text{Warning} & h_i \ge 0.15\text{ m}\\ \text{Safe}\end{cases}\qquad H_w(t)=P_{95}\{h_i(t): i\in w,\ \text{land}\},\quad \text{ETA}_w=\min\{t: H_w(t)\ge 0.30\}`,
    note: 'Thresholds follow US NWS guidance (15 cm moving water knocks adults over; 30 cm floats cars). A ward is Critical when ≥5% of its land area is ≥30 cm. ETA is linearly interpolated between 5-min records.',
  },
  {
    title: '8 · Probabilistic forecast',
    tex: String.raw`P(\text{ward } w \text{ critical}) = \frac{1}{N}\sum_{m=1}^{N} \mathbf{1}\big[\text{ETA}_w^{(m)} < \infty\big]`,
    note: 'The engine runs once per Open-Meteo ensemble member (GFS, N = 31) on a 200 m aggregated grid.',
  },
]

const PARAMS: [string, string, string][] = [
  ['Grid', '147 × 231 cells, Δx = 100 m (UTM 43N)', 'Copernicus GLO-30 DEM'],
  ['Depression conditioning', 'Priority-flood, pits kept ≤ 0.5 m', 'Barnes et al. 2014'],
  ['Drains', '1,031 OSM ways, burned 2 m below ground', 'OpenStreetMap'],
  ['Lakes', '116 tanks ≥ 1 ha, 3 m storage, full level = lowest rim point', 'OpenStreetMap'],
  ['Runoff C / Manning n', 'Area-weighted by land cover', 'ESA WorldCover 2021'],
  ['Drain intake capacity D', '20 mm/hr (tunable, no public data)', 'Assumption'],
  ['Ponded infiltration K', '5 mm/hr × pervious fraction', 'Assumption'],
  ['Population', 'Census 2011 ward totals, spread by built-up share', 'datameet / BBMP'],
  ['Wards', '72 BBMP wards (2012 boundaries) ≥ 50% inside the domain', 'datameet / KGIS'],
]

const LIMITS = [
  'The DEM is a 30 m surface model averaged to 100 m. Underpasses and street-scale dips are not resolved.',
  'Storm-drain capacities are not public. D is a single tunable value, and the pipe network is abstracted as "nearest mapped drain".',
  'Census 2011 population undercounts today’s city. Treat affected-population numbers as relative, not absolute.',
  'Forecast and reanalysis rain come from 9–25 km model grids and underestimate cloudbursts (ERA5 shows 18.5 mm on 4 Sep 2022 at Bellandur).',
  'Not calibrated against observed flood depths. This is a decision-support prototype, not an official forecast.',
]

export default function ModelTab({ result }: { result: SimResult | null }) {
  const mb = result?.mass_balance
  const mbSeries = result
    ? result.times_min.map((t, i) => ({
        t: +(t / 60).toFixed(2),
        rain: mb!.v_in_m3[i] / 1e6,
        out: mb!.v_out_m3[i] / 1e6,
        inf: (mb!.v_inf_m3?.[i] ?? 0) / 1e6,
        stored: (mb!.storage_m3[i] - mb!.storage_m3[0]) / 1e6,
        err: Math.max(Math.abs(mb!.error[i]), 1e-17),
        dt: result.dt_s[i] || null,
      }))
    : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header>
          <h2 className="text-xl font-semibold">The mathematical model</h2>
          <p className="text-sm text-slate-400 mt-1">
            A 2-D shallow-water flood model on a real Bengaluru grid. Each 100 m cell exchanges water with its four
            neighbours; every quantity below is computed in vectorised NumPy each time step.
          </p>
        </header>

        <div className="grid gap-3">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="text-sm font-medium text-sky-300">{s.title}</div>
              <Eq tex={s.tex} />
              <p className="text-xs text-slate-400">{s.note}</p>
            </div>
          ))}
        </div>

        {result && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="text-sm font-medium">Volume budget for the current run (million m³)</div>
              <p className="text-xs text-slate-400 mb-2">
                Rain in = storage change + boundary outflow + infiltration. Max relative error{' '}
                <span className="font-mono text-emerald-300">{mb!.max_abs_error.toExponential(2)}</span>.
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={mbSeries} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                  <XAxis dataKey="t" unit="h" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                    formatter={(v) => Number(v).toFixed(3)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area dataKey="stored" name="Δ storage" stackId="a" fill="#38bdf855" stroke="#38bdf8" />
                  <Area dataKey="out" name="outflow" stackId="a" fill="#a78bfa55" stroke="#a78bfa" />
                  <Area dataKey="inf" name="infiltration" stackId="a" fill="#34d39955" stroke="#34d399" />
                  <Line dataKey="rain" name="rain in" stroke="#f8fafc" strokeDasharray="5 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div className="text-sm font-medium">Mass-balance error and adaptive time step</div>
              <p className="text-xs text-slate-400 mb-2">{result.steps} steps · solver time {result.runtime_s}s</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mbSeries} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                  <XAxis dataKey="t" unit="h" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis yAxisId="e" scale="log" domain={[1e-17, 1e-6]} tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v) => Number(v).toExponential(0)} allowDataOverflow />
                  <YAxis yAxisId="dt" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} unit="s" />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
                    formatter={(v, n) => (n === 'Δt' ? `${v} s` : Number(v).toExponential(2))} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="e" dataKey="err" name="relative error" stroke="#34d399" dot={false} />
                  <Line yAxisId="dt" dataKey="dt" name="Δt" stroke="#fbbf24" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-sm font-medium mb-2">Inputs and parameters</div>
            <table className="w-full text-xs">
              <tbody>
                {PARAMS.map(([a, b, c]) => (
                  <tr key={a} className="border-t border-slate-800">
                    <td className="py-1 pr-2 text-slate-300">{a}</td><td className="pr-2">{b}</td>
                    <td className="text-slate-500">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-sm font-medium mb-2">Verified properties (automated tests)</div>
            <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
              <li>Closed basin: <M tex="\varepsilon < 10^{-9}" /> for every storm</li>
              <li>Depth never negative (positivity limiter)</li>
              <li>Lake at rest stays at rest (well-balanced), on synthetic and real terrain</li>
              <li>Uniform rain on a flat plane stays uniform; symmetric inputs give symmetric outputs</li>
              <li>Drain transfer and infiltration are accounted exactly</li>
              <li>More drainage failure or blocked drains mean more flooding (monotonic response)</li>
            </ul>
            <div className="text-sm font-medium mt-4 mb-2">Assumptions and limitations</div>
            <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
              {LIMITS.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
