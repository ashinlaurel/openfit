import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivityItem } from '@/types'
import { parseExerciseTcx, projectRoute, routePace, type RoutePoint } from '@/lib/exercise-route'
import { paceLabel } from '@/lib/workouts'
import { LineChart } from './Charts'

const width = 800, height = 340
function RouteMap({ points }: { points: RoutePoint[] }) {
  const projected = useMemo(() => projectRoute(points), [points])
  const located = projected.filter(point => point !== null)
  const fit = useMemo(() => {
    if (!located.length) return { x: .5, y: .5, zoom: 1 }
    const xs = located.map(p => p.x), ys = located.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.max(1, Math.min(17, Math.floor(Math.log2(Math.min((width - 100) / Math.max(maxX - minX, .000001), (height - 80) / Math.max(maxY - minY, .000001)) / 256)))) }
  }, [projected])
  const [view, setView] = useState(fit)
  const mapRef = useRef<SVGSVGElement>(null)
  const hasCoordinates = located.length > 0
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Chromium emits trackpad pinch gestures as Ctrl+wheel. A non-passive
    // listener prevents the browser from zooming the entire dashboard.
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = map.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const offsetX = (event.clientX - bounds.left) / bounds.width * width - width / 2
      const offsetY = (event.clientY - bounds.top) / bounds.height * height - height / 2
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1)
      setView(previous => {
        const zoom = Math.max(1, Math.min(18, previous.zoom - Math.max(-120, Math.min(120, delta)) * .01))
        const oldScale = 256 * 2 ** previous.zoom, newScale = 256 * 2 ** zoom
        return { zoom, x: previous.x + offsetX * (1 / oldScale - 1 / newScale), y: previous.y + offsetY * (1 / oldScale - 1 / newScale) }
      })
    }
    map.addEventListener('wheel', pinch, { passive: false })
    return () => map.removeEventListener('wheel', pinch)
  }, [hasCoordinates])
  const [drag, setDrag] = useState<{ x: number; y: number; centerX: number; centerY: number } | null>(null)
  const scale = 256 * 2 ** view.zoom, left = view.x * scale - width / 2, top = view.y * scale - height / 2
  // Match detail to the map's zoom level: keep the overview uncluttered,
  // then request the next tile level as the user zooms in.
  const tileZoom = Math.floor(view.zoom), tileSize = 256 * 2 ** (view.zoom - tileZoom)
  const tiles = []
  for (let x = Math.floor(left / tileSize); x <= Math.floor((left + width) / tileSize); x++) {
    for (let y = Math.floor(top / tileSize); y <= Math.floor((top + height) / tileSize); y++) {
      if (y < 0 || y >= 2 ** tileZoom) continue
      const wrappedX = ((x % 2 ** tileZoom) + 2 ** tileZoom) % 2 ** tileZoom
      tiles.push(<image key={`${tileZoom}-${x}-${y}`} href={`https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${y}.png`} x={x * tileSize - left} y={y * tileSize - top} width={tileSize} height={tileSize} />)
    }
  }
  let path = '', previous: typeof projected[number] = null
  for (const p of projected) {
    if (!p) { previous = null; continue }
    const continuous = previous && p.segment === previous.segment && Date.parse(p.time) - Date.parse(previous.time) <= 120_000
    path += `${continuous ? 'L' : 'M'}${p.x * scale - left},${p.y * scale - top} `
    previous = p
  }
  const start = located[0], end = located.at(-1)
  if (!start || !end) return <p className="workout-caption">No GPS coordinates were included in this recording.</p>
  return <div className="workout-route-map">
    <svg ref={mapRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="GPS route map. Green marker is the start; red marker is the finish. Pinch to zoom, drag to pan, or use the map controls." style={{ touchAction: 'none' }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY, centerX: view.x, centerY: view.y }) }}
      onPointerMove={event => { if (!drag) return; const ratio = width / event.currentTarget.getBoundingClientRect().width; setView(v => ({ ...v, x: drag.centerX - (event.clientX - drag.x) * ratio / scale, y: drag.centerY - (event.clientY - drag.y) * ratio / scale })) }}
      onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
      {tiles}<path d={path} fill="none" stroke="#f5ad50" strokeOpacity={.2} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" /><path d={path} fill="none" stroke="#171717" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" /><path d={path} fill="none" stroke="#f5ad50" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
      {[{ point: start, color: '#7cceaa', label: 'Start' }, { point: end, color: '#ed8492', label: 'Finish' }].map(({ point, color, label }) => <g key={label}><circle cx={point.x * scale - left} cy={point.y * scale - top} r={10} fill={color} fillOpacity={.2} /><circle cx={point.x * scale - left} cy={point.y * scale - top} r={6} fill={color} stroke="#181a1e" strokeWidth={2.5} /><title>{label}</title></g>)}
    </svg>
    <div className="workout-route-controls"><button aria-label="Zoom in" disabled={view.zoom >= 18} onClick={() => setView(v => ({ ...v, zoom: Math.min(18, v.zoom + 1) }))}>+</button><button aria-label="Zoom out" disabled={view.zoom <= 1} onClick={() => setView(v => ({ ...v, zoom: Math.max(1, v.zoom - 1) }))}>−</button><button onClick={() => setView(fit)}>Fit route</button><button aria-label="Pan map left" onClick={() => setView(v => ({ ...v, x: v.x - 100 / scale }))}>←</button><button aria-label="Pan map right" onClick={() => setView(v => ({ ...v, x: v.x + 100 / scale }))}>→</button><button aria-label="Pan map up" onClick={() => setView(v => ({ ...v, y: v.y - 100 / scale }))}>↑</button><button aria-label="Pan map down" onClick={() => setView(v => ({ ...v, y: v.y + 100 / scale }))}>↓</button></div>
    <button className="workout-map-attribution" onClick={() => void window.fitbit?.openExternal('https://www.openstreetmap.org/copyright')}>© OpenStreetMap contributors</button>
  </div>
}

