import type { DashboardData } from '../types'
import { offsetDate } from './research-insights'

export interface SleepWeekNight {
  date: string
  start: number | null
  end: number | null
  asleep: number | null
  elapsed: number | null
}

export function sleepWeek(days: DashboardData[], endDate: string, timezone: string) {
  const records = new Map(days.map(day => [day.selectedDate, day]))
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const wallFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const isWallTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
  const position = (value: number, date: string, wallTime: boolean) => {
    const parts = (wallTime ? wallFormatter : formatter).formatToParts(new Date(value))
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
    const stamp = `${part('year')}-${part('month')}-${part('day')}`
    const dayOffset = (Date.parse(`${stamp}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000
    return dayOffset * 1440 + Number(part('hour')) * 60 + Number(part('minute'))
  }
  const nights: SleepWeekNight[] = Array.from({ length: 7 }, (_, index) => {
    const date = offsetDate(endDate, index - 6)
    const day = records.get(date)
    const fallback = days.flatMap(d => d.trends).find(p => p.date === date)?.sleepMinutes
    const duration = day?.sleep.totalMinutes ?? fallback ?? null
    const asleep = duration !== null && Number.isFinite(duration) && duration >= 0 && duration <= 1440 ? duration : null
    const rawStart = day?.sleep.startTime ?? '', rawEnd = day?.sleep.endTime ?? ''
    const wallStart = isWallTime(rawStart), wallEnd = isWallTime(rawEnd)
    // Offset-free provider timestamps already represent local wall time. Do not shift them through the device timezone.
    const startTime = Date.parse(rawStart + (wallStart ? 'Z' : '')), endTime = Date.parse(rawEnd + (wallEnd ? 'Z' : ''))
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime || endTime - startTime > 86400000) return { date, start: null, end: null, asleep, elapsed: null }
    const start = position(startTime, date, wallStart), end = position(endTime, date, wallEnd)
    // Fall-back clock changes can make a short interval appear reversed in wall time.
    if (end <= start || start < -2880 || end > 2880) return { date, start: null, end: null, asleep, elapsed: null }
    return { date, start, end, asleep, elapsed: (endTime - startTime) / 60000 }
  })
  const timed = nights.filter(n => n.start !== null && n.end !== null)
  const min = Math.floor(Math.min(-360, ...timed.map(n => n.start!)) / 180) * 180
  const max = Math.ceil(Math.max(720, ...timed.map(n => n.end!)) / 180) * 180
  const ticks = Array.from({ length: (max - min) / 180 + 1 }, (_, i) => min + i * 180)
  const durations = nights.map(n => n.asleep).filter((n): n is number => n !== null)
  return { nights, timedCount: timed.length, durationCount: durations.length, averageAsleep: durations.length ? durations.reduce((a,b) => a+b,0) / durations.length : null, min, max, ticks }
}

export function sleepClock(minutes: number) {
  const clock = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hour = Math.floor(clock / 60), minute = clock % 60
  return `${hour % 12 || 12}:${String(minute).padStart(2,'0')} ${hour < 12 ? 'AM' : 'PM'}`
}
