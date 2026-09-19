import { useEffect } from 'react'
import { fmtEta } from '../api'

interface Props {
  times: number[]          // frame times (min)
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
      onFrame(frame + 1 >= times.length ? 0 : frame + 1)
      if (frame + 1 >= times.length) onPlaying(false)
    }, 180)
    return () => clearInterval(id)
  }, [playing, frame, times.length, onFrame, onPlaying])

  const t = times[frame] ?? 0
  return (
    <div className="flex items-center gap-3 rounded-lg bg-slate-900/90 backdrop-blur px-3 py-2 border border-slate-700 shadow-lg">
      <button
        className="w-9 h-9 rounded-full bg-sky-500 text-slate-950 font-bold hover:bg-sky-400"
        onClick={() => onPlaying(!playing)}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        <input
          type="range"
          className="w-full accent-sky-400"
          min={0}
          max={Math.max(0, times.length - 1)}
          value={frame}
          onChange={(e) => {
            onPlaying(false)
            onFrame(Number(e.target.value))
          }}
        />
        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
          <span>T+{fmtEta(t)}</span>
          <span>rain {rainNow.toFixed(0)} mm/hr</span>
          <span>{fmtEta(times[times.length - 1] ?? 0)}</span>
        </div>
      </div>
    </div>
  )
}