export function WorkoutRoute({ item }: { item: ActivityItem }) {
  const [state, setState] = useState<{ id: string; points?: RoutePoint[]; error?: string; cached?: boolean }>({ id: item.id })
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  useEffect(() => {
    let cancelled = false
    setState({ id: item.id })
    const bridge = window.fitbit?.getExerciseRoute
    if (!bridge) { setState({ id: item.id, error: 'GPS routes are available in the desktop app. Restart OpenFit if it is already running.' }); return }
    void bridge(item.id, attempt > 0).then(result => {
      const points = parseExerciseTcx(result.tcx)
      if (!cancelled) setState({ id: item.id, points, cached: result.cached })
    }).catch(error => { if (!cancelled) setState({ id: item.id, error: error instanceof Error ? error.message : 'Could not load this route.' }) })
    return () => { cancelled = true }
  }, [item.id, attempt])
  const points = state.id === item.id ? state.points : undefined
  // Keep rendering responsive while retaining the complete TCX in the encrypted archive.
  const display = useMemo(() => {
    if (!points) return []
    const step = Math.max(1, Math.ceil(points.length / 2000))
    return points.filter((point, i) => i % step === 0 || i === points.length - 1 || points[i - 1]?.segment !== point.segment || points[i + 1]?.segment !== point.segment)
  }, [points])
  const paceValues = routePace(display)
  const events = [...(item.events ?? [])].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const rows = display.flatMap((point, index) => {
    const lastEvent = events.filter(event => Date.parse(event.time) <= Date.parse(point.time)).at(-1)
    const paused = lastEvent && /PAUSE|STOP/.test(lastEvent.type.toUpperCase())
    const row = { time: point.time, altitude: point.altitude, pace: paused ? null : paceValues[index] }
    const previous = display[index - 1]
    return previous && (previous.segment !== point.segment || Date.parse(point.time) - Date.parse(previous.time) > 120_000)
      ? [{ time: point.time, altitude: null, pace: null }, row] : [row]
  })
  const labels = rows.map(point => new Date(point.time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }))
  const times = rows.map(point => Date.parse(point.time))
  const pace = rows.map(point => point.pace)
  const exportRoute = async () => {
    setExporting(true); setExportError('')
    try { await window.fitbit?.exportExerciseRoute?.(item.id) } catch (error) { setExportError(error instanceof Error ? error.message : 'Could not export route.') } finally { setExporting(false) }
  }
  return <section className="workout-detail-section workout-route-section">
    <div className="workout-section-heading"><h3>GPS route</h3><div className="workout-route-actions">{state.cached && <span>Saved locally</span>}<button onClick={() => setAttempt(v => v + 1)}>Refresh route</button>{points && <button onClick={() => void exportRoute()} disabled={exporting}>{exporting ? 'Exporting…' : 'Export TCX'}</button>}</div></div>
    {state.error ? <div role="status" className="workout-route-message">{state.error}<button onClick={() => setAttempt(v => v + 1)}>Try again</button></div> : !points ? <p role="status" className="workout-caption">Loading GPS route…</p> : <>
      <RouteMap key={`${item.id}-${attempt}`} points={display} />
      {display.filter(point => point.altitude !== null).length > 1 && <div className="workout-route-chart"><h4>Elevation</h4><LineChart values={rows.map(point => point.altitude)} labels={labels} xValues={times} formatter={value => `${Math.round(value)} m`} height={180} compact showYAxis showRangeLabels ariaLabel="Recorded route elevation" /></div>}
      {pace.filter(value => value !== null).length > 1 && <div className="workout-route-chart"><h4>Moving pace <small>30-second window</small></h4><LineChart values={pace} labels={labels} xValues={times} formatter={value => `${paceLabel(value)} /km`} height={180} compact showYAxis showRangeLabels ariaLabel="Moving pace from recorded route distances and timestamps; paused and near-stationary samples omitted" /></div>}
    </>}
    {exportError && <p role="alert" className="workout-caption">{exportError}</p>}
  </section>
}
