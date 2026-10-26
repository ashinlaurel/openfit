import { describe, expect, it } from 'vitest'
import { movementHours, movementWindow, workdaySettings, defaultWorkday, workdayAverages } from './movement'
const date = '2026-06-22'
const settings = { start:9, end:18, threshold:30 }
const interval = (start: string, end: string) => ({ startTime:start, endTime:end })
describe('workday movement', () => {
  it('clips to work hours and merges overlapping or adjacent intervals without counting twice', () => {
    const result = movementWindow([
      interval(`${date}T08:30:00Z`,`${date}T10:00:00Z`),
      interval(`${date}T09:30:00Z`,`${date}T10:15:00Z`),
      interval(`${date}T10:15:00Z`,`${date}T10:30:00Z`),
      interval(`${date}T17:50:00Z`,`${date}T19:00:00Z`),
    ], date, 'UTC',settings)
    expect(result.minutes).toBe(100)
    expect(result.longest).toBe(90)
    expect(result.longCount).toBe(1)
    expect(result.segments).toHaveLength(2)
  })
  it('uses profile timezone for instants and offset-free wall timestamps', () => {
    const result = movementWindow([
      interval(`${date}T03:30:00Z`, `${date}T04:00:00Z`),
      interval(`${date}T09:30:00`, `${date}T10:00:00`),
    ], date, 'Asia/Kolkata', settings)
    expect(result.minutes).toBe(60)
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].left).toBe(0)
  })
  it('handles intervals crossing midnight, filters invalid and out-of-day records', () => {
    const result = movementWindow([
      interval('2026-06-21T23:30:00Z',`${date}T01:00:00Z`),
      interval('bad','bad'), interval(`${date}T12:00:00Z`,`${date}T11:00:00Z`),
      interval('2026-06-21T09:00:00Z','2026-06-21T10:00:00Z'),
    ],date,'UTC',{start:0,end:24,threshold:60})
    expect(result.minutes).toBe(60)
    expect(result.longCount).toBe(1)
    expect(movementWindow([],date,'UTC',settings).longest).toBeNull()
  })
  it('measures actual elapsed time across a daylight saving transition', () => {
    const result=movementWindow([interval('2026-11-01T01:00:00-04:00','2026-11-01T02:00:00-05:00')], '2026-11-01','America/New_York',{start:0,end:24,threshold:60})
    expect(result.minutes).toBe(120)
    expect((result.end-result.start)/3600000).toBe(25)
  })
  it('keeps explicitly zero steps separate from missing records and sums observations', () => {
    const hours=movementHours([{time:'09:00',value:0},{time:'10:00',value:10},{time:'10:15',value:20}])
    expect(hours[8].steps).toBeNull()
    expect(hours[9].steps).toBe(0)
    expect(hours[10].steps).toBe(30)
  })
  it('rejects corrupt settings', () => {
    expect(workdaySettings({start:18,end:9,threshold:30})).toEqual(defaultWorkday)
    expect(workdaySettings(null)).toEqual(defaultWorkday)
  })
})

it('averages prior recorded workdays, excludes the selected date, and preserves zero stretch counts', () => {
  const periods = [
    interval('2026-06-21T10:00:00Z', '2026-06-21T10:20:00Z'),
    interval('2026-06-20T10:00:00Z', '2026-06-20T11:00:00Z'),
    interval('2026-06-22T10:00:00Z', '2026-06-22T18:00:00Z'),
    interval('2026-06-10T10:00:00Z', '2026-06-10T18:00:00Z'),
  ]
  expect(workdayAverages(periods, date, 'UTC', settings)).toEqual({ count: 2, minutes: 40, longest: 40, longCount: .5 })
  expect(workdayAverages([], date, 'UTC', settings)).toEqual({ count: 0, minutes: null, longest: null, longCount: null })
  expect(workdayAverages(periods, date, 'UTC', { start: 12, end: 18, threshold: 30 }).count).toBe(0)
})
