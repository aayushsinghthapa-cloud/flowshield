import { useEffect, useState } from 'react'

const SEEN = 'flowshield.help.seen'

const STEPS: [string, string][] = [
  ['1 · Choose a storm', 'Pick a preset, drag the sliders, or type a scenario in plain English. You can also run the real forecast for the next 24 hours.'],
  ['2 · Watch it play', 'Press play under the map. Blue is water on the ground; wards turn amber at 15 cm and red at 30 cm — deep enough to float a car.'],
  ['3 · Read the answer', 'The right panel says which wards flood, how long you have before each one does, and how many people are in the water.'],
  ['4 · Test a fix', 'Block a real storm drain on the map, run it again, and open Compare to see how much sooner the flood arrives.'],
]

export default function HelpSheet() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN)) setOpen(true)
    } catch { /* private mode: just skip the intro */ }
  }, [])

  const close = () => {
    setOpen(false)
    try { localStorage.setItem(SEEN, '1') } catch { /* ignore */ }
  }

  return (
    <>
      <button className="btn-quiet btn-sm" onClick={() => setOpen(true)} title="How to read this dashboard">
        How to read this
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/25" onClick={close} />
          <div className="relative card max-w-lg w-full p-5">
            <h2 className="text-[20px] font-semibold tracking-tight">Reading this dashboard</h2>
            <p className="text-[13px] text-ink-2 mt-1">
              FlowShield simulates rain falling on the real terrain, lakes and storm drains of south-east Bengaluru,
              then tells you who is in danger and when.
            </p>
            <ol className="mt-4 space-y-3">
              {STEPS.map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="w-1 rounded-full bg-accent shrink-0" />
                  <div>
                    <div className="text-[13px] font-medium">{t}</div>
                    <div className="text-[12px] text-ink-2 leading-snug">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink-3 mt-4">
              Everything on screen is computed live. It is a decision-support prototype, not an official forecast.
            </p>
            <button className="btn-primary w-full mt-4" onClick={close}>Start exploring</button>
          </div>
        </div>
      )}
    </>
  )
}
