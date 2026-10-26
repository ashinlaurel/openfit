import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createDemoData } from '@/data/demo'
import { SleepOvernightSignals } from './SleepOvernightSignals'

vi.mock('./icons', () => ({ HeartIcon: () => null, ChevronDownIcon: () => null, ChevronUpIcon: () => null, MinusIcon: () => null }))

describe('Sleep overnight signals', () => {
  it('shows the reported overnight measurements with units', () => {
    const { health } = createDemoData('2026-10-24')
    Object.assign(health, { nonRemHeartRate: 70, hrvMs: 27, hrvDeepSleepRmssdMs: 28.8, hrvEntropy: 2.705, spo2: 95.8, breathingRate: 16 })
    const html = renderToStaticMarkup(<SleepOvernightSignals health={health} />)
    for (const value of ['Sleeping heart rate', 'Nightly HRV', 'Deep-sleep HRV', 'Oxygen saturation', 'Breathing rate', 'HRV entropy', '28.8', '95.8', 'bpm', 'ms']) expect(html).toContain(value)
    expect(html.match(/<dt>/g)).toHaveLength(7)
  })
  it('shows missing readings explicitly and preserves a reported zero', () => {
    const { health } = createDemoData('2026-10-24')
    Object.assign(health, { nonRemHeartRate: null, hrvMs: null, hrvDeepSleepRmssdMs: null, hrvEntropy: 0, spo2: null, breathingRate: null })
    const html = renderToStaticMarkup(<SleepOvernightSignals health={health} />)
    expect(html.match(/Not recorded/g)).toHaveLength(5)
    expect(html).toContain('0.00')
  })
})
