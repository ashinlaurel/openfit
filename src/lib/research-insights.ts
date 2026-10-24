import { indiaInstant } from './timezone'
import type { DashboardData } from '@/types'

export function offsetDate(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

const valid = (v: number | null): v is number => v !== null && Number.isFinite(v) && v >= 0
export function weeklyActivity(days: DashboardData[], date: string) {
  const records = new Map(days.map(day => [day.selectedDate, day]))
  let moderate = 0, vigorous = 0, count = 0
  for (let i = 0; i < 7; i++) {
    const a = records.get(offsetDate(date, -i))?.activity
    if (!a || !valid(a.moderateActiveMinutes) || !valid(a.vigorousActiveMinutes)) continue
    moderate += a.moderateActiveMinutes
    vigorous += a.vigorousActiveMinutes
    count++
  }
  return { moderate, vigorous, count, equivalent: count ? moderate + 2 * vigorous : null }
}

export function personalBaseline(data: DashboardData, field: 'hrvMs' | 'restingHeartRate', current: number | null) {
  const points = new Map(data.trends.map(p => [p.date, p]))
  const values = [...points.values()].filter(p => p.date >= offsetDate(data.selectedDate, -28) && p.date < data.selectedDate)
    .map(p => p[field]).filter((v): v is number => valid(v) && (field !== 'hrvMs' || v > 0))
  const mean = values.length >= 7 ? values.reduce((a, b) => a + b, 0) / values.length : null
  return { count: values.length, mean, delta: mean !== null && current !== null && Number.isFinite(current) ? current - mean : null }
}

function circularMean(values: number[]) {
  const x = values.reduce((sum, v) => sum + Math.cos(v * Math.PI / 720), 0)
  const y = values.reduce((sum, v) => sum + Math.sin(v * Math.PI / 720), 0)
  if (Math.hypot(x, y) / values.length < 0.1) return null
  return (Math.atan2(y, x) * 720 / Math.PI + 1440) % 1440
}

export function socialJetlag(days: DashboardData[], date: string, workdays: number[], timezone: string) {
  const work: number[] = [], free: number[] = []
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const records = new Map(days.map(day => [day.selectedDate, day]))
  for (const day of records.values()) {
    if (day.selectedDate < offsetDate(date, -27) || day.selectedDate > date) continue
    const start = indiaInstant(day.sleep.startTime ?? '').getTime(), end = indiaInstant(day.sleep.endTime ?? '').getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 3600000) continue
    const parts = formatter.formatToParts(new Date((start + end) / 2))
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
    const minutes = Number(part('hour')) * 60 + Number(part('minute'))
    const wakeWeekday = formatter.formatToParts(new Date(end)).find(p => p.type === 'weekday')?.value ?? ''
    ;(workdays.includes(weekdays.indexOf(wakeWeekday)) ? work : free).push(minutes)
  }
  const w = work.length >= 3 ? circularMean(work) : null
  const f = free.length >= 2 ? circularMean(free) : null
  const raw = w !== null && f !== null ? Math.abs(w - f) : null
  return { workCount: work.length, freeCount: free.length, minutes: raw === null ? null : Math.min(raw, 1440 - raw) }
}
