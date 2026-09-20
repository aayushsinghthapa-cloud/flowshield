import { useEffect, type CSSProperties } from 'react'
import { fmtEta } from '../api'

interface Props {
  times: number[]
  frame: number
  onFrame: (f: number) => void
  playing: boolean
  onPlaying: (p: boolean) => void
  rainNow: number
}

export default function TimeSlider({ times, frame, onFrame, playing, onPlaying, rainNow }: Props) {
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (frame + 1 >= times.length) onPlaying(false)
      else onFrame(frame + 1)
    }, 180)
    return () => clearInterval(id)
  }, [playing, frame, times.length, onFrame, onPlaying])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && /input|textarea/i.test(el.tagName) && el.getAttribute('type') !== 'range') return
      if (e.key === ' ') { e.preventDefault(); onPlaying(!playing) }
      else if (e.key === 'ArrowRight') { onPlaying(false); onFrame(Math.min(frame + 1, times.length - 1)) }
      else if (e.key === 'ArrowLeft') { onPlaying(false); onFrame(Math.max(frame - 1, 0)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [frame, playing, times.length, onFrame, onPlaying])

  const t = times[frame] ?? 0
  const pctDone = times.length > 1 ? (frame / (times.length - 1)) * 100 : 0

  return (
    <div className="card flex items-center gap-3 px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
      <button
        className="w-9 h-9 shrink-0 rounded-full bg-accent text-white grid place-items-center hover:bg-[#0062c4]"
        onClick={() => {
          if (!playing && frame >= times.length - 1) onFrame(0)
          onPlaying(!playing)
        }}
        aria-label={playing ? 'Pause' : 'Play'} title="Space to play or pause, arrow keys to step" 
      >
        {playing
          ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1.5" y="1" width="3" height="10" rx="1" /><rect x="7.5" y="1" width="3" height="10" rx="1" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2.5 1.2l8 4.8-8 4.8z" /></svg>}
      </button>
      <div className="flex-1 min-w-0">
        <input type="range" className="progress" min={0} max={Math.max(0, times.length - 1)} value={frame}
          style={{ '--pct': `${pctDone}%` } as CSSProperties}
          onChange={(e) => { onPlaying(false); onFrame(Number(e.target.value)) }} />
        <div className="flex justify-between text-[11px] text-ink-2 num -mt-0.5">
          <span className="font-medium text-ink">{fmtEta(t)} after rain starts</span>
          <span>{rainNow > 0 ? `raining ${rainNow.toFixed(0)} mm/hr` : 'rain stopped'}</span>
        </div>
      </div>
    </div>
  )
}
