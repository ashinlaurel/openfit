import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { sleepClock, sleepWeek } from './sleep-week'

describe('weekly sleep timing', () => {
  it('aligns overnight bars around midnight and returns exactly seven calendar dates', () => {
    const day = createDemoData('2026-10-19')
    day.trends = []
    day.sleep.historyTrends = []
    day.sleep.startTime = '2026-10-18T23:30:00Z'
    day.sleep.endTime = '2026-10-19T07:00:00Z'
    day.sleep.totalMinutes = 420
    const result = sleepWeek([day], day.selectedDate, 'UTC')
    expect(result.nights).toHaveLength(7)
    expect(result.nights[0].date).toBe('2026-10-13')
    expect(result.nights[6]).toMatchObject({ start: -30, end: 420, asleep: 420, elapsed: 450 })
    expect(result.timedCount).toBe(1)
    expect(result.min).toBe(-360)
    expect(result.max).toBe(720)
  })
  it('keeps offset-free wall times unchanged even when profile and device timezones differ', () => {
    const day = createDemoData('2026-10-19')
    day.trends = []
    day.sleep.historyTrends = []
    day.sleep.startTime = '2026-10-18T23:42:00'
    day.sleep.endTime = '2026-10-19T06:55:00'
    expect(sleepWeek([day], day.selectedDate, 'Europe/Rome').nights[6]).toMatchObject({ start: -18, end: 415 })
  })
  it('converts offset timestamps and retains actual elapsed time across daylight saving changes', () => {
    const day = createDemoData('2026-11-01')
    day.sleep.startTime = '2026-10-31T23:00:00-04:00'
    day.sleep.endTime = '2026-11-01T07:00:00-05:00'
    const night = sleepWeek([day], day.selectedDate, 'America/New_York').nights[6]
    expect(night).toMatchObject({ start: -60, end: 420, elapsed: 540 })
  })
  it('does not invent timing from duration and expands the domain for daytime sleep', () => {
    const day = createDemoData('2026-10-19')
    day.trends = []
    day.sleep.historyTrends = []
    day.sleep.startTime = null
    day.sleep.endTime = null
    day.sleep.totalMinutes = 0
    expect(sleepWeek([day], day.selectedDate, 'UTC').nights[6]).toMatchObject({ start: null, end: null, asleep: 0 })
    day.sleep.startTime = '2026-10-19T09:00:00Z'
    day.sleep.endTime = '2026-10-19T17:00:00Z'
    expect(sleepWeek([day], day.selectedDate, 'UTC').max).toBe(1080)
    day.sleep.endTime = '2026-10-19T08:00:00Z'
    expect(sleepWeek([day], day.selectedDate, 'UTC').timedCount).toBe(0)
    expect(sleepClock(-60)).toBe('11:00 PM')
    expect(sleepClock(1440)).toBe('12:00 AM')
  })
})

it('uses explicit trend timing for 30 days without fabricating timing for missing nights', () => {
  const day = createDemoData('2026-10-25')
  day.trends = day.sleep.historyTrends!
  const result = sleepWeek([day], day.selectedDate, 'Asia/Kolkata', 30)
  expect(result.nights).toHaveLength(30)
  expect(result.timedCount).toBe(30)
  expect(result.nights.at(-2)?.asleep).toBe(createDemoData('2026-10-24').sleep.totalMinutes)
  day.trends = day.trends.map(p => p.date === '2026-10-24' ? { ...p, sleepStartTime: null, sleepEndTime: null } : p)
  day.sleep.historyTrends = day.trends
  expect(sleepWeek([day], day.selectedDate, 'Asia/Kolkata', 30).nights.at(-2)?.start).toBeNull()
})

it('uses newer history to repair an empty archived day and includes naps without changing main duration', () => {
  const old = createDemoData('2026-10-28')
  old.generatedAt = '2026-10-27T19:52:00Z'
  old.sleep.totalMinutes = null
  old.sleep.startTime = old.sleep.endTime = null
  old.sleep.sessions = []
  const latest = createDemoData('2026-10-31')
  latest.generatedAt = '2026-10-31T15:02:00Z'
  latest.sleep.historyTrends = [{ ...latest.trends[0], date: old.selectedDate, sleepMinutes: 410, sleepStartTime: '2026-10-27T21:18:00Z', sleepEndTime: '2026-10-28T04:34:00Z' }]
  const nap = { ...latest.sleep.sessions![1], id: 'nap-28', date: old.selectedDate, startTime: '2026-10-28T06:15:00Z', endTime: '2026-10-28T08:12:00Z', totalMinutes: 115 }
  latest.sleep.historySessions = [nap]
  for (const days of [[old, latest], [latest, old]]) {
    const result = sleepWeek(days, latest.selectedDate, 'Asia/Kolkata')
    const night = result.nights.find(n => n.date === old.selectedDate)!
    expect(night).toMatchObject({ start: 168, end: 604, asleep: 410 })
    expect(night.sessions).toEqual([expect.objectContaining({ id: 'nap-28', start: 705, end: 822, asleep: 115 })])
    expect(result.max).toBeGreaterThanOrEqual(822)
  }
  // A newer response can remove a previously recorded session.
  latest.sleep.historySessions = []
  expect(sleepWeek([old, latest], latest.selectedDate, 'Asia/Kolkata').nights.find(n => n.date === old.selectedDate)?.sessions).toEqual([])
})
