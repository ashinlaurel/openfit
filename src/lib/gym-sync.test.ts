import { describe, expect, it } from 'vitest'
import type { ActivityItem } from '@/types'
import { completedGymSets, gymWindow, healthWindow, linkGymWorkouts, manualHealthChoices, normalizeGymProfile, type GymWorkout } from './gym-sync'

const at = (clock: string) => Date.parse(`2026-10-20T${clock}:00+05:30`)
const gym = (patch: Partial<GymWorkout> = {}): GymWorkout => ({ id: 'gym-1', date: '2026-10-20', name: 'Push', start: at('18:05'), end: at('19:10'), entries: [], volume: null, prs: [], note: '', ...patch })
const health = (patch: Partial<ActivityItem> = {}): ActivityItem => ({ id: 'fitbit-1', name: 'Weight training', date: '2026-10-20', time: '18:00', startTime: '2026-10-20T18:00:00+05:30', endTime: '2026-10-20T19:15:00+05:30', exerciseType: 'WEIGHT_TRAINING', durationMinutes: 75, elapsedDurationMinutes: 75, calories: 320, distanceKm: null, averageHeartRate: 125, zoneMinutes: null, steps: null, averagePaceSecondsPerMeter: null, heartZoneMinutes: null, ...patch })

describe('Open Gym and Google Health session linking', () => {
  it('links a clear overlap despite different start/stop times, preserving both original records', () => {
    const original = gym(), recording = health()
    const result = linkGymWorkouts([original], [recording])[0]
    expect(result.status).toBe('automatic')
    expect(result.gym).toBe(original)
    expect(result.health).toBe(recording)
    expect(result.candidates[0].overlapMinutes).toBe(65)
    expect(result.health?.calories).toBe(320)
  })
  it('uses absolute instants across midnight and DST, independent of date labels', () => {
    const g = gym({ date: '2026-11-01', start: Date.parse('2026-11-01T01:30:00-04:00'), end: Date.parse('2026-11-01T01:30:00-05:00') })
    const h = health({ date: '2026-11-02', startTime: '2026-11-01T05:30:00Z', endTime: '2026-11-01T06:30:00Z' })
    expect(linkGymWorkouts([g], [h])[0].health).toBe(h)
    const midnight = gym({ start: Date.parse('2026-10-20T23:40:00+05:30'), end: Date.parse('2026-10-21T00:40:00+05:30') })
    expect(linkGymWorkouts([midnight], [health({ startTime: '2026-10-20T18:10:00Z', endTime: '2026-10-20T19:10:00Z' })])[0].status).toBe('automatic')
  })
  it('does not turn active minutes into elapsed time or guess a timezone', () => {
    expect(healthWindow(health({ startTime: '2026-10-20T18:00:00', endTime: '2026-10-20T19:15:00' }))).toBeNull()
    expect(healthWindow(health({ endTime: null, elapsedDurationMinutes: null, activeDurationMinutes: 60 }))).toBeNull()
    expect(healthWindow(health({ endTime: null, elapsedDurationMinutes: 75 }))).toEqual({ start: at('18:00'), end: at('19:15') })
    expect(healthWindow(health({ endTime: null, elapsedDurationMinutes: undefined }))).toEqual({ start: at('18:00'), end: at('19:15') })
  })
  it('leaves imported date-only sessions unlinked, with same-day manual choices', () => {
    const g = gym({ start: null, end: null })
    expect(linkGymWorkouts([g], [health()])[0].status).toBe('missing-time')
    expect(manualHealthChoices(g, [health()])).toHaveLength(1)
    expect(gymWindow(gym({ end: at('18:00') }))).toBeNull()
    expect(gymWindow(gym({ start: 0, end: 1000 }))).toBeNull()
  })
  it('rejects adjacent workouts, small nested sessions, and unrelated aerobic recordings', () => {
    expect(linkGymWorkouts([gym()], [health({ startTime: '2026-10-20T19:10:00+05:30', endTime: '2026-10-20T20:10:00+05:30' })])[0].health).toBeNull()
    expect(linkGymWorkouts([gym()], [health({ startTime: '2026-10-20T18:20:00+05:30', endTime: '2026-10-20T18:30:00+05:30' })])[0].health).toBeNull()
    expect(linkGymWorkouts([gym()], [health({ exerciseType: 'RUNNING', name: 'Running' })])[0].health).toBeNull()
  })
  it('requires review when two similar Fitbit recordings could fit', () => {
    const result = linkGymWorkouts([gym()], [health(), health({ id: 'fitbit-2' })])[0]
    expect(result.status).toBe('ambiguous')
    expect(result.health).toBeNull()
    expect(result.candidates).toHaveLength(2)
  })
  it('never assigns a Fitbit recording to two gym sessions', () => {
    const result = linkGymWorkouts([gym(), gym({ id: 'gym-2' })], [health()])
    expect(result.every(row => row.status === 'ambiguous' && !row.health)).toBe(true)
    const confirmed = linkGymWorkouts([gym(), gym({ id: 'gym-2' })], [health()], { 'gym-1': 'fitbit-1' })
    expect(confirmed[0].status).toBe('manual')
    expect(confirmed[1].health).toBeNull()
  })
  it('honors explicit unlinking and preserves a missing saved recording without choosing a replacement', () => {
    expect(linkGymWorkouts([gym()], [health()], { 'gym-1': null })[0].status).toBe('unlinked')
    const missing = linkGymWorkouts([gym()], [health()], { 'gym-1': 'deleted-recording' })[0]
    expect(missing.status).toBe('missing-record')
    expect(missing.health).toBeNull()
    expect(linkGymWorkouts([gym()], [health()], {})[0].status).toBe('automatic')
  })
  it('lets a manual choice override timing for backfilled sessions', () => {
    const result = linkGymWorkouts([gym({ start: null, end: null })], [health()], { 'gym-1': 'fitbit-1' })[0]
    expect(result.status).toBe('manual')
    expect(result.health?.id).toBe('fitbit-1')
  })
})

