// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkoutRoute } from './WorkoutRoute'
import type { ActivityItem } from '@/types'
const tcx = `<TrainingCenterDatabase><Activities><Activity><Lap><Track>${[0,1,2].map(i => `<Trackpoint><Time>2026-10-26T10:00:${String(i * 10).padStart(2, '0')}Z</Time><Position><LatitudeDegrees>${12.9 + i * .001}</LatitudeDegrees><LongitudeDegrees>77.6</LongitudeDegrees></Position><DistanceMeters>${i * 20}</DistanceMeters><AltitudeMeters>${900 + i}</AltitudeMeters></Trackpoint>`).join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
const item = { id: 'users/me/dataTypes/exercise/dataPoints/123', hasGps: true } as ActivityItem
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete window.fitbit; vi.unstubAllGlobals() })
it('loads a cached route, renders chart data, supports zoom and exports through the bridge', async () => {
  const getExerciseRoute = vi.fn(async () => ({ tcx, cached: true })), exportExerciseRoute = vi.fn(async () => ({ canceled: false }))
  window.fitbit = { getExerciseRoute, exportExerciseRoute } as any
  await act(async () => root.render(<WorkoutRoute item={item} />))
  expect(getExerciseRoute).toHaveBeenCalledWith(item.id, false)
  expect(host.textContent).toContain('Saved locally')
  expect(host.textContent).toContain('Elevation')
  expect(host.textContent).toContain('Moving pace')
  expect(host.querySelector('[aria-label^="GPS route map"]')).not.toBeNull()
  const tile = host.querySelector('image')!.getAttribute('href')
  await act(async () => (host.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement).click())
  expect(host.querySelector('image')!.getAttribute('href')).not.toBe(tile)
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Export TCX')!.click())
  expect(exportExerciseRoute).toHaveBeenCalledWith(item.id)
})
it('shows denied-location errors and retries without a cached result', async () => {
  const getExerciseRoute = vi.fn().mockRejectedValueOnce(new Error('Reconnect Google Health and allow exercise location access.')).mockResolvedValue({ tcx, cached: false })
  window.fitbit = { getExerciseRoute } as any
  await act(async () => root.render(<WorkoutRoute item={item} />))
  expect(host.textContent).toContain('allow exercise location access')
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Try again')!.click())
  expect(getExerciseRoute).toHaveBeenLastCalledWith(item.id, true)
  expect(host.querySelector('[aria-label^="GPS route map"]')).not.toBeNull()
})
it('handles trackpad pinch locally while allowing normal two-finger scrolling', async () => {
  window.fitbit = { getExerciseRoute: async () => ({ tcx, cached: true }) } as any
  await act(async () => root.render(<WorkoutRoute item={item} />))
  const map = host.querySelector<SVGSVGElement>('[aria-label^="GPS route map"]')!
  vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 340 } as DOMRect)
  const before = map.querySelector('path')!.getAttribute('d')
  const pinch = new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, clientX: 300, clientY: 160, bubbles: true, cancelable: true })
  await act(async () => { map.dispatchEvent(pinch) })
  expect(pinch.defaultPrevented).toBe(true)
  expect(map.querySelector('path')!.getAttribute('d')).not.toBe(before)
  const afterZoomIn = map.querySelector('path')!.getAttribute('d')
  await act(async () => { map.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 50, clientX: 300, clientY: 160, bubbles: true, cancelable: true })) })
  expect(map.querySelector('path')!.getAttribute('d')).not.toBe(afterZoomIn)
  const afterZoomOut = map.querySelector('path')!.getAttribute('d')
  const scroll = new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true })
  await act(async () => { map.dispatchEvent(scroll) })
  expect(scroll.defaultPrevented).toBe(false)
  expect(map.querySelector('path')!.getAttribute('d')).toBe(afterZoomOut)
  expect([...map.querySelectorAll('image')].every(image => /\/\d+\/\d+\/\d+\.png$/.test(image.getAttribute('href')!))).toBe(true)
})
