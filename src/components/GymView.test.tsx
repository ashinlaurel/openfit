// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityItem, CloudBridge, CloudStatus, DashboardData } from '@/types'
import { createDemoData } from '@/data/demo'
import { GymView } from './GymView'

vi.mock('@/components/icons', () => ({ ActivityIcon: () => null, ChevronDownIcon: () => null, ChevronUpIcon: () => null, MinusIcon: () => null }))
vi.mock('./Charts', () => ({ BulletChart: () => null, LineChart: () => <div>Heart-rate chart</div> }))
const status: CloudStatus = { configured: true, apiUrl: 'https://api.example.com', user: { id: 'owner', name: 'Owner' } }
const recording = (id = 'fitbit-1'): ActivityItem => ({ id, name: 'Weight training', date: '2026-10-20', time: '18:00', startTime: '2026-10-20T18:00:00Z', endTime: '2026-10-20T19:15:00Z', durationMinutes: 75, elapsedDurationMinutes: 75, calories: 0, distanceKm: null, averageHeartRate: 125, steps: null, zoneMinutes: null, averagePaceSecondsPerMeter: null, heartZoneMinutes: null })
const data = (activities: ActivityItem[] = []): DashboardData => ({ ...createDemoData('2026-10-20'), source: 'google-health', activities, workoutCoverage: null, generatedAt: '2026-10-20T20:00:00Z' })
const snapshot = () => ({ state: { unit: 'kg', workouts: [{ id: 'gym-1', d: '2026-10-20', name: 'Push', start: Date.parse('2026-10-20T18:05:00Z'), end: Date.parse('2026-10-20T19:10:00Z'), vol: 1000, entries: [{ id: 'press', n: 'Bench press', sets: [{ w: 50, r: 10, done: true, rir: 0 }] }] }] }, rev: 10, fromCache: false, syncedAt: '2026-10-20T20:00:00Z' })
let host: HTMLDivElement, root: Root
async function render(value: DashboardData, cloudStatus = status) {
  await act(async () => { root.render(<GymView data={value} cloudStatus={cloudStatus} healthConnected healthSyncing={false} onConnect={() => {}} onSyncHealth={async () => {}}/>) })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T20:01:00Z'))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  window.cloud = { getOpenGym: vi.fn().mockResolvedValue(snapshot()), getWorkoutLinks: vi.fn().mockResolvedValue({}), saveWorkoutLink: vi.fn().mockResolvedValue({ 'gym-1': 'fitbit-2' }) } as unknown as CloudBridge
  window.fitbit = { getCachedArchive: vi.fn().mockResolvedValue({ days: {} }) } as unknown as NonNullable<Window['fitbit']>
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); delete window.cloud; delete window.fitbit })

describe('Combined gym sessions', () => {
  it('shows one combined session with reported zero calories, then exposes the original exercise sets', async () => {
    await render(data([recording()]))
    expect(host.querySelectorAll('.gym-workout-card')).toHaveLength(1)
    expect(host.textContent).toContain('Matched by time')
    expect(host.textContent).toContain('0 kcal')
    expect(host.textContent).toContain('125 bpm')
    expect(host.textContent).not.toContain('Bench press')
    await act(async () => (host.querySelector('.gym-detail-toggle') as HTMLButtonElement).click())
    await act(async () => { await import('./GymSessionDetails') })
    expect(host.textContent).toContain('Bench press')
    expect(host.textContent).toContain('RIR 0')
  })
  it('recomputes matches when a Google Health sync brings in a recording', async () => {
    await render(data())
    expect(host.textContent).toContain('Awaiting a matching recording')
    await render({ ...data([recording()]), generatedAt: '2026-10-20T20:02:00Z' })
    expect(host.textContent).toContain('Matched by time')
  })
  it('leaves ambiguous records for review and saves an explicit choice', async () => {
    await render(data([recording(), recording('fitbit-2')]))
    expect(host.textContent).toContain('Review possible matches')
    const select = host.querySelector('select')!
    await act(async () => { select.value = 'record:fitbit-2'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(window.cloud!.saveWorkoutLink).toHaveBeenCalledWith({ gymId: 'gym-1', mode: 'link', healthId: 'fitbit-2' })
    expect(host.textContent).toContain('Linked by you')
  })
  it('does not overwrite a manual choice with a slow background refresh', async () => {
    const value = data([recording(), recording('fitbit-2')])
    await render(value)
    let finish!: (value: ReturnType<typeof snapshot>) => void
    const pending = new Promise<ReturnType<typeof snapshot>>(resolve => { finish = resolve })
    vi.mocked(window.cloud!.getOpenGym).mockReturnValueOnce(pending)
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    const select = host.querySelector('select')!
    await act(async () => { select.value = 'record:fitbit-2'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { finish(snapshot()) })
    expect(host.textContent).toContain('Linked by you')
    expect(host.querySelector('select')!.value).toBe('record:fitbit-2')
  })
  it('keeps real gym sessions separate from demo health data', async () => {
    await render({ ...data([recording()]), source: 'demo' })
    expect(host.textContent).not.toContain('Matched by time')
    expect(host.textContent).not.toContain('Recording average HR')
  })
  it('clears the old profile view when the account is disconnected', async () => {
    await render(data([recording()]))
    await render(data(), { configured: false, apiUrl: '', user: null })
    expect(host.querySelectorAll('.gym-workout-card')).toHaveLength(0)
    expect(host.textContent).toContain('Connect your Open Gym profile')
  })
})
