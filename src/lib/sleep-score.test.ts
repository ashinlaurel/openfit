import { describe, expect, it } from 'vitest'
import type { SleepStageSegment, TrendPoint } from '@/types'
import { calculateSleepScore, sleepScoreForTrend } from './sleep-score'
import { analyzeSleepTimeline } from './sleep-timeline'

function timeline(parts: Array<[SleepStageSegment['type'], number]>) {
  let time = Date.parse('2026-10-23T22:00:00Z')
  return parts.map(([type, minutes]) => {
    const startTime = new Date(time).toISOString()
    time += minutes * 60000
    return { type, startTime, endTime: new Date(time).toISOString() }
  })
}
const night = (awake = 14) => timeline([['deep', 77], ['light', 120], ['wake', awake], ['light', 129], ['rem', 104]])

describe('OpenFit timeline sleep estimate v4', () => {
  it('reads duration and stages from the plotted timeline', () => {
    const result = calculateSleepScore({ totalMinutes: 430, stageTimeline: night() })
    expect(result.value).toBe(79)
    expect(result.stageContext.map(stage => stage.minutes)).toEqual([249, 77, 104])
    expect(result.timeline?.awakeMinutes).toBe(14)
  })
  it('scores the same sleep duration lower when the timeline contains more wakefulness', () => {
    expect(calculateSleepScore({ totalMinutes: 430, stageTimeline: night(60) }).value).toBe(59)
    const fragmented = timeline([['deep', 77], ['wake', 5], ['light', 80], ['wake', 5], ['light', 80], ['wake', 5], ['light', 89], ['wake', 5], ['rem', 104]])
    expect(calculateSleepScore({ totalMinutes: 430, stageTimeline: fragmented }).value).toBe(59)
  })
  it('merges consecutive wake rows and excludes leading/trailing wakefulness', () => {
    const result = analyzeSleepTimeline(timeline([['wake', 30], ['deep', 77], ['wake', 3], ['wake', 3], ['light', 249], ['rem', 104], ['wake', 30]]))!
    expect(result.awakeMinutes).toBe(6)
    expect(result.awakeEpisodes).toBe(1)
    expect(result.sustainedAwakenings).toBe(1)
    expect(result.longestSleepMinutes).toBe(353)
  })
  it('does not count transitions between sleeping stages as awakenings', () => {
    const result = analyzeSleepTimeline(timeline([['deep', 77], ['light', 249], ['rem', 104]]))!
    expect(result.sustainedAwakenings).toBe(0)
    expect(result.longestSleepMinutes).toBe(430)
  })
  it('rejects absent, unclassified, overlapping, gapped or inconsistent timelines', () => {
    expect(calculateSleepScore({ totalMinutes: 430 }).value).toBeNull()
    expect(calculateSleepScore({ totalMinutes: 430, stageTimeline: timeline([['light', 430]]) }).value).toBeNull()
    expect(calculateSleepScore({ totalMinutes: 300, stageTimeline: night() }).value).toBeNull()
    for (const offset of [-60000, 60000]) {
      const rows = night()
      rows[1].startTime = new Date(Date.parse(rows[1].startTime) + offset).toISOString()
      expect(calculateSleepScore({ totalMinutes: 430, stageTimeline: rows }).value).toBeNull()
    }
    expect(analyzeSleepTimeline([{ type: 'deep', startTime: 'invalid', endTime: 'invalid' }])).toBeNull()
  })
  it('ignores efficiency, time in bed and summary stage percentages', () => {
    const baseline = calculateSleepScore({ totalMinutes: 430, stageTimeline: night() })
    for (const efficiency of [null, 0, 30, 100, 101, NaN]) {
      expect(calculateSleepScore({ totalMinutes: 430, stageTimeline: night(), efficiency, timeInBed: Infinity, stages: [{ key: 'deep', minutes: 0 }] })).toEqual(baseline)
    }
  })
  it('uses adult stage flags without rewarding more REM or penalizing light alone', () => {
    const result = calculateSleepScore({ totalMinutes: 480, stageTimeline: timeline([['deep', 20], ['light', 220], ['rem', 240]]) })
    expect(result.stagePenalty).toBe(20)
    expect(result.value).toBe(80)
  })
  it('uses the same method for historical points and leaves missing timelines empty', () => {
    expect(sleepScoreForTrend({ sleepMinutes: 430, sleepStageTimeline: night() } as TrendPoint)).toBe(79)
    expect(sleepScoreForTrend({ sleepMinutes: 430 } as TrendPoint)).toBeNull()
  })
})
