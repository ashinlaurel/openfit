import { describe, expect, it } from 'vitest'
import { normalizeGymProfile } from './gym-sync'
import { analyzeGymSession } from './gym-session-analysis'
import { exerciseMuscles } from './gym-muscles'

describe('Gym muscle and set details', () => {
  it('canonicalizes muscles, excludes zero weights and removes duplicate roles', () => {
    expect(exerciseMuscles({ tg: 'pectorals', mg: 'upper chest', sm: ['triceps', 'biceps'], muscleWeights: { biceps: 0 } })).toMatchObject({ primary: ['chest'], secondary: ['triceps'] })
    expect(exerciseMuscles({ bp: 'full body' }).primary).toEqual([])
    expect(exerciseMuscles({ muscleGroups: ['quads', 'glutes'] }).primary).toEqual(['quadriceps', 'gluteal'])
  })
  it('uses logged snapshots before the current catalogue and excludes warm-ups and unfinished sets', () => {
    const workout = normalizeGymProfile({ workouts: [{ id: 'w', entries: [{ id: 'press', muscleSnapshot: { primaries: ['chest'], secondaries: ['triceps'] }, sets: [
      { r: 10, done: true, warmup: true }, { r: 8, done: true, rir: 0 }, { r: 8, done: false },
    ] }, { id: 'unknown', sets: [{ sec: 30, done: true }] }] }] }).workouts[0]
    const result = analyzeGymSession(workout, { press: { tg: 'biceps' } })
    expect(result.workSets).toBe(2)
    expect(result.warmupSets).toBe(1)
    expect(result.unmappedExercises).toBe(1)
    expect(result.groups).toEqual([
      { id: 'chest', primarySets: 1, secondarySets: 0, exerciseIndices: [0] },
      { id: 'triceps', primarySets: 0, secondarySets: 1, exerciseIndices: [0] },
    ])
    expect(result.exercises[0].work[0].rir).toBe(0)
  })
  it('retains custom metadata, side completion, drop sets and rest-pause bursts without inflating counts', () => {
    const workout = normalizeGymProfile({ customEx: [{ id: 'custom', muscleGroups: ['quads'] }], workouts: [{ bw: 70, entries: [{ id: 'custom', sets: [
      { r: 12, done: true, type: 'restpause', clusters: [{ r: 8, restSec: 20 }, { r: 4, restSec: 0 }], at: 1792490700000 },
      { done: false, sides: { L: { r: 8, w: 10, done: true }, R: { r: 8, w: 10, done: false } } },
      { r: 8, done: true, type: 'dropset', drops: [{ w: 5, r: 4 }] },
    ] }] }] }).workouts[0]
    const result = analyzeGymSession(workout, {})
    expect(result.workSets).toBe(3)
    expect(result.groups[0].id).toBe('quadriceps')
    expect(result.exercises[0].completed[0].clusters).toHaveLength(2)
    expect(result.exercises[0].completed[2].drops).toEqual([{ w: 5, r: 4 }])
    expect(workout.bodyWeight).toBe(70)
  })
})
