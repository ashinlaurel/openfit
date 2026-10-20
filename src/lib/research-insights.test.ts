import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { offsetDate, personalBaseline, socialJetlag, weeklyActivity } from './research-insights'

describe('research insights', () => {
  it('counts complete intensity days once and excludes out-of-window and missing days', () => {
    const day = createDemoData('2026-10-19')
    day.activity.moderateActiveMinutes = 30
    day.activity.vigorousActiveMinutes = 10
    const missing = createDemoData('2026-10-18')
    missing.activity.vigorousActiveMinutes = null
    const old = createDemoData('2026-10-12')
    expect(weeklyActivity([day, day, missing, old], day.selectedDate)).toEqual({ moderate: 30, vigorous: 10, count: 1, equivalent: 50 })
    expect(weeklyActivity([missing], day.selectedDate).equivalent).toBeNull()
  })

  it('requires enough prior baseline days and excludes selected, future, and old readings', () => {
    const data = createDemoData('2026-10-19')
    const base = data.trends[0]
    data.trends = Array.from({ length: 7 }, (_, i) => ({ ...base, date: offsetDate(data.selectedDate, -i - 1), hrvMs: 40 }))
    data.trends.push(...[0, 1, -29].map(i => ({ ...base, date: offsetDate(data.selectedDate, i), hrvMs: 1000 })))
    expect(personalBaseline(data, 'hrvMs', 50)).toEqual({ count: 7, mean: 40, delta: 10 })
    data.trends = data.trends.slice(0, 6)
    expect(personalBaseline(data, 'hrvMs', 50).delta).toBeNull()
  })

  it('handles midnight midpoint wrap and uses wake-up day for workday classification', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-17', '2026-10-18'].map((date, i) => {
      const data = createDemoData(date)
      // Workday midpoint 23:30; free-day midpoint 00:30: one hour apart, not 23.
      data.sleep.startTime = `${offsetDate(date, -1)}T${i < 3 ? '21:30' : '22:30'}:00Z`
      data.sleep.endTime = `${date}T${i < 3 ? '01:30' : '02:30'}:00Z`
      return data
    })
    const result = socialJetlag(days, '2026-10-19', [1, 2, 3, 4, 5], 'UTC')
    expect(result.workCount).toBe(3)
    expect(result.freeCount).toBe(2)
    expect(result.minutes).toBeCloseTo(60)
    days[4].sleep.startTime = null
    expect(socialJetlag(days, '2026-10-19', [1, 2, 3, 4, 5], 'UTC').minutes).toBeNull()
  })
})
