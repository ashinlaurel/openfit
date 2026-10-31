import type { DashboardData } from '@/types'

export function bodyComposition(data: DashboardData) {
  const body = data.body
  const sameDate = body.weightDate && body.weightDate === body.bodyFatDate
  const matched = body.weightDate || body.bodyFatDate
    ? sameDate ? { weight: body.weightKg, bodyFat: body.bodyFat, date: body.weightDate! } : undefined
    : [...data.trends].filter(point => point.date <= data.selectedDate && point.weight === body.weightKg && point.bodyFat === body.bodyFat).sort((a, b) => b.date.localeCompare(a.date))[0]
  const valid = matched && typeof matched.weight === 'number' && Number.isFinite(matched.weight) && matched.weight > 0
    && typeof matched.bodyFat === 'number' && Number.isFinite(matched.bodyFat) && matched.bodyFat > 0 && matched.bodyFat < 100
  const fatMassKg = valid ? matched.weight! * matched.bodyFat! / 100 : null
  return {
    fatMassKg,
    fatFreeMassKg: fatMassKg !== null ? matched!.weight! - fatMassKg : null,
    date: fatMassKg !== null ? matched!.date : null,
  }
}
