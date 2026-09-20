import { useState } from 'react'
import { aiParseScenario, type ParsedScenario } from '../api'
import { AIBadge, Section, Spinner } from '../ui'

interface Props {
  onConfirm: (p: ParsedScenario) => void
  busy: boolean
}

const EXAMPLES = [
  '130 mm in 3 hours, lakes already full, 40% of drains blocked',
  'Cloudburst with the drain near Ejipura blocked',
  "Today's forecast, but assume thunderstorms double the peaks",
]

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
    <Section title="Ask in plain English">
      <textarea className="input h-16 resize-none" placeholder="e.g. heavy storm, half the drains blocked, lakes already full"
        value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="text-[11px] text-accent hover:underline text-left" onClick={() => setText(ex)}>
            {ex.length > 40 ? `${ex.slice(0, 40)}…` : ex}
          </button>
        ))}
      </div>
      <button className="btn-quiet w-full mt-2" disabled={loading || text.trim().length < 3} onClick={parse}>
        {loading ? <><Spinner /> Reading your scenario…</> : 'Turn into a simulation'}
      </button>

      {error && <p className="mt-2 text-[12px] text-crit">AI unavailable: {error}</p>}

      {p && parsed && (
        <div className="mt-3 rounded-[10px] border border-line p-2.5">
          <AIBadge model={parsed.ai.model} latency={parsed.ai.latency_s} provider={parsed.ai.provider} fellBackFrom={parsed.ai.fell_back_from} />
          <p className="text-[12px] italic text-ink-2 mt-1.5">“{p.summary}”</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-ink-2">Rain</dt>
            <dd className="num">{p.profile === 'live_forecast' ? `live forecast x${p.forecast_peak_factor}`
              : `${p.peak_mm_hr} mm/hr peak, ${p.duration_hr} h`}</dd>
            <dt className="text-ink-2">Drains lost</dt><dd className="num">{Math.round(p.drainage_failure * 100)}%</dd>
            <dt className="text-ink-2">Lakes full</dt><dd className="num">{Math.round(p.lake_fill * 100)}%</dd>
            <dt className="text-ink-2">Ground wet</dt><dd className="num">{Math.round(p.antecedent_wetness * 100)}%</dd>
            <dt className="text-ink-2">Blocked</dt>
            <dd>{parsed.blocked_places.length ? parsed.blocked_places.map((b) => `${b.place} (${b.drains})`).join(', ') : 'none'}</dd>
          </dl>
          {parsed.unknown_places.length > 0 && (
            <p className="text-[11px] text-warn mt-1.5">Not on our map, ignored: {parsed.unknown_places.join(', ')}</p>
          )}
          {parsed.clamped.length > 0 && (
            <p className="text-[11px] text-warn mt-1">Adjusted to model limits: {parsed.clamped.join('; ')}</p>
          )}
          <div className="flex gap-2 mt-2.5">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => onConfirm(parsed)}>Run this</button>
            <button className="btn-quiet" onClick={() => setParsed(null)}>Discard</button>
          </div>
        </div>
      )}
    </Section>
  )
}
