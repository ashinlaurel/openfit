import { completedGymSets, type GymWorkout } from './gym-sync'
import { exerciseMuscles, object, type MuscleId } from './gym-muscles'

export function analyzeGymSession(workout: GymWorkout, catalogue: Record<string, unknown>) {
  const groups = new Map<MuscleId, { id: MuscleId; primarySets: number; secondarySets: number; exerciseIndices: number[] }>()
  const exercises = workout.entries.map((entry, index) => {
    const logged = object(entry.muscleInfo)
    const info = Object.keys(logged).length ? logged : Object.hasOwn(catalogue, entry.id) ? catalogue[entry.id] : {}
    const muscles = exerciseMuscles(info)
    const completed = completedGymSets(entry), work = completed.filter(set => !set.warmup), warmups = completed.filter(set => set.warmup)
    if (work.length) for (const id of [...muscles.primary, ...muscles.secondary]) {
      const row = groups.get(id) || { id, primarySets: 0, secondarySets: 0, exerciseIndices: [] }
      if (muscles.primary.includes(id)) row.primarySets += work.length
      else row.secondarySets += work.length
      row.exerciseIndices.push(index); groups.set(id, row)
    }
    return { entry, index, muscles, completed, work, warmups }
  })
  return { exercises, groups: [...groups.values()].sort((a, b) => b.primarySets - a.primarySets || b.secondarySets - a.secondarySets),
    workSets: exercises.reduce((sum, row) => sum + row.work.length, 0),
    warmupSets: exercises.reduce((sum, row) => sum + row.warmups.length, 0),
    unmappedExercises: exercises.filter(row => row.work.length && !row.muscles.primary.length && !row.muscles.secondary.length).length }
}
