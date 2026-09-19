import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState<string>('checking…')
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d.status))
      .catch(() => setHealth('backend unreachable'))
  }, [])
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-semibold">FlowShield: Bengaluru</h1>
      <p className="text-slate-400">Backend: {health}</p>
    </main>
  )
}
