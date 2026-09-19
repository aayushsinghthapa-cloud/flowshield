import { useState } from 'react'
import { aiParseScenario, type ParsedScenario } from '../api'

interface Props {
  onConfirm: (p: ParsedScenario) => void
  busy: boolean
}

const EXAMPLES = [
  '130 mm in 3 hours peaking in hour 2, lakes already full after a week of rain, 40% of drains failed',
  'Cloudburst over Koramangala with the drain near Bellanduru blocked',
  "Run today's live forecast but assume thunderstorms double the peaks",
]

export function AIBadge({ model, latency }: { model: string; latency?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">
      ✦ AI-generated · {model}{latency !== undefined ? ` · ${latency}s` : ''}
    </span>
  )
}

export default function AIScenarioBox({ onConfirm, busy }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedScenario | null>(null)

  async function parse() {
    setLoading(true)
    setError(null)
    setParsed(null)
    try {
      setParsed(await aiParseScenario(text))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const p = parsed?.parsed
  return (
    <section className="rounded-lg border border-violet-500/40 bg-violet-950/20 p-3">
      <h3 className="panel-title !text-violet-300">✦ Describe a scenario (AI)</h3>
      <textarea
        className="w-full h-20 rounded bg-slate-900 border border-slate-700 p-2 text-xs text-slate-100 placeholder:text-slate-500"
        placeholder="e.g. 3-hour storm, 40% drainage failure, drain near HSR Layout blocked…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap gap-1 mb-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="text-[10px] text-violet-300 hover:text-violet-100 underline decoration-dotted text-left"
            onClick={() => setText(ex)}>
            {ex.length > 48 ? ex.slice(0, 48) + '…' : ex}
          </button>
        ))}
      </div>
      <button className="btn-ghost w-full !border-violet-500/60" disabled={loading || text.trim().length < 3} onClick={parse}>
        {loading ? 'Asking Gemini…' : 'Parse with AI'}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">AI unavailable: {error}</p>}
      {p && parsed && (
        <div className="mt-3 space-y-2 text-xs">
          <AIBadge model={parsed.ai.model} latency={parsed.ai.latency_s} />
          <p className="text-slate-200 italic">“{p.summary}”</p>
          <table className="w-full text-[11px]">
            <tbody className="[&_td]:py-0.5">
              {p.profile === 'live_forecast' ? (
                <tr><td className="text-slate-400">Rain</td><td>Live forecast × {p.forecast_peak_factor}</td></tr>
              ) : (
                <>
                  <tr><td className="text-slate-400">Rain</td><td>{p.profile}, peak {p.peak_mm_hr} mm/hr for {p.duration_hr} h</td></tr>
                  {p.profile === 'triangular' && <tr><td className="text-slate-400">Peak at</td><td>{p.peak_at_hr} h</td></tr>}
                </>
              )}
              <tr><td className="text-slate-400">Drain failure</td><td>{Math.round(p.drainage_failure * 100)}%</td></tr>
              <tr><td className="text-slate-400">Lake level</td><td>{Math.round(p.lake_fill * 100)}%</td></tr>
              <tr><td className="text-slate-400">Ground wetness</td><td>{Math.round(p.antecedent_wetness * 100)}%</td></tr>
              <tr><td className="text-slate-400">Blocked</td><td>
                {parsed.blocked_places.length
                  ? parsed.blocked_places.map((b) => `${b.place} (${b.drains} drains)`).join(', ')
                  : 'none'}
              </td></tr>
            </tbody>
          </table>
          {parsed.unknown_places.length > 0 && (
            <p className="text-amber-300">Not on our map, ignored: {parsed.unknown_places.join(', ')}</p>
          )}
          {parsed.clamped.length > 0 && <p className="text-amber-300">Clamped to model range: {parsed.clamped.join('; ')}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-1.5" disabled={busy} onClick={() => onConfirm(parsed)}>
              Confirm & run
            </button>
            <button className="btn-ghost" onClick={() => setParsed(null)}>Discard</button>
          </div>
        </div>
      )}
    </section>
  )
}
