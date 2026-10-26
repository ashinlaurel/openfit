import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { sleepBaseline, sleepProcessingNote } from './sleep-page'

describe('sleep page context', () => {
  it('requires seven unique prior nights and excludes the selected day and future days', () => {
    const data = createDemoData('2026-10-25')
    const trends = data.sleep.historyTrends!
    expect(sleepBaseline(trends, data.selectedDate, 'sleepMinutes', 14).count).toBe(14)
    expect(sleepBaseline([...trends.slice(-6), ...trends.slice(-6)], data.selectedDate, 'sleepMinutes').average).toBeNull()
    expect(sleepBaseline(trends, '2026-09-27', 'sleepMinutes').count).toBe(1)
  })
  it('distinguishes processing, naps, and insufficient sensor coverage', () => {
    const session = createDemoData('2026-10-25').sleep.sessions![0]
    expect(sleepProcessingNote(session)).toBeNull()
    expect(sleepProcessingNote({ ...session, processed: false })).toContain('still processing')
    expect(sleepProcessingNote({ ...session, stageTimeline: [], stagesStatus: 'REJECTED_COVERAGE' })).toContain('insufficient coverage')
    expect(sleepProcessingNote({ ...session, stageTimeline: [], isNap: true })).toContain('nap')
  })
})
