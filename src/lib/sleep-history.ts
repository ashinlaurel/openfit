import type { DashboardData, SleepSession, TrendPoint } from '../types'

// A later sync includes revised sessions for earlier wake days. Resolve whole
// responses in timestamp order so old daily snapshots cannot hide those updates.
export function sleepHistory(days: DashboardData[]) {
  const history = new Map<string, { point: TrendPoint; sessions: SleepSession[] }>()
  for (const day of [...days].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))) {
    const trends = day.sleep.historyTrends ?? day.trends
    for (const point of trends) {
      history.set(point.date, { point, sessions: day.sleep.historySessions?.filter(s => s.date === point.date) ?? [] })
    }
    const point = trends.find(p => p.date === day.selectedDate) ?? { date: day.selectedDate } as TrendPoint
    history.set(day.selectedDate, {
      point: { ...point, sleepMinutes: day.sleep.totalMinutes, sleepStartTime: day.sleep.startTime, sleepEndTime: day.sleep.endTime, sleepEfficiency: day.sleep.efficiency, sleepScore: day.sleep.score, sleepTimeInBed: day.sleep.timeInBed, sleepStageTimeline: day.sleep.stageTimeline },
      sessions: day.sleep.sessions ?? [],
    })
  }
  return history
}
