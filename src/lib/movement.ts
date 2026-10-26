import type { TimePoint } from '../types'

export type MovementInterval = { startTime: string; endTime: string }
export type WorkdaySettings = { start: number; end: number; threshold: number }
export const defaultWorkday: WorkdaySettings = { start: 9, end: 24, threshold: 60 }
export function workdaySettings(value: unknown): WorkdaySettings {
  const input = value as Partial<WorkdaySettings> | null
  return input && Number.isInteger(input.start) && Number.isInteger(input.end) && input.start! >= 0 && input.end! <= 24 && input.start! < input.end! && [30, 45, 60].includes(input.threshold!)
    ? { start: input.start!, end: input.end!, threshold: input.threshold! } : defaultWorkday
}

// Interpret offset-free provider timestamps in the profile timezone, never the computer timezone.
export function zonedInstant(value: string, timezone: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) return Date.parse(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) return NaN
  const wall = Date.parse(`${value}Z`)
  if (!Number.isFinite(wall)) return NaN
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  let instant = wall
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(instant)
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
    const represented = Date.parse(`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}Z`)
    instant += wall - represented
  }
  return instant
}
export function movementWindow(intervals: MovementInterval[], date: string, timezone: string, settings: WorkdaySettings, observedUntil = Infinity) {
  const start = zonedInstant(`${date}T${String(settings.start).padStart(2, '0')}:00:00`, timezone)
  const midnight = zonedInstant(`${date}T00:00:00`, timezone)
  const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const end = zonedInstant(settings.end === 24 ? `${nextDate}T00:00:00` : `${date}T${String(settings.end).padStart(2, '0')}:00:00`, timezone)
  const observedEnd = Math.max(start, Math.min(end, observedUntil))
  const clipped = intervals.map(item => ({ start: zonedInstant(item.startTime, timezone), end: zonedInstant(item.endTime, timezone) }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start && item.end > start && item.start < observedEnd)
    .map(item => ({ start: Math.max(start, item.start), end: Math.min(observedEnd, item.end) })).filter(item => item.end > item.start).sort((a, b) => a.start - b.start)
  const merged: typeof clipped = []
  for (const interval of clipped) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
    else merged.push({ ...interval })
  }
  const segments = merged.map(item => ({ ...item, minutes: (item.end - item.start) / 60000, left: (item.start - start) / (end - start) * 100, width: (item.end - item.start) / (end - start) * 100 }))
  return { start, end, observedEnd, midnight, segments, minutes: segments.reduce((sum, item) => sum + item.minutes, 0), longest: segments.length ? Math.max(...segments.map(item => item.minutes)) : null, longCount: segments.filter(item => item.minutes >= settings.threshold).length }
}
export function movementHours(points: TimePoint[]) {
  return Array.from({ length: 24 }, (_, hour) => {
    const observed = points.filter(point => /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(point.time) && Number(point.time.slice(0, 2)) === hour && Number.isFinite(point.value) && point.value >= 0)
    return { hour, steps: observed.length ? observed.reduce((sum, point) => sum + point.value, 0) : null }
  })
}

// Prior recorded days only: absent intervals cannot establish zero inactivity.
export function workdayAverages(intervals: MovementInterval[], date: string, timezone: string, settings: WorkdaySettings) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const prior = new Date(Date.parse(`${date}T12:00:00Z`) - (i + 1) * 86400000).toISOString().slice(0,10)
    return movementWindow(intervals, prior, timezone, settings)
  }).filter(day => day.segments.length > 0)
  const mean = (key: 'minutes' | 'longest' | 'longCount') => days.length ? days.reduce((sum, day) => sum + (day[key] ?? 0), 0) / days.length : null
  return { count: days.length, minutes: mean('minutes'), longest: mean('longest'), longCount: mean('longCount') }
}
