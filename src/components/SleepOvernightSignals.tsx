import type { DashboardData, DataSource, TrendPoint } from '@/types'
import { formatDecimal } from '@/lib/format'
import { sleepBaseline } from '@/lib/sleep-page'
import { Panel, PanelHeader } from './Shared'
import { HeartIcon } from './icons'

export function SleepOvernightSignals({ health, trends = [], selectedDate, source }: {
  health: DashboardData['health']; trends?: TrendPoint[]; selectedDate?: string; source?: DataSource
}) {
  const comparison = (key: 'hrvMs' | 'spo2' | 'breathingRate', value: number | null, unit: string, digits: number) => {
    if (!selectedDate || value === null) return null
    const baseline = sleepBaseline(trends, selectedDate, key)
    if (baseline.average === null) return `${baseline.count}/7 prior nights needed for comparison`
    const delta = value - baseline.average
    return `${delta >= 0 ? '+' : '−'}${formatDecimal(Math.abs(delta), digits)} ${unit} vs ${baseline.count}-night average (prior 30 days)`
  }
  const readings = [
    { label: 'Sleeping heart rate', note: 'Non-REM average', value: health.nonRemHeartRate, unit: 'bpm', digits: 0, comparison: null },
    { label: 'Nightly HRV', note: 'Overnight RMSSD average', value: health.hrvMs, unit: 'ms', digits: 1, comparison: comparison('hrvMs', health.hrvMs, 'ms', 1) },
    { label: 'Oxygen saturation', note: 'Overnight average', value: health.spo2, unit: '%', digits: 1, comparison: comparison('spo2', health.spo2, 'percentage points', 1) },
    { label: 'Breathing rate', note: 'Main-sleep daily average', value: health.breathingRate, unit: '/ min', digits: 1, comparison: comparison('breathingRate', health.breathingRate, 'breaths/min', 1) },
    { label: 'Skin temperature deviation', note: 'Compared with your provider baseline', value: health.skinTemperature, unit: '°C', digits: 2, comparison: null },
  ]
  const advanced = [
    { label: 'Deep-sleep HRV', note: 'RMSSD during deep sleep', value: health.hrvDeepSleepRmssdMs, unit: 'ms', digits: 1, comparison: null },
    { label: 'HRV entropy', note: 'Reported variability measure', value: health.hrvEntropy, unit: '', digits: 2, comparison: null },
  ]
  if (![...readings, ...advanced].some(r => r.value !== null && Number.isFinite(r.value))) return null
  const renderReading = (reading: typeof readings[number]) => {
    const available = reading.value !== null && Number.isFinite(reading.value)
    return <div className="sleep-signal" key={reading.label}>
      <dt>{reading.label}</dt>
      <dd>{available ? <>{reading.label === 'Skin temperature deviation' && reading.value! > 0 ? '+' : ''}{formatDecimal(reading.value, reading.digits)}{reading.unit && <small>{reading.unit}</small>}</> : <span className="sleep-signal-missing">Not recorded</span>}</dd>
      <p>{reading.note}</p>{available && reading.comparison && <p className="sleep-baseline-comparison">{reading.comparison}</p>}
      {reading.label === 'Oxygen saturation' && health.spo2Min !== null && health.spo2Max !== null && <p>{source === 'google-health' ? 'Confidence bounds' : source === 'fitbit' ? 'Reported minimum–maximum' : 'Reported bounds'}: {formatDecimal(health.spo2Min, 1)}–{formatDecimal(health.spo2Max, 1)}%</p>}
    </div>
  }
  return <Panel className="sleep-night-signals" category="sleep">
    <PanelHeader eyebrow="Main sleep · daily summaries" title="Overnight signals" icon={HeartIcon} />
    <dl className="sleep-signal-grid">{readings.map(renderReading)}</dl>
    <details className="sleep-advanced-signals"><summary>More overnight measurements</summary><dl className="sleep-signal-grid">{advanced.map(renderReading)}</dl></details>
    <p className="sleep-signal-note">Daily summaries describe the main sleep and stay the same when you select a nap. These readings do not adjust the OpenFit estimate.</p>
  </Panel>
}
