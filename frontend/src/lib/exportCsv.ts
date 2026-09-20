// Download the ward table as CSV, for handing to an operations team.
import { type SimResult } from '../api'

export function wardCsv(r: SimResult): string {
  const head = ['ward', 'peak_status', 'eta_to_critical_min', 'eta_to_warning_min', 'peak_depth_m',
    'people_in_critical_cells', 'people_in_warning_cells']
  const rows = [...r.wards]
    .sort((a, b) => (a.eta_min ?? 1e9) - (b.eta_min ?? 1e9))
    .map((w) => [w.name, w.peak_status, w.eta_min ?? '', w.warning_eta_min ?? '', w.peak_m,
      w.pop_critical_peak, w.pop_warning_peak].join(','))
  const meta = [
    `# FlowShield run ${r.run_id} · ${r.cell_m} m grid · rain ${r.total_rain_mm} mm`,
    `# drainage failure ${Math.round(r.params.drainage_failure * 100)}% · blocked drains ${r.params.blocked_drains.length}` +
    ` · initial lake level ${Math.round(r.params.lake_fill * 100)}%`,
    '# Population: Census 2011, spread by built-up share. Model output, not an official forecast.',
  ]
  return [...meta, head.join(','), ...rows].join('\n')
}

export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
