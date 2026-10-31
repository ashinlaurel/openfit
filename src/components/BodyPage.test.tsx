// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BodyView } from './BodyPage'
import { createDemoData } from '@/data/demo'
import { bodyHistoryRows } from '@/lib/use-body-history'
vi.mock('./icons', () => ({ BodyIcon: () => null, GaugeIcon: () => null }))
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
it('defaults to weight and switches the left chart when a composition tile is clicked', async () => {
  await act(async () => root.render(<BodyView data={createDemoData('2026-10-27')} />))
  expect(host.querySelector('[aria-label="Weight history"]')).not.toBeNull()
  const fat = [...host.querySelectorAll<HTMLButtonElement>('.body-composition-grid button')].find(button => button.textContent?.startsWith('Fat mass'))!
  await act(async () => fat.click())
  expect(host.querySelector('[aria-label="Fat mass history"]')).not.toBeNull()
  expect(fat.getAttribute('aria-pressed')).toBe('true')
  const weight = [...host.querySelectorAll<HTMLButtonElement>('.body-composition-grid button')].find(button => button.textContent?.startsWith('Weight'))!
  await act(async () => weight.click())
  expect(host.querySelector('[aria-label="Weight history"]')).not.toBeNull()
})
it('does not derive composition by carrying measurements between dates', () => {
  const value = (value: number) => ({ value, updatedAt: '2026-10-27T08:00:00Z' })
  const rows = bodyHistoryRows({ version: 1, days: { '2026-10-26': { metrics: { bodyFat: value(21) } }, '2026-10-27': { metrics: { weightKg: value(93) } }, '2026-10-28': { metrics: { weightKg: value(100) } } } }, '2026-10-27')
  expect(rows).toHaveLength(2)
  expect(rows.every(row => row.values.fatMassKg === null)).toBe(true)
})
it('keeps imported scale measurements in their recorded units for history charts', () => {
  const measurement = (value: number) => ({ value, updatedAt: '2026-10-27T08:00:00Z', source: 'health-connect' as const })
  const rows = bodyHistoryRows({ version: 1, days: { '2026-10-27': { metrics: {
    bodyWaterMassKg: measurement(48.2), boneMassKg: measurement(3.1), leanBodyMassKg: measurement(69.5), basalMetabolicRate: measurement(1780),
  } } } }, '2026-10-27')
  expect(rows[0].values).toMatchObject({ bodyWaterMassKg: 48.2, boneMassKg: 3.1, leanBodyMassKg: 69.5, basalMetabolicRate: 1780 })
})
