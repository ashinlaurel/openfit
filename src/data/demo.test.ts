import { describe, expect, it } from 'vitest'
import { createDemoData } from './demo'

describe('createDemoData', () => {
  it('creates a complete deterministic dashboard for the selected date', () => {
    const first = createDemoData('2026-06-22')
    const second = createDemoData('2026-06-22')

    expect(first.selectedDate).toBe('2026-06-22')
    expect(first.activity.steps).toBe(second.activity.steps)
    expect(first.trends).toHaveLength(14)
    expect(first.health.heartRateIntraday).toHaveLength(48)
    expect(first.sleep.stages.reduce((sum, stage) => sum + stage.minutes, 0)).toBeGreaterThan(0)
  })
})

it('keeps sleep duration, stages, timestamps and overlapping historical dates consistent', () => {
  const data = createDemoData('2026-10-25')
  expect(data.sleep.historyTrends).toHaveLength(30)
  for (const point of data.sleep.historyTrends!) {
    const day = createDemoData(point.date)
    expect(day.sleep.totalMinutes).toBe(point.sleepMinutes)
    for (const key of ['hrvMs', 'spo2', 'breathingRate', 'skinTemperature'] as const) expect(day.health[key]).toBe(point[key])
    expect(day.sleep.stageTimeline).toEqual(point.sleepStageTimeline)
    const asleep = day.sleep.stageTimeline.filter(s => s.type !== 'wake').reduce((sum, s) => sum + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 60000, 0)
    expect(asleep).toBe(day.sleep.totalMinutes)
    expect((Date.parse(day.sleep.endTime!) - Date.parse(day.sleep.startTime!)) / 60000).toBe(day.sleep.timeInBed)
    expect(day.sleep.stages.reduce((sum, s) => sum + s.minutes, 0)).toBe(day.sleep.timeInBed)
  }
})
