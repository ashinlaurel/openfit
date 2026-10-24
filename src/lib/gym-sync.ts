import type { ActivityItem } from '../types'

export interface GymSet {
  w: number | null; r: number | null; sec: number | null; min: number | null; speed: number | null
  rir: number | null; rpe: number | null; done: boolean | null; warmup: boolean
  at?: number | null; failure?: boolean; type?: string
  drops?: Array<{ w: number | null; r: number | null }>
  clusters?: Array<{ r: number | null; restSec: number | null }>
  sides?: Record<string, { w: number | null; r: number | null; done: boolean | null }>
}
export interface GymExercise { id: string; name: string; mode: string; note: string; sets: GymSet[]; muscleInfo?: unknown; target?: Record<string, unknown>; superset?: string }
export interface GymWorkout {
  id: string; date: string; name: string; start: number | null; end: number | null
  entries: GymExercise[]; volume: number | null; prs: string[]; note: string
  bodyWeight?: number | null
}
export interface GymProfile { unit: 'kg' | 'lb'; workouts: GymWorkout[] }
export type WorkoutLinks = Record<string, string | null>
export interface WorkoutLinkInput { gymId: string; mode: 'auto' | 'link' | 'unlink'; healthId?: string }
export interface GymCandidate { activity: ActivityItem; score: number; overlapMinutes: number }
export interface LinkedGymSession {
  gym: GymWorkout; health: ActivityItem | null
  status: 'automatic' | 'manual' | 'ambiguous' | 'unmatched' | 'unlinked' | 'missing-time' | 'missing-record'
  candidates: GymCandidate[]
}
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const text = (value: unknown) => typeof value === 'string' ? value : ''
const number = (value: unknown): number | null => {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function normalizeGymProfile(value: unknown, catalogue: unknown = {}): GymProfile {
  const state = record(value)
  const names = new Map<string, string>(Object.entries(record(catalogue)).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
  const custom = new Map(list(state.customEx).map(value => { const e = record(value); return [text(e.id), e] }))
  for (const raw of list(state.customEx)) {
    const entry = record(raw), name = text(entry.n) || text(entry.name)
    if (text(entry.id) && name) names.set(text(entry.id), name)
  }
  const seen = new Set<string>()
  const workouts = list(state.workouts).flatMap((raw, index): GymWorkout[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const w = record(raw)
    const id = text(w.id) || `gym:${text(w.d)}:${number(w.start)}:${number(w.end)}:${index}`
    if (seen.has(id)) return []
    seen.add(id)
    return [{
      id, date: text(w.d), name: text(w.name) || text(w.title) || 'Gym workout',
      start: number(w.start), end: number(w.end), volume: number(w.vol), note: text(w.note), bodyWeight: number(w.bw),
      prs: list(w.prs).map(text).filter(Boolean),
      entries: list(w.entries).flatMap(rawEntry => {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return []
        const e = record(rawEntry), exercise = record(e.exercise), target = record(e.target)
        const exerciseId = text(e.id)
        return [{ id: exerciseId,
          name: text(e.n) || text(e.name) || text(e.title) || text(exercise.name) || text(exercise.title) || names.get(exerciseId) || `Exercise ${exerciseId || 'without a name'}`,
          mode: text(target.mode) || 'reps', note: text(e.note), target, superset: text(e.sg),
          muscleInfo: e.muscleSnapshot || custom.get(exerciseId),
          sets: list(e.sets).filter(s => s !== null && typeof s === 'object' && !Array.isArray(s)).map(rawSet => {
            const s = record(rawSet)
            return { w: number(s.w), r: number(s.r), sec: number(s.sec), min: number(s.min), speed: number(s.speed),
              rir: number(s.rir), rpe: number(s.rpe), done: typeof s.done === 'boolean' ? s.done : null,
              warmup: s.phase ? s.phase === 'warmup' : s.warmup === true,
              at: number(s.at), failure: s.failure === true, type: text(s.type),
              drops: list(s.drops).map(raw => { const d = record(raw); return { w: number(d.w), r: number(d.r) } }),
              clusters: list(s.clusters).map(raw => { const c = record(raw); return { r: number(c.r), restSec: number(c.restSec) } }),
              sides: s.sides ? Object.fromEntries(['L', 'R'].map(side => { const p = record(record(s.sides)[side]); return [side, { w: number(p.w), r: number(p.r), done: typeof p.done === 'boolean' ? p.done : null }] })) : undefined }
          }) }]
      }),
    }]
  })
  return { unit: state.unit === 'lb' ? 'lb' : 'kg', workouts }
}

export const completedGymSets = (entry: GymExercise) => entry.sets.filter(s => s.sides
  ? Object.values(s.sides).some(side => side.done === true && (side.r ?? 0) > 0)
  : s.done !== false && ((s.r ?? 0) > 0 || (s.sec ?? 0) > 0 || (s.min ?? 0) > 0))
export function gymWindow(gym: GymWorkout): { start: number; end: number } | null {
  const { start, end } = gym
  return start !== null && end !== null && Number.isFinite(start) && Number.isFinite(end) && start > 0 && end <= 8640000000000000 && end > start && end - start <= 86400000 ? { start, end } : null
}
// Never interpret a provider timestamp without an offset in the desktop's timezone.
const instant = (value: string | null | undefined) => value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN
export function healthWindow(activity: ActivityItem): { start: number; end: number } | null {
  const start = instant(activity.startTime)
  let end = instant(activity.endTime)
  if (!Number.isFinite(end)) {
    const elapsed = activity.elapsedDurationMinutes ?? (activity.activeDurationMinutes === undefined && activity.elapsedDurationMinutes === undefined ? activity.durationMinutes : null)
    if (elapsed !== null && Number.isFinite(elapsed) && elapsed > 0) end = start + elapsed * 60000
  }
  return Number.isFinite(start) && start > 0 && Number.isFinite(end) && end > start && end - start <= 86400000 ? { start, end } : null
}
function compatible(gym: GymWorkout, activity: ActivityItem) {
  const kind = `${activity.exerciseType || ''} ${activity.name}`.toLowerCase()
  const strength = /strength|weight|resistance|functional|calisthenic|crossfit/.test(kind)
  const aerobic = /\brun\b|running|walk|cycling|biking|bicycle|swim|rowing|yoga|pilates|stretch|dance/.test(kind)
  const cardioOnly = gym.entries.length > 0 && gym.entries.every(entry => entry.mode === 'cardio')
  return { allowed: !aerobic || strength || cardioOnly, strength }
}
function candidate(gym: GymWorkout, activity: ActivityItem): GymCandidate | null {
  const a = gymWindow(gym), b = healthWindow(activity), type = compatible(gym, activity)
  if (!a || !b || !type.allowed) return null
  const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start)
  if (overlap <= 0) return null
  const shorter = Math.min(a.end - a.start, b.end - b.start), longer = Math.max(a.end - a.start, b.end - b.start)
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start)
  // A short walk nested inside a long lifting session is not the same workout.
  if (overlap / shorter < 0.7 || overlap / longer < 0.6) return null
  const iou = overlap / union
  if (iou < 0.75 && (Math.abs(a.start - b.start) > 15 * 60000 || Math.abs(a.end - b.end) > 15 * 60000)) return null
  return { activity, score: 0.65 * iou + 0.25 * overlap / shorter + (type.strength ? 0.1 : 0.05), overlapMinutes: overlap / 60000 }
}

