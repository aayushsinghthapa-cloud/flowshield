import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { MapLayerMouseEvent, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { City, SimResult } from '../api'

export type MapMode = 'depth' | 'status' | 'probability'

interface Props {
  city: City
  result: SimResult | null
  frame: number
  mode: MapMode
  blocked: number[]
  blockMode: boolean
  onToggleDrain: (id: number) => void
  selectedWard: number | null
  onSelectWard: (id: number | null) => void
  wardStatus: Map<number, number> // ward id -> 0/1/2 at the current time
  probability?: Map<number, number> | null // ensemble P(critical) per ward
}

// Inline style: our layers never wait on a remote style. The raster basemap
// can fail (offline demo) without hiding the flood layers.
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    base: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#eef0f2' } },
    { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.9 } },
  ],
}
const LAKE = 1
const CHANNEL = 2

// Blue ramp for depth (m) -> rgba
function depthColor(d: number): [number, number, number, number] {
  if (d < 0.02) return [0, 0, 0, 0]
  const t = Math.min(d / 1.0, 1)                 // 0 shallow -> 1 deep
  const r = Math.round(191 - 162 * t)            // #bfdcff -> #1d4ed8
  const g = Math.round(220 - 142 * t)
  const b = Math.round(255 - 39 * t)
  const a = Math.round(110 + 135 * Math.min(d / 0.3, 1))
  return [r, g, b, a]
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const canvas = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const ready = useRef(false)
  const handlers = useRef(p)
  handlers.current = p

  // --- init map once
  useEffect(() => {
    const { city } = p
    const [rows, cols] = city.shape
    canvas.current.width = cols
    canvas.current.height = rows
    const m = new maplibregl.Map({
      container: el.current!,
      style: STYLE,
      bounds: [
        [city.bbox.west, city.bbox.south],
        [city.bbox.east, city.bbox.north],
      ],
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      dragRotate: false,
    })
    map.current = m
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = m
    m.on('error', (e) => console.error('map error', e.error?.message ?? e))
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

    m.on('load', () => {
      m.addSource('wards', { type: 'geojson', data: city.wardsGeo, promoteId: 'id' })
      m.addSource('lakes', { type: 'geojson', data: city.lakesGeo, promoteId: 'id' })
      m.addSource('drains', { type: 'geojson', data: city.drainsGeo, promoteId: 'id' })
      m.addSource('depth', {
        type: 'canvas',
        canvas: canvas.current,
        animate: true,
        coordinates: city.corners as [[number, number], [number, number], [number, number], [number, number]],
      })

      m.addLayer({
        id: 'ward-fill',
        type: 'fill',
        source: 'wards',
        paint: {
          'fill-color': [
            'match',
            ['coalesce', ['feature-state', 'status'], -1],
            2, '#d92d20',
            1, '#c07a00',
            0, '#1d9a6c',
            '#c7c7cc',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 0.38,
            ['==', ['coalesce', ['feature-state', 'status'], -1], 2], 0.34,
            ['==', ['coalesce', ['feature-state', 'status'], -1], 1], 0.22,
            0.04,
          ],
        },
      })
      m.addLayer({
        id: 'depth',
        type: 'raster',
        source: 'depth',
        paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
      })
      m.addLayer({
        id: 'lakes',
        type: 'fill',
        source: 'lakes',
        paint: { 'fill-color': '#2d7ff9', 'fill-opacity': 0.4, 'fill-outline-color': '#1d4ed8' },
      })
      m.addLayer({
        id: 'drains',
        type: 'line',
        source: 'drains',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'blocked'], false], '#d92d20', '#2d7ff9'],
          'line-width': ['case', ['boolean', ['feature-state', 'blocked'], false], 4, 1],
          'line-opacity': ['case', ['boolean', ['feature-state', 'blocked'], false], 1, 0.55],
        },
      })
      m.addLayer({
        id: 'ward-line',
        type: 'line',
        source: 'wards',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#1d1d1f', '#8e8e93'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0.5],
          'line-opacity': 0.65,
        },
      })
      m.addLayer({
        id: 'ward-label',
        type: 'symbol',
        source: 'wards',
        minzoom: 12,
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#3a3a3c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
      })

      m.addLayer({ id: 'ref-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
      m.on('mousemove', 'drains', (e: MapLayerMouseEvent) => {
        if (!handlers.current.blockMode) return
        m.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (f) {
          const pr = f.properties as { name?: string; kind: string; length_m: number }
          popup
            .setLngLat(e.lngLat)
            .setHTML(`<b>${pr.name || 'Unnamed ' + pr.kind}</b><br/>${pr.length_m} m · click to block/unblock`)
            .addTo(m)
        }
      })
      const wardPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })
      m.on('mousemove', 'ward-fill', (e: MapLayerMouseEvent) => {
        const h = handlers.current
        if (h.blockMode) return
        const f = e.features?.[0]
        if (!f) return
        m.getCanvas().style.cursor = 'pointer'
        const id = Number(f.properties.id)
        const w = h.result?.wards.find((x) => x.id === id)
        const st = h.probability ? null : h.wardStatus.get(id) ?? 0
        const label = h.probability
          ? `${Math.round((h.probability.get(id) ?? 0) * 100)}% chance of flooding`
          : `${['Safe', 'Warning', 'Critical'][st ?? 0]}${w?.eta_min != null ? ` · floods at ${Math.round(w.eta_min)} min` : ''}`
        wardPopup.setLngLat(e.lngLat)
          .setHTML(`<b>${f.properties.name}</b><br/>${w ? label : 'run a simulation'}`)
          .addTo(m)
      })
      m.on('mouseleave', 'ward-fill', () => {
        m.getCanvas().style.cursor = ''
        wardPopup.remove()
      })
      m.on('mouseleave', 'drains', () => {
        m.getCanvas().style.cursor = ''
        popup.remove()
      })
      m.on('click', (e: MapMouseEvent) => {
        const h = handlers.current
        if (h.blockMode) {
          const box: [maplibregl.PointLike, maplibregl.PointLike] = [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ]
          const f = m.queryRenderedFeatures(box, { layers: ['drains'] })[0]
          if (f) h.onToggleDrain(Number(f.properties.id))
          return
        }
        const w = m.queryRenderedFeatures(e.point, { layers: ['ward-fill'] })[0]
        h.onSelectWard(w ? Number(w.properties.id) : null)
      })
      ready.current = true
      paintAll()
    })
    return () => {
      ready.current = false
      m.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.city])

  function paintDepth() {
    const m = map.current
    const { result, frame, mode, city } = handlers.current
    if (!m || !ready.current) return
    const ctx = canvas.current.getContext('2d')!
    // The run may be on the 200 m preview grid, which has its own shape/kind.
    const [rows, cols] = result?.shape ?? city.shape
    const kinds = result?.kind ?? city.kind
    if (canvas.current.width !== cols || canvas.current.height !== rows) {
      canvas.current.width = cols
      canvas.current.height = rows
    }
    const img = ctx.createImageData(cols, rows)
    const data = img.data
    if (result && result.frames[frame] && mode !== 'probability') {
      const f = result.frames[frame]
      const { warning_m, critical_m } = result.params.thresholds
      for (let i = 0; i < f.length; i++) {
        const k = kinds[i]
        if (k === LAKE) continue
        const d = f[i] / 1000
        let c: [number, number, number, number]
        if (mode === 'status' && k !== CHANNEL) {
          if (d >= critical_m) c = [217, 45, 32, 225]
          else if (d >= warning_m) c = [240, 165, 20, 195]
          else c = depthColor(d)
        } else c = depthColor(d)
        const o = i * 4
        data[o] = c[0]
        data[o + 1] = c[1]
        data[o + 2] = c[2]
        data[o + 3] = c[3]
      }
    }
    ctx.putImageData(img, 0, 0)
    m.triggerRepaint()
  }

  function paintWards() {
    const m = map.current
    if (!m || !ready.current) return
    const { city, wardStatus, selectedWard, probability } = handlers.current
    for (const w of city.wards) {
      const st = probability ? probToStatus(probability.get(w.id)) : wardStatus.get(w.id)
      m.setFeatureState({ source: 'wards', id: w.id }, { status: st ?? -1, selected: w.id === selectedWard })
    }
  }

  function paintDrains() {
    const m = map.current
    if (!m || !ready.current) return
    m.removeFeatureState({ source: 'drains' })
    for (const id of handlers.current.blocked) m.setFeatureState({ source: 'drains', id }, { blocked: true })
  }

  function paintAll() {
    paintDepth()
    paintWards()
    paintDrains()
  }

  useEffect(paintDepth, [p.result, p.frame, p.mode])
  useEffect(paintWards, [p.wardStatus, p.selectedWard, p.probability])
  useEffect(paintDrains, [p.blocked])

  return (
    <div className="absolute inset-0">
      <div ref={el} className="w-full h-full" />
    </div>
  )
}

function probToStatus(pr: number | undefined): number {
  if (pr === undefined) return -1
  if (pr >= 0.5) return 2
  if (pr >= 0.2) return 1
  return 0
}
