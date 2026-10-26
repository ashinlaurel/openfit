import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { calculateMovementScore, movementScoreForTrend } from './movement-score'
import { movementWindow } from './movement'

function day() {
  const data = createDemoData('2026-10-24')
  data.generatedAt = '2026-10-25T00:00:00Z'
  Object.assign(data.activity, { steps: 8000, stepsGoal: null, distanceKm: 6, distanceGoalKm: null, activeCalories: 500, moderateActiveMinutes: 30, vigorousActiveMinutes: 0, activeMinutesGoal: null, zoneMinutes: 30, lightActiveMinutes: 120, sedentaryIntervals: [], stepsIntraday: Array.from({length:8},(_,i)=>({time:`${String(8+i).padStart(2,'0')}:00`,value:1000})) })
  return data
}
describe('movement estimate v1', () => {
  it('reaches 100 at all targets and is capped despite excess activity', () => {
    const data = day()
    expect(calculateMovementScore(data)).toMatchObject({ value: 100, coverage: 100, inactivityPenalty: 0 })
    Object.assign(data.activity, { steps: 90000, distanceKm: 100, activeCalories: 3000, moderateActiveMinutes: 100, lightActiveMinutes: 500 })
    expect(calculateMovementScore(data).value).toBe(100)
  })
  it('keeps measured zero separate from unavailable inputs', () => {
    const data = day()
    Object.assign(data.activity, { steps: 0, distanceKm: 0, activeCalories: 0, moderateActiveMinutes: 0, vigorousActiveMinutes: 0, zoneMinutes: 0, lightActiveMinutes: 0, stepsIntraday: [{time:'09:00',value:0}] })
    expect(calculateMovementScore(data).value).toBe(0)
    Object.assign(data.activity, { steps: null, distanceKm: null, activeCalories: null, moderateActiveMinutes: null, vigorousActiveMinutes: null, zoneMinutes: null, lightActiveMinutes: null, stepsIntraday: [] })
    expect(calculateMovementScore(data)).toMatchObject({ value: null, coverage: 0 })
  })
  it('does not count correlated volume signals three times or add zone credit on top of intensity', () => {
    const data = day()
    const full = calculateMovementScore(data).value
    data.activity.distanceKm = null; data.activity.activeCalories = null; data.activity.zoneMinutes = 200
    expect(calculateMovementScore(data).value).toBe(full)
    data.activity.steps = 0; data.activity.activeCalories = 500
    expect(calculateMovementScore(data).value).toBe(full)
  })
  it('requires enough input weight and labels reweighted partial estimates', () => {
    const data = day()
    Object.assign(data.activity, { moderateActiveMinutes: null, vigorousActiveMinutes: null, zoneMinutes: null, lightActiveMinutes: null, stepsIntraday: [] })
    expect(calculateMovementScore(data)).toMatchObject({ value: null, coverage: 45 })
    data.activity.zoneMinutes = 30
    expect(calculateMovementScore(data)).toMatchObject({ value: 100, coverage: 75, reason: 'Partial data', intensitySource: 'Zone minutes' })
  })
  it('merges inactive intervals before applying a bounded penalty and ignores other days', () => {
    const data = day()
    data.activity.sedentaryIntervals = [
      {startTime:'2026-10-24T10:00:00+05:30',endTime:'2026-10-24T12:00:00+05:30'},
      {startTime:'2026-10-24T11:00:00+05:30',endTime:'2026-10-24T13:00:00+05:30'},
      {startTime:'2026-10-23T00:00:00+05:30',endTime:'2026-10-23T23:59:00+05:30'},
    ]
    expect(calculateMovementScore(data)).toMatchObject({ value: 90, inactivityPenalty: 10, longestInactive: 180 })
  })
  it('excludes future intervals and hourly records from a partial-day snapshot', () => {
    const data = day(); data.generatedAt = '2026-10-24T03:00:00Z'
    data.activity.sedentaryIntervals = [{startTime:'2026-10-24T09:00:00+05:30',endTime:'2026-10-24T18:00:00+05:30'}]
    const score = calculateMovementScore(data)
    expect(score.longestInactive).toBeNull()
    expect(score.movingHours).toBe(1)
    expect(movementWindow(data.activity.sedentaryIntervals, data.selectedDate, 'Asia/Kolkata', {start:9,end:18,threshold:30},Date.parse(data.generatedAt)).segments).toEqual([])
  })
  it('rejects negative and nonfinite values, and increasing valid activity cannot reduce the base score', () => {
    const data = day(); Object.assign(data.activity, {steps:-1,distanceKm:NaN,activeCalories:Infinity})
    expect(calculateMovementScore(data).coverage).toBe(55)
    const low = day(); low.activity.steps=1000; low.activity.distanceKm=0; low.activity.activeCalories=0
    const before = calculateMovementScore(low).value!
    low.activity.steps=5000
    expect(calculateMovementScore(low).value!).toBeGreaterThan(before)
  })
  it('uses the same historical formula and discloses missing intraday coverage', () => {
    const data = day(), point = {...data.trends.at(-1)!, date:data.selectedDate,steps:8000,distanceKm:6,activeCalories:500,moderateActiveMinutes:30,vigorousActiveMinutes:0,lightActiveMinutes:120,zoneMinutes:30}
    expect(movementScoreForTrend(point,data)).toMatchObject({value:100,coverage:90,reason:'Partial data'})
  })
})