export function linkGymWorkouts(workouts: GymWorkout[], activities: ActivityItem[], decisions: WorkoutLinks = {}): LinkedGymSession[] {
  const healthById = new Map(activities.map(a => [a.id, a]))
  const used = new Set<string>()
  const result = new Map<string, LinkedGymSession>()
  for (const gym of workouts) {
    if (!Object.hasOwn(decisions, gym.id)) continue
    const id = decisions[gym.id], health = id ? healthById.get(id) : undefined
    result.set(gym.id, { gym, health: health && !used.has(health.id) ? health : null,
      status: id === null ? 'unlinked' : health && !used.has(health.id) ? 'manual' : 'missing-record', candidates: [] })
    if (health) used.add(health.id)
  }
  const automatic = new Map<string, GymCandidate[]>()
  const byHealth = new Map<string, Array<{ gymId: string; score: number }>>()
  for (const gym of workouts) {
    if (result.has(gym.id)) continue
    const candidates = [...healthById.values()].filter(a => !used.has(a.id)).flatMap(a => {
      const c = candidate(gym, a)
      return c ? [c] : []
    }).sort((a, b) => b.score - a.score)
    automatic.set(gym.id, candidates)
    for (const c of candidates) {
      const rows = byHealth.get(c.activity.id) || []
      rows.push({ gymId: gym.id, score: c.score }); byHealth.set(c.activity.id, rows)
    }
  }
  for (const rows of byHealth.values()) rows.sort((a, b) => b.score - a.score)
  for (const gym of workouts) {
    if (result.has(gym.id)) continue
    const candidates = automatic.get(gym.id) || [], best = candidates[0]
    const competitors = best ? byHealth.get(best.activity.id)! : []
    const unique = best && (!candidates[1] || best.score - candidates[1].score >= 0.12)
      && competitors[0].gymId === gym.id && (!competitors[1] || best.score - competitors[1].score >= 0.12)
    result.set(gym.id, { gym, health: unique ? best.activity : null, candidates,
      status: unique ? 'automatic' : best ? 'ambiguous' : !gymWindow(gym) ? 'missing-time' : 'unmatched' })
  }
  return workouts.map(w => result.get(w.id)!)
}

export function manualHealthChoices(gym: GymWorkout, activities: ActivityItem[]) {
  const window = gymWindow(gym)
  return activities.filter(a => a.date === gym.date || (window && healthWindow(a) && Math.abs(healthWindow(a)!.start - window.start) <= 3 * 3600000))
    .sort((a, b) => {
      if (!window) return a.time.localeCompare(b.time)
      return Math.abs((healthWindow(a)?.start ?? Infinity) - window.start) - Math.abs((healthWindow(b)?.start ?? Infinity) - window.start)
    })
}
