// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardData, FitbitBridge, RawFitbitPayload } from '@/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'

vi.mock('@/components/icons', () => Object.fromEntries('Sleep Disconnect Battery Bike Active Calendar Activity Check ChevronDown ChevronLeft ChevronRight ChevronUp Info Cloud Export Calories Gauge Settings Heart Water Today Floors Breathing Loader Distance Minus Nutrition Refresh Route Body Shield Signal Menu Sparkle External Duration Steps User Device Trend Close'.split(' ').map(name => [`${name}Icon`, () => null])))
vi.mock('@/components/Views', () => {
  function Snapshot({ data }: { data: DashboardData }) {
    const [count, setCount] = useState(0)
    return <div data-testid="health-snapshot">{data.selectedDate} · {data.activity.steps} steps<button onClick={() => setCount(count + 1)}>Comparison {count}</button></div>
  }
  return Object.fromEntries(['TodayView', 'MovementView', 'ActivityView', 'HealthView', 'SleepView', 'BodyView', 'DevicesView'].map(key => [key, Snapshot]))
})
vi.mock('@/components/HealthAssistant', () => ({ HealthAssistant: () => null }))
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ReportsView', () => ({ ReportsView: () => null }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const payload = (date: string, steps: number): RawFitbitPayload => ({
  source: 'google-health', date, generatedAt: '2026-10-25T06:00:00Z',
  endpoints: { profile: { user: { displayName: 'Test', timezone: 'Asia/Kolkata' } }, activity: { summary: { steps } } },
  errors: [], rateLimit: { limit: null, remaining: null, resetSeconds: null },
})
let host: HTMLDivElement, root: Root, bridge: FitbitBridge
let progress: Parameters<FitbitBridge['onSyncProgress']>[0]
const today = '2026-10-25', yesterday = '2026-10-24'
const text = () => host.querySelector('[data-testid="health-snapshot"]')?.textContent
const click = async (selector: string) => { await act(async () => (host.querySelector(selector) as HTMLButtonElement).click()) }
const render = async () => { await act(async () => root.render(<TooltipProvider><App /></TooltipProvider>)) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T06:00:00Z'))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  bridge = {
    getStatus: vi.fn().mockResolvedValue({ configured: true, connected: true, provider: 'google-health', lastSyncAt: null }),
    getCachedData: vi.fn(async date => date === yesterday ? payload(yesterday, 20) : payload(today, 10)),
    sync: vi.fn(() => new Promise(() => {})),
    onAuthComplete: vi.fn(() => () => {}),
    onSyncProgress: vi.fn(callback => { progress = callback; return () => {} }),
  } as unknown as FitbitBridge
  window.fitbit = bridge
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); delete window.fitbit; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('background health refresh', () => {
  it('keeps cached content and page state visible through progress and completion', async () => {
    const sync = deferred<RawFitbitPayload>()
    vi.mocked(bridge.sync).mockReturnValue(sync.promise)
    await render()
    expect(text()).toContain('10 steps')
    await click('[data-testid="health-snapshot"] button')
    await act(async () => progress({ date: today, completed: 16, total: 32, key: 'sleepRaw' }))
    expect(host.querySelector('.sidebar-health-sync [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50')
    expect(host.querySelector('.page-content .date-loading')).toBeNull()
    expect(text()).toContain('Comparison 1')
    await act(async () => sync.resolve(payload(today, 30)))
    expect(text()).toContain('30 steps')
    expect(text()).toContain('Comparison 1')
    expect(host.querySelector('.sidebar-health-sync')).toBeNull()
    await act(async () => progress({ date: yesterday, completed: 1, total: 32, key: 'sleepRaw' }))
    expect(host.querySelector('.sidebar-health-sync')?.textContent).toContain('Updating Oct 24')
    expect(text()).toContain('30 steps')
    await act(async () => progress({ date: yesterday, completed: 32, total: 32, key: 'sleepRaw' }))
    expect(host.querySelector('.sidebar-health-sync')).toBeNull()
  })
  it('opens a cached past day without queuing a provider refresh', async () => {
    const first = deferred<RawFitbitPayload>()
    vi.mocked(bridge.sync).mockReturnValueOnce(first.promise)
    await render()
    await click('button[aria-label="Previous day"]')
    expect(text()).toContain(`${yesterday} · 20 steps`)
    await act(async () => first.resolve(payload(today, 999)))
    expect(bridge.sync).toHaveBeenCalledTimes(1)
    expect(bridge.sync).toHaveBeenCalledWith(today)
    expect(text()).toContain('20 steps')
  })
  it('force refreshes a cached day only when the refresh button is clicked', async () => {
    vi.mocked(bridge.sync).mockResolvedValueOnce(payload(today, 10)).mockResolvedValueOnce(payload(yesterday, 25))
    await render()
    await click('button[aria-label="Previous day"]')
    expect(bridge.sync).toHaveBeenCalledTimes(1)
    await click('button[aria-label="Refresh data"]')
    expect(bridge.sync).toHaveBeenLastCalledWith(yesterday)
    expect(text()).toContain('25 steps')
  })
  it('keeps the last cached snapshot, with its date labeled, if an uncached day fails', async () => {
    const first = deferred<RawFitbitPayload>(), second = deferred<RawFitbitPayload>()
    vi.mocked(bridge.sync).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.mocked(bridge.getCachedData).mockImplementation(async date => date === yesterday ? null : payload(today, 10))
    await render()
    await click('button[aria-label="Previous day"]')
    expect(text()).toContain(`${today} · 10 steps`)
    expect(host.querySelector('.cached-date-note')?.textContent).toContain('Oct 25')
    await act(async () => first.resolve(payload(today, 999)))
    await act(async () => second.reject(new Error('Device offline')))
    expect(text()).toContain('10 steps')
    expect(host.textContent).toContain('Device offline')
  })
  it('uses the latest saved day at startup when today has no snapshot', async () => {
    vi.mocked(bridge.getCachedData).mockImplementation(async date => date === today ? null : payload(yesterday, 20))
    await render()
    expect(bridge.getCachedData).toHaveBeenCalledWith()
    expect(text()).toContain(`${yesterday} · 20 steps`)
    expect(bridge.sync).toHaveBeenCalledWith(today)
  })
  it('ignores a late cache read after the selected date changes again', async () => {
    const lateCache = deferred<RawFitbitPayload | null>()
    const read = vi.mocked(bridge.getCachedData).getMockImplementation()!
    vi.mocked(bridge.getCachedData).mockImplementation(date => date === yesterday ? lateCache.promise : read(date))
    await render()
    await click('button[aria-label="Previous day"]')
    await click('button[aria-label="Next day"]')
    await act(async () => lateCache.resolve(payload(yesterday, 999)))
    expect(text()).toContain(`${today} · 10 steps`)
    expect(text()).not.toContain('999')
  })
})
