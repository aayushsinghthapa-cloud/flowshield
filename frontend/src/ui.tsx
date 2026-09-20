// Small shared UI primitives, so every panel looks the same.
import type { ReactNode } from 'react'

export const STATUS_LABEL = ['Safe', 'Warning', 'Critical']
const STATUS_CHIP = ['chip-safe', 'chip-warn', 'chip-crit']
export const STATUS_COLOR = ['#1d9a6c', '#c07a00', '#d92d20']

export function StatusChip({ s }: { s: number }) {
  return <span className={STATUS_CHIP[s] ?? 'chip-safe'}>{STATUS_LABEL[s] ?? '—'}</span>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Section({ title, aside, children, className = '' }: {
  title?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || aside) && (
        <header className="flex items-center justify-between mb-3">
          {title && <h3 className="eyebrow">{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, className = '' }: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`seg ${className}`} role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} role="tab" title={o.title} data-on={o.value === value}
          aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({ label, value, min, max, step, fmt, onChange, hint }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt?: (v: number) => string
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <label className="field" title={hint}>
      <div className="flex justify-between items-baseline">
        <span className="text-[13px] text-ink-2">{label}</span>
        <span className="num text-[13px]">{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function AIBadge({ model, latency }: { model: string; latency?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f3eafe] px-2 py-0.5 text-[11px] font-medium text-[#6b21a8]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9z" />
      </svg>
      AI · {model}{latency !== undefined ? ` · ${latency}s` : ''}
    </span>
  )
}

/** Tooltip styling shared by every Recharts chart. */
export const tooltipStyle = {
  background: '#fff',
  border: '1px solid var(--color-line)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
  padding: '6px 10px',
} as const

export const axisTick = { fontSize: 11, fill: '#6e6e73' } as const
