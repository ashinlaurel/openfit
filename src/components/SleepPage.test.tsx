// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoData } from '@/data/demo'
import { SleepView } from './SleepPage'
import { sleepWindowSamples } from './SleepDetailedSignals'

vi.mock('./ResearchInsights', () => ({ ResearchInsights: () => null }))
vi.mock('./icons', () => Object.fromEntries('Sleep Trend Gauge Heart ChevronDown ChevronUp Minus'.split(' ').map(name => [`${name}Icon`, () => null])))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const render = async () => { await act(async () => root.render(<SleepView data={createDemoData('2026-10-25')} />)) }

describe('Sleep page', () => {
  it('switches sessions while preserving explicitly labeled main-sleep daily signals', async () => {
    await render()
    expect(host.querySelector('.sleep-session-controls')?.firstElementChild?.textContent).toContain('Total sleep')
    expect(host.querySelector('[role=tab]')?.textContent).toContain('Main sleep')
    expect(host.querySelectorAll('.sleep-summary-grid > div')).toHaveLength(6)
    const nap = [...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(tab => tab.textContent?.includes('Nap'))!
    await act(async () => nap.click())
    expect(host.querySelector('.sleep-key-primary')?.textContent).toContain('0h 24m')
    expect(nap.getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('.sleep-timeline-interactive')).toBeNull()
    expect(host.textContent).toContain('Daily summaries describe the main sleep')
  })
  it('hides session tabs when there is only a main sleep', async () => {
    const data = createDemoData('2026-10-25')
    data.sleep.sessions = (data.sleep.sessions ?? []).filter(session => session.isMainSleep)
    await act(async () => root.render(<SleepView data={data} />))
    expect(host.querySelector('[role=tablist]')).toBeNull()
  })
  it('uses the same 30-day range for timing and duration, and provides keyboard stage inspection', async () => {
    await render()
    const chart = host.querySelector('.sleep-timeline-interactive > svg')!
    await act(async () => { chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    expect(host.querySelector('.sleep-timeline-readout')?.textContent).toContain('Deep')
    const baselines = host.querySelector('.sleep-night-signals')!.textContent
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === '30 days')!
    await act(async () => button.click())
    expect(host.querySelectorAll('.weekly-sleep-row')).toHaveLength(30)
    expect(host.querySelector('.sleep-night-signals')!.textContent).toBe(baselines)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.sleep-history')?.textContent).toContain('30 / 30 nights recorded')
    const point = createDemoData('2026-10-24').sleep.totalMinutes!
    expect(host.querySelector('.weekly-sleep-row:nth-last-child(2)')?.textContent).toContain(`${Math.floor(point / 60)}h`)
  })
  it('clips overnight samples to the selected session across midnight and keeps ordering', () => {
    const samples = [{ timestamp: '2026-10-25T03:00:00Z', value: 98 }, { timestamp: '2026-10-24T22:00:00Z', value: 96 }, { timestamp: '2026-10-24T20:00:00Z', value: 97 }]
    expect(sleepWindowSamples(samples, '2026-10-25T02:00:00+05:30', '2026-10-25T08:00:00+05:30')).toEqual([samples[1]])
    expect(sleepWindowSamples(samples, null, null)).toEqual([])
  })
})


it('shows timestamped sample points and leaves missing sensor intervals disconnected', async () => {
  await render()
  const disclosure = host.querySelector('.sleep-detail-disclosure')!
  expect(disclosure.textContent).toContain('Detailed measurements for this session')
  const charts = disclosure.querySelectorAll('.line-chart')
  expect(charts.length).toBe(2)
  expect(disclosure.querySelectorAll('circle').length).toBeGreaterThan(100)
  const labels = [...disclosure.querySelectorAll('.chart-range-labels')].map(el => el.textContent)
  expect(labels[0]).toBe(labels[1])
  expect(labels[0]).toContain('3:19 AM')
  for (const chart of charts) expect(chart.querySelectorAll('path[fill="none"]').length).toBeGreaterThan(1)
})
