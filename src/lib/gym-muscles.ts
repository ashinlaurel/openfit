export const MUSCLE_LABELS = {
  trapezius: 'Traps', deltoids: 'Shoulders', chest: 'Chest', 'upper-back': 'Upper back', serratus: 'Serratus',
  biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms', abs: 'Abs', obliques: 'Obliques',
  'lower-back': 'Lower back', gluteal: 'Glutes', quadriceps: 'Quads', hamstring: 'Hamstrings',
  adductors: 'Adductors', 'hip-flexors': 'Hip flexors', calves: 'Calves', tibialis: 'Shins',
} as const
export type MuscleId = keyof typeof MUSCLE_LABELS
export interface ExerciseMuscles { primary: MuscleId[]; secondary: MuscleId[]; equipment: string; bodyPart: string; category: string }
export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const aliases: Record<string, MuscleId> = {
  pectorals: 'chest', 'upper chest': 'chest', delts: 'deltoids', shoulders: 'deltoids', 'rear deltoids': 'deltoids',
  'rotator cuff': 'deltoids', glutes: 'gluteal', abductors: 'gluteal', quads: 'quadriceps', hamstrings: 'hamstring',
  forearms: 'forearm', wrists: 'forearm', 'wrist flexors': 'forearm', 'wrist extensors': 'forearm', 'grip muscles': 'forearm',
  lats: 'upper-back', 'latissimus dorsi': 'upper-back', back: 'upper-back', 'upper back': 'upper-back', rhomboids: 'upper-back',
  traps: 'trapezius', 'levator scapulae': 'trapezius', spine: 'lower-back', 'lower back': 'lower-back',
  core: 'abs', abdominals: 'abs', 'lower abs': 'abs', 'hip flexors': 'hip-flexors',
  'serratus anterior': 'serratus', brachialis: 'biceps', soleus: 'calves', shins: 'tibialis', groin: 'adductors', 'inner thighs': 'adductors',
}
const strings = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((x): x is string => typeof x === 'string')
export function canonicalMuscle(value: string): MuscleId | null {
  const name = value.toLowerCase().trim()
  return Object.hasOwn(MUSCLE_LABELS, name) ? name as MuscleId : Object.hasOwn(aliases, name) ? aliases[name] : null
}
export function exerciseMuscles(value: unknown): ExerciseMuscles {
  const data = object(value), weights = object(data.muscleWeights || data.weights)
  const unique = (values: string[]) => [...new Set(values.flatMap(name => {
    const id = canonicalMuscle(name)
    return id && !(Object.hasOwn(weights, id) && weights[id] === 0) ? [id] : []
  }))]
  const explicit = ['primaries', 'primaryMuscles', 'primary', 'secondaries', 'secondaryMuscles', 'secondary'].some(key => Object.hasOwn(data, key))
  let primary = unique(explicit ? strings(data.primaries ?? data.primaryMuscles ?? data.primary) : strings(data.muscleGroups ?? data.muscles ?? data.targetMuscles ?? data.tg ?? data.target))
  let secondary = unique(explicit ? strings(data.secondaries ?? data.secondaryMuscles ?? data.secondary) : [...strings(data.mg), ...strings(data.sm)])
  if (!primary.length && !secondary.length && Object.keys(weights).length) {
    primary = unique(Object.entries(weights).filter(([, weight]) => typeof weight === 'number' && weight >= 1).map(([key]) => key))
    secondary = unique(Object.entries(weights).filter(([, weight]) => typeof weight === 'number' && weight > 0 && weight < 1).map(([key]) => key))
  }
  return { primary, secondary: secondary.filter(id => !primary.includes(id)),
    equipment: typeof (data.eq ?? data.equipment) === 'string' ? String(data.eq ?? data.equipment) : '',
    bodyPart: typeof (data.bp ?? data.bodyPart) === 'string' ? String(data.bp ?? data.bodyPart) : '',
    category: typeof (data.cat ?? data.category) === 'string' ? String(data.cat ?? data.category) : '' }
}