describe('Open Gym profile normalization', () => {
  it('resolves catalogue IDs without changing source data, while custom names take precedence', () => {
    const raw = { customEx: [{ id: 'custom', n: 'My own lift' }], workouts: [{ id: 'g', entries: [{ id: '0025' }, { id: 'custom' }] }] }
    const normalized = normalizeGymProfile(raw, { '0025': 'barbell bench press', custom: 'Outdated name' })
    expect(normalized.workouts[0].entries.map(e => e.name)).toEqual(['barbell bench press', 'My own lift'])
    expect(raw.workouts[0].entries[0]).toEqual({ id: '0025' })
  })
  it('keeps explicit zeros, custom exercise names, effort and completed set semantics', () => {
    const profile = normalizeGymProfile({ unit: 'lb', customEx: [{ id: 'custom', n: 'My press' }], workouts: [{ id: 'g', d: '2026-10-20', vol: 0, entries: [{ id: 'custom', sets: [{ w: 0, r: 10, done: true, rir: 0 }, { w: 25, r: 8, done: false }, { w: 30 }, { sec: 60, phase: 'warmup' }] }] }] })
    expect(profile.unit).toBe('lb')
    expect(profile.workouts[0].volume).toBe(0)
    expect(profile.workouts[0].entries[0].name).toBe('My press')
    const completed = completedGymSets(profile.workouts[0].entries[0])
    expect(completed).toHaveLength(2)
    expect(completed[0]).toMatchObject({ w: 0, rir: 0 })
    expect(completed[1].warmup).toBe(true)
  })
  it('handles malformed and absent state without inventing workouts or metrics', () => {
    expect(normalizeGymProfile(null)).toEqual({ unit: 'kg', workouts: [] })
    expect(normalizeGymProfile({ workouts: {} }).workouts).toEqual([])
    const profile = normalizeGymProfile({ workouts: [null, [], { id: 'same', entries: [null, { sets: [null, { r: -1, w: '' }] }] }, { id: 'same' }] })
    expect(profile.workouts).toHaveLength(1)
    expect(profile.workouts[0].volume).toBeNull()
    expect(completedGymSets(profile.workouts[0].entries[0])).toHaveLength(0)
  })
})
