// Scenario <-> URL, so a run can be shared or reproduced exactly.
import { DEFAULT_PARAMS, type ScenarioParams } from '../api'

export function writeUrl(p: ScenarioParams) {
  try {
    const json = JSON.stringify(p)
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    history.replaceState(null, '', `${location.pathname}?s=${b64}`)
  } catch {
    /* sharing is a convenience; never break a run over it */
  }
}

export function paramsFromUrl(): ScenarioParams | null {
  const s = new URLSearchParams(location.search).get('s')
  if (!s) return null
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    return { ...DEFAULT_PARAMS, ...parsed, rain: { ...DEFAULT_PARAMS.rain, ...parsed.rain },
      thresholds: { ...DEFAULT_PARAMS.thresholds, ...parsed.thresholds } }
  } catch {
    return null
  }
}

export async function copyLink(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(location.href)
    return true
  } catch {
    return false
  }
}
