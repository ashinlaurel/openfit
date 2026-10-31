import { useEffect, useMemo, useState } from 'react'
import type { BodyHistory, BodyHistoryMetric, BodyHistoryResult, DashboardData } from '@/types'
import { webMode } from '@/lib/web-bridge'

export function bodyHistoryFromDashboard(data: DashboardData): BodyHistory {
  const days: BodyHistory['days'] = {}
  if (webMode && data.source === 'demo') return { version: 1, days }
  const put = (date: string | null | undefined, key: BodyHistoryMetric, value: number | null | undefined) => {
    if (!date || date > data.selectedDate || typeof value !== 'number' || !Number.isFinite(value)) return
    ;(days[date] ??= { metrics: {} }).metrics[key] = { value, updatedAt: data.generatedAt }
  }
  for (const row of data.trends) {
    put(row.date, 'weightKg', row.weight); put(row.date, 'bodyFat', row.bodyFat)
    put(row.date, 'waterMl', row.waterMl); put(row.date, 'caloriesIn', row.caloriesIn)
  }
  put(data.body.weightDate, 'weightKg', data.body.weightKg)
  put(data.body.bodyFatDate, 'bodyFat', data.body.bodyFat)
  put(data.selectedDate, 'heightCm', data.body.heightCm)
  if (!data.body.bmiCalculated) put(data.body.weightDate, 'bmi', data.body.bmi)
  return { version: 1, days }
}
export function useBodyHistory(data: DashboardData) {
  const fallback = useMemo(() => bodyHistoryFromDashboard(data), [data])
  const [result, setResult] = useState<BodyHistoryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const read = data.source === 'demo' && !webMode ? undefined : window.fitbit?.getBodyHistory
    if (!read) return
    let cancelled = false
    setLoading(true)
    void read().then(local => { if (!cancelled) setResult(local) }).catch(() => {})
    void read(true).then(remote => { if (!cancelled) setResult(remote) }).catch(error => {
      if (!cancelled) setResult(prior => ({ history: prior?.history ?? fallback, configured: prior?.configured ?? false, syncedAt: prior?.syncedAt ?? null, error: error instanceof Error ? error.message : 'History sync failed.' }))
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [data.source, data.generatedAt, attempt, fallback])
  const days = { ...result?.history.days }
  for (const [date, row] of Object.entries(fallback.days)) {
    const target = days[date] = { metrics: { ...days[date]?.metrics } }
    for (const [name, measurement] of Object.entries(row.metrics)) {
      const key = name as BodyHistoryMetric
      if (!target.metrics[key] || (target.metrics[key]?.source !== 'health-connect' && measurement.updatedAt >= target.metrics[key]!.updatedAt)) target.metrics[key] = measurement
    }
  }
  return { history: { version: 1, days } as BodyHistory, loading, result, retry: () => setAttempt(value => value + 1) }
}

export type BodyChartMetric = BodyHistoryMetric | 'fatMassKg' | 'fatFreeMassKg'
export function bodyHistoryRows(history: BodyHistory, end: string) {
  return Object.entries(history.days).filter(([date]) => date <= end).sort(([a], [b]) => a.localeCompare(b)).map(([date, row]) => {
    const get = (name: BodyHistoryMetric) => row.metrics[name]?.value ?? null
    const weight = get('weightKg'), fat = get('bodyFat'), height = get('heightCm')
    const fatMassKg = weight !== null && weight > 0 && fat !== null && fat > 0 && fat < 100 ? weight * fat / 100 : null
    const values: Record<BodyChartMetric, number | null> = {
      weightKg: weight, bodyFat: fat, heightCm: height,
      bmi: get('bmi') ?? (weight !== null && weight > 0 && height !== null && height > 0 ? weight / (height / 100) ** 2 : null),
      fatMassKg, fatFreeMassKg: fatMassKg !== null ? weight! - fatMassKg : null,
      waterMl: get('waterMl'), caloriesIn: get('caloriesIn'),
      bodyWaterMassKg: get('bodyWaterMassKg'), boneMassKg: get('boneMassKg'),
      leanBodyMassKg: get('leanBodyMassKg'), basalMetabolicRate: get('basalMetabolicRate'),
    }
    return { date, values }
  })
}
