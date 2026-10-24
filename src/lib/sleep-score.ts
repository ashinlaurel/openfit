import type { SleepStage, TrendPoint } from '@/types'

// Research informs the dimensions; these weights and curves are OpenFit design
// choices, not coefficients from a validated clinical instrument. See docs/SLEEP_SCORE.md.
export const SLEEP_SCORE_VERSION = 'openfit-sleep-v1'
export const SLEEP_SCORE_SOURCES = [
  { label: 'Watson et al., 2015 · adult sleep duration', url: 'https://pubmed.ncbi.nlm.nih.gov/26039963/' },
  { label: 'Ohayon et al., 2017 · sleep continuity', url: 'https://pubmed.ncbi.nlm.nih.gov/28346153/' },
  { label: 'Chinoy et al., 2021 · wearable accuracy', url: 'https://pubmed.ncbi.nlm.nih.gov/33378539/' },
] as const

export const DURATION_CURVE = [[0, 0], [240, 25], [360, 60], [420, 85], [480, 100]] as const
export const CONTINUITY_CURVE = [[0, 0], [50, 0], [75, 60], [85, 90], [95, 100], [100, 100]] as const

type Input = {
  totalMinutes: number | null
  timeInBed?: number | null
  efficiency?: number | null
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
  const minutes = input.totalMinutes
  let reason: string | null = null
  let efficiency: number | null = null
  let continuitySource: 'duration-ratio' | 'reported-efficiency' | null = null
  if (!finite(minutes) || minutes <= 0 || minutes > 1440) {
    reason = 'A valid sleep duration is needed.'
  } else if (input.timeInBed !== null && input.timeInBed !== undefined) {
    if (!finite(input.timeInBed) || input.timeInBed < minutes || input.timeInBed > 1440) reason = 'Sleep duration and time in bed are inconsistent.'
    else { efficiency = minutes / input.timeInBed * 100; continuitySource = 'duration-ratio' }
  } else if (finite(input.efficiency) && input.efficiency > 0 && input.efficiency <= 100) {
    efficiency = input.efficiency; continuitySource = 'reported-efficiency'
  } else reason = 'Time in bed or a valid efficiency reading is needed.'

  const stageRows = (['light', 'deep', 'rem'] as const).map(key => ({ key, rows: input.stages?.filter(stage => stage.key === key) ?? [] }))
  const stageTotal = stageRows.reduce((sum, entry) => sum + (entry.rows[0]?.minutes ?? 0), 0)
  const stagesUsable = finite(minutes) && minutes > 0 && stageTotal > 0
    && stageRows.some(entry => entry.key !== 'light' && (entry.rows[0]?.minutes ?? 0) > 0)
    && stageRows.every(entry => entry.rows.length === 1 && finite(entry.rows[0].minutes) && entry.rows[0].minutes >= 0)
    && Math.abs(stageTotal - minutes) <= Math.max(5, minutes * 0.02)
  const stageContext = stagesUsable ? stageRows.map(entry => ({ key: entry.key, minutes: entry.rows[0].minutes, percent: entry.rows[0].minutes / stageTotal * 100 })) : []

  const components = reason === null && finite(minutes) && efficiency !== null ? [
    { key: 'duration', label: 'Duration', weight: 60, score: interpolate(minutes, DURATION_CURVE), observed: minutes, unit: 'min' },
    { key: 'continuity', label: 'Continuity', weight: 40, score: interpolate(efficiency, CONTINUITY_CURVE), observed: efficiency, unit: '%' },
  ] : []
  return {
    version: SLEEP_SCORE_VERSION,
    value: components.length ? Math.round(components.reduce((sum, component) => sum + component.score * component.weight / 100, 0)) : null,
    reason, components, continuitySource, stageContext,
  }
}

export function sleepScoreForTrend(point: TrendPoint) {
  return calculateSleepScore({ totalMinutes: point.sleepMinutes, timeInBed: point.sleepTimeInBed, efficiency: point.sleepEfficiency }).value
}
