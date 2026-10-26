import type { DashboardData, SleepDetails } from '@/types'
import { indiaInstant } from '@/lib/timezone'
import { formatDecimal, formatTime } from '@/lib/format'
import { LineChart } from './Charts'
import { Panel } from './Shared'

export function sleepWindowSamples(points: Array<{ timestamp: string; value: number }>, start: string | null, end: string | null) {
  if (!start || !end) return []
  const from = indiaInstant(start).getTime(), to = indiaInstant(end).getTime()
  return points.filter(p => Date.parse(p.timestamp) >= from && Date.parse(p.timestamp) <= to && Number.isFinite(p.value)).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function SleepDetailedSignals({ sleep, details }: { sleep: DashboardData['sleep']; details?: SleepDetails }) {
  if (!details) return null
  const series = [
    { name: 'Overnight HRV', unit: 'ms', points: sleepWindowSamples(details.hrv, sleep.startTime, sleep.endTime) },
    { name: 'Overnight oxygen saturation', unit: '%', points: sleepWindowSamples(details.spo2, sleep.startTime, sleep.endTime) },
  ].filter(s => s.points.length > 0)
  const breathing = details.breathing.filter(p => sleepWindowSamples([{ timestamp: p.timestamp, value: 1 }], sleep.startTime, sleep.endTime).length)
  if (!series.length && !breathing.length) return null
  return <details className="sleep-detail-disclosure"><summary>Detailed measurements for this session<small>{formatTime(sleep.startTime)}–{formatTime(sleep.endTime)}</small></summary><Panel className="sleep-detailed-signals" category="sleep">
    {series.map(s => {
      // Break at missing sampling intervals. Never draw a continuous curve across a long sensor gap.
      const deltas = s.points.slice(1).map((p, i) => Date.parse(p.timestamp) - Date.parse(s.points[i].timestamp)).filter(d => d > 0).sort((a, b) => a - b)
      const cadence = deltas.length ? deltas[Math.floor((deltas.length - 1) / 2)] : 60000
      const maxGap = Math.min(10 * 60000, Math.max(90000, cadence * 2))
      const plot: Array<{ timestamp: string; value: number | null }> = []
      const from = indiaInstant(sleep.startTime!).getTime(), to = indiaInstant(sleep.endTime!).getTime()
      if (Date.parse(s.points[0].timestamp) > from) plot.push({ timestamp: new Date(from).toISOString(), value: null })
      s.points.forEach((p, i) => {
        if (i && Date.parse(p.timestamp) - Date.parse(s.points[i - 1].timestamp) > maxGap) plot.push({ timestamp: new Date((Date.parse(p.timestamp) + Date.parse(s.points[i - 1].timestamp)) / 2).toISOString(), value: null })
        plot.push(p)
      })
      if (Date.parse(s.points.at(-1)!.timestamp) < to) plot.push({ timestamp: new Date(to).toISOString(), value: null })
      return <section className="sleep-signal-section" key={s.name}><header><h3>{s.name} <small>({s.unit})</small></h3><span>{s.points.length} samples</span></header><LineChart values={plot.map(p => p.value)} xValues={plot.map(p => Date.parse(p.timestamp))} xDomain={[indiaInstant(sleep.startTime!).getTime(), indiaInstant(sleep.endTime!).getTime()]} labels={plot.map(p => formatTime(p.timestamp))} height={180} compact showYAxis showSamplePoints showRangeLabels rangeLabels={[formatTime(sleep.startTime), formatTime(new Date((from + to) / 2).toISOString()), formatTime(sleep.endTime)]} formatter={v => `${formatDecimal(v, 1)} ${s.unit}`} color="var(--category-sleep)" ariaLabel={`${s.name} (${s.unit}) by time during selected session`} /></section>
    })}
    {breathing.map(p => <section className="sleep-signal-section sleep-breathing-section" key={p.timestamp}>
      <header><h3>Breathing by stage</h3><span>{formatTime(p.timestamp)}</span></header>
      <dl className="sleep-breathing-stages">{([['Whole session', p.full, null], ['Deep', p.deep, 'deep'], ['Light', p.light, 'light'], ['REM', p.rem, 'rem']] as const).filter(([, value]) => value !== null).map(([label, value, stage]) => <div key={label}>
        <dt>{stage && <i style={{ background: `var(--sleep-${stage})` }} />}{label}</dt>
        <dd aria-label={`${formatDecimal(value, 1)} breaths per minute`}>{formatDecimal(value, 1)} <small>breaths/min</small></dd>
      </div>)}</dl>
    </section>)}
  </Panel></details>
}
