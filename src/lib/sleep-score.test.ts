import { describe, expect, it } from 'vitest'
import { calculateSleepScore } from './sleep-score'

describe('OpenFit sleep score v1', () => {
  it('explains the Oct 24 record independently of the provider score', () => {
    const result = calculateSleepScore({ totalMinutes: 430, timeInBed: 444, stages: [{ key: 'light', minutes: 249 }, { key: 'deep', minutes: 77 }, { key: 'rem', minutes: 104 }] })
    expect(result.value).toBe(93)
    expect(result.continuitySource).toBe('duration-ratio')
    expect(result.stageContext.map(stage => stage.minutes)).toEqual([249, 77, 104])
    expect(result.components.reduce((sum, part) => sum + part.weight, 0)).toBe(100)
  })
  it('never treats absent, zero or contradictory measurements as a good night', () => {
    for (const input of [
      { totalMinutes: null, timeInBed: 480 }, { totalMinutes: 0, timeInBed: 480 },
      { totalMinutes: 420 }, { totalMinutes: 420, timeInBed: 400, efficiency: 95 },
      { totalMinutes: NaN, efficiency: 90 }, { totalMinutes: 1500, timeInBed: 1600 },
      { totalMinutes: 420, efficiency: 101 }, { totalMinutes: 420, timeInBed: Infinity },
    ]) expect(calculateSleepScore(input).value).toBeNull()
  })
  it('keeps missing stages from changing a complete duration/continuity score', () => {
    const input = { totalMinutes: 420, timeInBed: 450 }
    const incomplete = calculateSleepScore({ ...input, stages: [{ key: 'light', minutes: 420 }] })
    expect(incomplete.stageContext).toEqual([])
    expect(incomplete.value).toBe(calculateSleepScore(input).value)
    expect(calculateSleepScore({ totalMinutes: 1, timeInBed: 2, stages: [{ key: 'light', minutes: 0 }, { key: 'deep', minutes: 0 }, { key: 'rem', minutes: 0 }] }).stageContext).toEqual([])
  })
  it('does not reward short efficient nights over longer consolidated nights', () => {
    expect(calculateSleepScore({ totalMinutes: 240, timeInBed: 240 }).value).toBe(55)
    expect(calculateSleepScore({ totalMinutes: 420, timeInBed: 480 }).value).toBeGreaterThan(55)
    expect(calculateSleepScore({ totalMinutes: 420, timeInBed: 600 }).value).toBeLessThan(calculateSleepScore({ totalMinutes: 420, timeInBed: 450 }).value!)
  })
  it('uses reported efficiency only when time in bed is absent', () => {
    expect(calculateSleepScore({ totalMinutes: 480, efficiency: 90 }).continuitySource).toBe('reported-efficiency')
    expect(calculateSleepScore({ totalMinutes: 480, timeInBed: 600, efficiency: 100 }).value).toBe(90)
  })
  it('is bounded and monotonic, with no extra reward or automatic penalty after eight hours', () => {
    let previous = 0
    for (let minutes = 1; minutes <= 1440; minutes++) {
      const score = calculateSleepScore({ totalMinutes: minutes, efficiency: 95 }).value!
      expect(score).toBeGreaterThanOrEqual(previous)
      expect(score).toBeLessThanOrEqual(100)
      previous = score
    }
    expect(calculateSleepScore({ totalMinutes: 600, timeInBed: 600 }).value).toBe(100)
  })
})
