import { useEffect, useState } from 'react'
import { aiBulletin, type BulletinResult, type EnsembleResult, type SimResult } from '../api'
import { AIBadge } from './AIScenarioBox'

const SEV: Record<string, string> = {
  'ALL CLEAR': 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
  WATCH: 'bg-sky-500/20 text-sky-200 border-sky-500/50',
  WARNING: 'bg-amber-500/20 text-amber-200 border-amber-500/50',
  'SEVERE WARNING': 'bg-red-500/20 text-red-200 border-red-500/60',
}

export default function BulletinPanel({ result, ensemble }: { result: SimResult; ensemble: EnsembleResult | null }) {
  const [b, setB] = useState<BulletinResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<'en' | 'kn'>('en')

  useEffect(() => {
    setB(null)
    setError(null)
  }, [result.run_id])

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      setB(await aiBulletin(result, ensemble))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-lg border border-violet-500/40 bg-violet-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="panel-title !mb-0 !text-violet-300">✦ Early-warning bulletin</h3>
        <button className="btn-ghost !border-violet-500/60" onClick={generate} disabled={loading}>
          {loading ? 'Writing…' : b ? 'Regenerate' : 'Generate with AI'}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">AI unavailable, so no bulletin was generated: {error}</p>}
      {!b && !error && !loading && (
        <p className="text-[11px] text-slate-400">
          Gemini writes an authority advisory and a public SMS alert (English + ಕನ್ನಡ) from this run's numbers only
          {ensemble ? ', including the ensemble probabilities' : ''}.
        </p>
      )}
      {b && (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <AIBadge model={b.ai.model} latency={b.ai.latency_s} />
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${b.grounding.ok ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}
              title="Every number in the bulletin is checked against the simulation output sent to the model.">
              {b.grounding.ok
                ? `✓ ${b.grounding.numbers_checked} numbers verified against simulation`
                : `⚠ unverified numbers: ${b.grounding.unverified.join(', ')}`}
            </span>
          </div>
          <div className={`rounded border px-2 py-1.5 font-semibold ${SEV[b.bulletin.severity] ?? SEV.WATCH}`}>
            {b.bulletin.severity}: {b.bulletin.headline}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">For authorities</div>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-200">
              {b.bulletin.authority_advisory.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Public alert</span>
              {(['en', 'kn'] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)}
                  className={`text-[11px] px-1.5 rounded ${lang === l ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                  {l === 'en' ? 'English' : 'ಕನ್ನಡ'}
                </button>
              ))}
              <button className="ml-auto text-[11px] text-slate-400 hover:text-slate-100"
                onClick={() => navigator.clipboard?.writeText(lang === 'en' ? b.bulletin.public_alert_en : b.bulletin.public_alert_kn)}>
                Copy
              </button>
            </div>
            <p className="rounded bg-slate-900 border border-slate-700 p-2 text-slate-100 leading-relaxed" lang={lang}>
              {lang === 'en' ? b.bulletin.public_alert_en : b.bulletin.public_alert_kn}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
