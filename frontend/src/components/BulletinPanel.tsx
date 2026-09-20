import { useEffect, useState } from 'react'
import { aiBulletin, type BulletinResult, type EnsembleResult, type SimResult } from '../api'
import { AIBadge, Section, Spinner } from '../ui'

const SEV: Record<string, string> = {
  'ALL CLEAR': 'bg-safe-soft text-safe',
  WATCH: 'bg-accent-soft text-accent',
  WARNING: 'bg-warn-soft text-warn',
  'SEVERE WARNING': 'bg-crit-soft text-crit',
}

export default function BulletinPanel({ result, ensemble }: { result: SimResult; ensemble: EnsembleResult | null }) {
  const [b, setB] = useState<BulletinResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<'en' | 'kn'>('en')
  const [copied, setCopied] = useState(false)

  useEffect(() => { setB(null); setError(null) }, [result.run_id])

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

  const alert = b ? (lang === 'en' ? b.bulletin.public_alert_en : b.bulletin.public_alert_kn) : ''

  return (
    <Section title="Early-warning bulletin"
      aside={<button className="btn-ghost btn-sm" onClick={generate} disabled={loading}>
        {loading ? <><Spinner /> Writing…</> : b ? 'Regenerate' : 'Write with AI'}
      </button>}>
      {error && <p className="text-[12px] text-crit">AI unavailable, so nothing was written: {error}</p>}
      {!b && !error && !loading && (
        <p className="text-[12px] text-ink-2">
          Turns this run into an advisory for officials and a public alert in English and ಕನ್ನಡ, using only the numbers above.
        </p>
      )}
      {b && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <AIBadge model={b.ai.model} latency={b.ai.latency_s} provider={b.ai.provider} fellBackFrom={b.ai.fell_back_from} />
            <span className={`chip ${b.grounding.ok ? 'bg-safe-soft text-safe' : 'bg-warn-soft text-warn'}`}
              title="Every number in the text is checked against the simulation output.">
              {b.grounding.ok ? `✓ ${b.grounding.numbers_checked} numbers verified` : `⚠ unverified: ${b.grounding.unverified.join(', ')}`}
            </span>
          </div>

          <div className={`rounded-[10px] px-3 py-2 ${SEV[b.bulletin.severity] ?? SEV.WATCH}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide">{b.bulletin.severity}</div>
            <div className="text-[13px] font-medium leading-snug">{b.bulletin.headline}</div>
          </div>

          <div>
            <p className="eyebrow mb-1.5">What officials should do</p>
            <ol className="space-y-1.5">
              {b.bulletin.authority_advisory.map((a, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-snug">
                  <span className="num text-ink-3 shrink-0">{i + 1}</span>{a}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="eyebrow !mb-0">Public alert</p>
              <div className="seg ml-auto">
                {(['en', 'kn'] as const).map((l) => (
                  <button key={l} data-on={lang === l} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'ಕನ್ನಡ'}</button>
                ))}
              </div>
              <button className="btn-ghost btn-sm" onClick={async () => {
                try { await navigator.clipboard.writeText(alert); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
              }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="rounded-[10px] bg-canvas p-3 text-[13px] leading-relaxed" lang={lang}>{alert}</p>
          </div>
        </div>
      )}
    </Section>
  )
}
