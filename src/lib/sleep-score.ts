import { analyzeSleepTimeline } from './sleep-timeline'
import type { SleepStage, SleepStageSegment, TrendPoint } from '@/types'

// Research informs the dimensions; these weights and curves are OpenFit design
// choices, not coefficients from a validated clinical instrument. See docs/SLEEP_SCORE.md.
export const SLEEP_SCORE_VERSION = 'openfit-sleep-v4'
export const SLEEP_SCORE_SOURCES = [
  { label: 'Watson et al., 2015 · adult sleep duration', url: 'https://pubmed.ncbi.nlm.nih.gov/26039963/' },
  { label: 'Ohayon et al., 2017 · awakenings and stages', url: 'https://doi.org/10.1016/j.sleh.2016.11.006' },
  { label: 'Chinoy et al., 2021 · wearable accuracy', url: 'https://pubmed.ncbi.nlm.nih.gov/33378539/' },
] as const

export const DURATION_CURVE = [[0, 0], [240, 25], [360, 60], [420, 75], [480, 100]] as const

type Input = {
  totalMinutes: number | null
  processed?: boolean | null
  // Accepted for compatibility with sleep records; neither field affects scoring.
  timeInBed?: number | null
  efficiency?: number | null
  stageTimeline?: SleepStageSegment[]
  stages?: Array<Pick<SleepStage, 'key' | 'minutes'>>
}

function interpolate(value: number, curve: ReadonlyArray<readonly [number, number]>) {
  for (let i = 1; i < curve.length; i++) {
    const [x, y] = curve[i], [previousX, previousY] = curve[i - 1]
    if (value <= x) return previousY + (value - previousX) / (x - previousX) * (y - previousY)
  }
  return curve[curve.length - 1][1]
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function calculateSleepScore(input: Input) {
  const timeline = analyzeSleepTimeline(input.stageTimeline)
  const minutes = timeline?.asleepMinutes ?? null
  let reason: string | null = timeline ? null : 'A complete staged sleep timeline is needed.'
  if (input.processed === false) reason = 'Google is still processing this sleep session.'
  if (timeline && finite(input.totalMinutes) && Math.abs(input.totalMinutes - timeline.asleepMinutes) > Math.max(5, input.totalMinutes * 0.02)) {
    reason = 'The timeline and recorded sleep duration disagree.'
  }
  const stageContext = timeline ? (['light', 'deep', 'rem'] as const).map(key => ({
    key, minutes: timeline.totals[key], percent: timeline.totals[key] / timeline.asleepMinutes * 100,
  })) : []
  const durationScore = minutes === null ? 0 : interpolate(minutes, DURATION_CURVE)
  // Research supplies indicators, not point deductions. These curves are
  // conservative OpenFit engineering choices, documented in SLEEP_SCORE.md.
  const awakePenalty = timeline ? interpolate(timeline.awakeMinutes, [[0, 0], [20, 0], [40, 10], [60, 20], [120, 40]]) : 0
  const awakeningPenalty = timeline ? interpolate(timeline.sustainedAwakenings, [[0, 0], [1, 0], [2, 5], [3, 10], [4, 20], [6, 30]]) : 0
  // Avoid adding two deductions for the same wakefulness.
  const fragmentationPenalty = Math.max(awakePenalty, awakeningPenalty)
  const deepPercent = stageContext.find(stage => stage.key === 'deep')?.percent ?? 0
  const remPercent = stageContext.find(stage => stage.key === 'rem')?.percent ?? 0
  // Adult indicators only; no claim that more deep/REM or less light is better.
  const stagePenalty = timeline ? (deepPercent <= 5 ? 10 : 0) + (remPercent >= 41 ? 10 : 0) : 0
  const timelinePenalty = fragmentationPenalty + stagePenalty
  const components = reason === null && minutes !== null ? [
    { key: 'duration', label: 'Duration base', weight: 100, score: durationScore, observed: minutes, unit: 'min' },
  ] : []
  return {
    version: SLEEP_SCORE_VERSION,
    value: components.length ? Math.round(Math.max(0, durationScore - timelinePenalty)) : null,
    reason, components, stageContext, timeline, timelinePenalty, fragmentationPenalty, stagePenalty,
  }
}

export function sleepScoreForTrend(point: TrendPoint) {
  return calculateSleepScore({ totalMinutes: point.sleepMinutes, stageTimeline: point.sleepStageTimeline }).value
}
