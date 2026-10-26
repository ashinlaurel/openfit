import type { DashboardData, TrendPoint } from '@/types'
import { movementHours, movementWindow, zonedInstant } from './movement'

export const MOVEMENT_SCORE_VERSION = 'openfit-movement-v1'
export const MOVEMENT_TARGETS = { steps: 8000, distanceKm: 6, activeCalories: 500, intensityMinutes: 30, lightMinutes: 120, movingHours: 8, stepsPerMovingHour: 250 } as const
const measured = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const fraction = (value: number | null | undefined, target: number) => measured(value) ? Math.min(1, value / target) : null
const goal = (value: number | null | undefined, fallback: number) => measured(value) && value > 0 ? value : fallback

type Input = Pick<DashboardData, 'activity' | 'profile' | 'selectedDate' | 'generatedAt'>
export function calculateMovementScore(data: Input) {
  const a = data.activity, t = MOVEMENT_TARGETS
  const volume = [fraction(a.steps, goal(a.stepsGoal, t.steps)), fraction(a.distanceKm, goal(a.distanceGoalKm, t.distanceKm)), fraction(a.activeCalories, t.activeCalories)].filter((n): n is number => n !== null)
  const equivalent = measured(a.moderateActiveMinutes) && measured(a.vigorousActiveMinutes) ? a.moderateActiveMinutes + 2 * a.vigorousActiveMinutes : null
  const intensity = equivalent ?? (measured(a.zoneMinutes) ? a.zoneMinutes : null)
  const snapshot = Date.parse(data.generatedAt)
  const hours = movementHours(a.stepsIntraday.filter(point => {
    try { return zonedInstant(`${data.selectedDate}T${point.time.length === 5 ? point.time + ':00' : point.time}`, data.profile.timezone || 'Asia/Kolkata') <= snapshot } catch { return false }
  }))
  const observed = hours.filter(h => h.steps !== null)
  const distributed = observed.filter(h => h.steps! >= t.stepsPerMovingHour).length
  const components = [
    { key: 'volume', label: 'Volume', weight: 45, fraction: volume.length ? Math.max(...volume) : null },
    { key: 'intensity', label: 'Intensity', weight: 30, fraction: fraction(intensity, goal(a.activeMinutesGoal, t.intensityMinutes)) },
    { key: 'light', label: 'Light activity', weight: 15, fraction: fraction(a.lightActiveMinutes, t.lightMinutes) },
    { key: 'distribution', label: 'Daily spread', weight: 10, fraction: observed.length ? Math.min(1, distributed / t.movingHours) : null },
  ]
  const coverage = components.reduce((sum, c) => sum + (c.fraction === null ? 0 : c.weight), 0)
  let longestInactive: number | null = null
  try {
    const intervals = movementWindow(a.sedentaryIntervals ?? [], data.selectedDate, data.profile.timezone || 'Asia/Kolkata', { start: 0, end: 24, threshold: 60 }, Date.parse(data.generatedAt))
    longestInactive = intervals.longest
  } catch { /* Invalid timing never creates inactivity credit or deductions. */ }
  const inactivityPenalty = longestInactive === null ? 0 : Math.min(10, Math.max(0, (longestInactive - 60) / 12))
  const earned = components.reduce((sum, c) => sum + (c.fraction ?? 0) * c.weight, 0)
  return {
    version: MOVEMENT_SCORE_VERSION,
    value: coverage < 60 ? null : Math.round(Math.max(0, Math.min(100, earned / coverage * 100 - inactivityPenalty))),
    coverage, components, inactivityPenalty, longestInactive,
    reason: coverage < 60 ? 'More movement data needed' : coverage < 100 ? 'Partial data' : null,
    intensitySource: equivalent === null ? 'Zone minutes' : 'Moderate + 2× vigorous',
    movingHours: distributed,
  }
}

export function movementScoreForTrend(point: TrendPoint, data: DashboardData) {
  return calculateMovementScore({ ...data, selectedDate: point.date, activity: {
    ...data.activity, steps: point.steps, distanceKm: point.distanceKm, activeCalories: point.activeCalories ?? null,
    activeMinutes: point.activeMinutes, moderateActiveMinutes: point.moderateActiveMinutes ?? null,
    vigorousActiveMinutes: point.vigorousActiveMinutes ?? null, lightActiveMinutes: point.lightActiveMinutes ?? null,
    zoneMinutes: point.zoneMinutes, stepsIntraday: [], sedentaryIntervals: data.activity.sedentaryIntervals,
  } })
}
