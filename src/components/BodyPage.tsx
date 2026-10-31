import { useState } from 'react'
import type { DashboardData } from '@/types'
import { bodyHistoryRows, useBodyHistory, type BodyChartMetric } from '@/lib/use-body-history'
import { formatDate, formatDecimal, formatNumber } from '@/lib/format'
import { offsetDate } from '@/lib/research-insights'
import { Panel, PanelHeader, EmptyValue } from './Shared'
import { LineChart } from './Charts'
import { BodyIcon, GaugeIcon } from './icons'
import { webMode } from '@/lib/web-bridge'

const metrics: Array<{ key: BodyChartMetric; label: string; unit: string; calculated?: boolean }> = [
  { key: 'weightKg', label: 'Weight', unit: 'kg' },
  { key: 'bodyFat', label: 'Body fat', unit: '%' },
  { key: 'fatMassKg', label: 'Fat mass', unit: 'kg', calculated: true },
  { key: 'fatFreeMassKg', label: 'Fat-free mass', unit: 'kg', calculated: true },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'heightCm', label: 'Height', unit: 'cm' },
  { key: 'bodyWaterMassKg', label: 'Body water mass', unit: 'kg' },
  { key: 'boneMassKg', label: 'Bone mass', unit: 'kg' },
  { key: 'leanBodyMassKg', label: 'Lean body mass', unit: 'kg' },
  { key: 'basalMetabolicRate', label: 'Basal metabolic rate', unit: 'kcal/day' },
  { key: 'waterMl', label: 'Water logged', unit: 'ml' },
  { key: 'caloriesIn', label: 'Calories consumed', unit: 'kcal' },
]
const show = (value: number, unit: string) => unit === 'ml' || unit === 'kcal' ? formatNumber(value) : formatDecimal(value)
export function BodyView({ data }: { data: DashboardData }) {
  const { history, loading, result, retry } = useBodyHistory(data)
  const rows = bodyHistoryRows(history, data.selectedDate)
  const [selected, setSelected] = useState<BodyChartMetric>('weightKg')
  const [range, setRange] = useState(30)
  const available = metrics.flatMap(metric => {
    const records = rows.filter(row => row.values[metric.key] !== null)
    const latest = records.at(-1)
    return latest ? [{ ...metric, latest, records }] : []
  })
  const active = available.find(metric => metric.key === selected) ?? available[0]
  const start = range ? offsetDate(data.selectedDate, 1 - range) : rows[0]?.date
  const visible = rows.filter(row => row.date >= start)
  const plotted: Array<{ date: string; value: number | null }> = []
  for (const row of visible) {
    const previous = plotted.at(-1)
    if (previous && offsetDate(previous.date, 1) < row.date) plotted.push({ date: offsetDate(previous.date, 1), value: null })
    plotted.push({ date: row.date, value: active ? row.values[active.key] : null })
  }
  const recorded = plotted.filter((row): row is { date: string; value: number } => row.value !== null)
  const average = recorded.length ? recorded.reduce((sum, row) => sum + row.value, 0) / recorded.length : null
  const first = recorded[0], last = recorded.at(-1)
  const change = recorded.length > 1 && first && last ? last.value - first.value : null
  const historyStatus = loading ? 'Syncing history…'
    : data.source === 'demo' && !webMode ? 'Demo history'
    : result?.error ? webMode ? 'VM sync unavailable' : 'Saved on this Mac · VM sync pending'
    : result?.syncedAt ? webMode ? 'Saved on VM' : 'Saved on VM and this Mac'
    : result?.configured ? 'Local history' : 'Connect your VM to back up'
  return <div className="page-stack body-page">
    <div className="body-history-status"><span>{historyStatus}{result?.error && <small title={result.error}> · {result.error}</small>}</span><button onClick={retry} disabled={loading}>Sync history</button></div>
    {active ? <div className="body-history-layout">
      <Panel className="body-history-chart" category="body">
        <PanelHeader eyebrow={formatDate(active.latest.date, { month: 'short', day: 'numeric', year: 'numeric' })} title={active.label} icon={BodyIcon} />
        <div className="body-weight-value"><strong>{show(active.latest.values[active.key]!, active.unit)}</strong><span>{active.unit}</span></div>
        <div className="body-chart-toolbar"><div className="body-chart-ranges" aria-label="Body history range">{[30, 90, 0].map(days => <button key={days} aria-pressed={range === days} onClick={() => setRange(days)}>{days ? `${days} days` : 'All time'}</button>)}</div><span>{recorded.length} recorded {recorded.length === 1 ? 'day' : 'days'}</span></div>
        {recorded.length ? <LineChart key={active.key} values={plotted.map(row => row.value)} labels={plotted.map(row => formatDate(row.date, { month: 'short', day: 'numeric' }))} xValues={plotted.map(row => Date.parse(`${row.date}T12:00:00Z`))} color="var(--category-body)" height={290} showSamplePoints formatter={value => `${show(value, active.unit)}${active.unit ? ` ${active.unit}` : ''}`} ariaLabel={`${active.label} history`} /> : <EmptyValue>No readings in this period.</EmptyValue>}
        <div className="body-history-chart-stats">{average !== null && <div><span>Period average</span><strong>{show(average, active.unit)} {active.unit}</strong></div>}{change !== null && <div><span>Period change</span><strong>{change > 0 ? '+' : ''}{show(change, active.unit)} {active.unit}</strong></div>}</div>
        {(active.calculated || active.key === 'bmi') && <p className="body-history-note">{active.key === 'fatFreeMassKg' ? 'Calculated from same-day weight and body fat; includes muscle, bone and water.' : active.calculated ? 'Calculated from same-day weight and body fat.' : 'Calculated from weight and height when no BMI is reported.'}</p>}
      </Panel>
      <Panel className="body-metrics-panel" category="body"><PanelHeader eyebrow="Select a metric" title="Measurements" icon={GaugeIcon} /><div className="body-composition-grid">{available.map(metric => <button key={metric.key} type="button" aria-pressed={active.key === metric.key} onClick={() => setSelected(metric.key)}><span>{metric.label}</span><strong>{show(metric.latest.values[metric.key]!, metric.unit)}<small>{metric.unit}</small></strong><p>{metric.calculated ? 'Calculated · ' : ''}{formatDate(metric.latest.date, { month: 'short', day: 'numeric' })}</p></button>)}</div></Panel>
    </div> : <EmptyValue>{loading ? 'Loading measurement history…' : 'No body measurements available yet.'}</EmptyValue>}
  </div>
}
