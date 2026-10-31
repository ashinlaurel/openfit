import { describe, expect, it } from 'vitest'
const history = require('./body-history.cjs')
const measurement = (value: number, updatedAt = '2026-10-27T08:00:00Z') => ({ value, updatedAt })
describe('durable body history', () => {
  it('merges per metric and keeps older dates when snapshots roll forward', () => {
    const old = { days: { '2026-09-01': { metrics: { weightKg: measurement(96) } }, '2026-10-27': { metrics: { weightKg: measurement(93), bodyFat: measurement(21) } } } }
    const newer = { days: { '2026-10-27': { metrics: { weightKg: measurement(92.9, '2026-10-27T09:00:00Z') } } } }
    const merged = history.merge(old, newer)
    expect(merged.days['2026-09-01'].metrics.weightKg.value).toBe(96)
    expect(merged.days['2026-10-27'].metrics.weightKg.value).toBe(92.9)
    expect(merged.days['2026-10-27'].metrics.bodyFat.value).toBe(21)
    expect(history.merge(merged, old)).toEqual(merged)
  })
  it('imports only dated measurements and never turns missing values into zero', () => {
    const result = history.fromHealthArchive({ days: { '2026-10-27': { date: '2026-10-27', generatedAt: '2026-10-27T08:00:00Z', endpoints: { bodyWeight: { weight: [{ date: '2026-10-26', weight: 94 }] }, bodyFat: { fat: [{ date: '2026-10-27', fat: 21 }] }, water: { summary: { water: 0 } }, food: { summary: { calories: null } } } } } })
    expect(result.days['2026-10-26'].metrics.weightKg.value).toBe(94)
    expect(result.days['2026-10-27'].metrics.weightKg).toBeUndefined()
    expect(result.days['2026-10-27'].metrics.caloriesIn).toBeUndefined()
    expect(result.days['2026-10-27'].metrics.waterMl.value).toBe(0)
  })
  it('rejects malformed dates, out-of-range values and unknown fields', () => {
    const result = history.normalize({ days: { '2026-02-31': { metrics: { weightKg: measurement(90) } }, '2026-10-27': { metrics: { bodyFat: measurement(150), token: measurement(123), weightKg: measurement(92.9) } } } })
    expect(Object.keys(result.days)).toEqual(['2026-10-27'])
    expect(Object.keys(result.days['2026-10-27'].metrics)).toEqual(['weightKg'])
  })
})
