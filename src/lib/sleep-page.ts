import type { SleepSession, TrendPoint } from '@/types'

export function sleepProcessingNote(session?: SleepSession) {
  if (!session) return null
  if (session.processed === false) return 'Sleep detected. Google is still processing the stages; sync again after processing finishes.'
  if (session.stageTimeline.length) return null
  const status = session.stagesStatus
  if (session.isNap || status === 'REJECTED_NAP') return 'Sleep stages are not available for this nap. Duration and timing are still recorded.'
  if (status?.includes('GAP') || status === 'REJECTED_COVERAGE') return 'Sleep stages are unavailable because the sensor recording has gaps or insufficient coverage.'
  if (status === 'REJECTED_SERVER') return 'Google could not compute stages from the available sensor data.'
  if (status === 'TIMEOUT' || status === 'PROCESSING_INTERNAL_ERROR') return 'Google could not finish processing sleep stages. Try syncing again later.'
  return 'A detailed stage recording is not available for this session.'
}

export function sleepBaseline(trends: TrendPoint[], date: string, key: 'sleepMinutes' | 'hrvMs' | 'breathingRate' | 'spo2', days = 30) {
  const start = new Date(Date.parse(`${date}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
  const unique = new Map(trends.filter(p => p.date >= start && p.date < date).map(p => [p.date, p[key]]))
  const values = [...unique.values()].filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
  return { count: values.length, average: values.length >= 7 ? values.reduce((a, b) => a + b, 0) / values.length : null }
}
