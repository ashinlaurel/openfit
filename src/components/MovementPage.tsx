import { useEffect, useMemo, useState } from 'react'
import type { DashboardData, RawFitbitPayload, TrendPoint } from '@/types'
import { normalizeFitbitData } from '@/data/normalize'
import { createDemoData, localIso } from '@/data/demo'
import { offsetDate } from '@/lib/research-insights'
import { calculateMovementScore, movementScoreForTrend } from '@/lib/movement-score'
import { formatDate, formatDecimal, formatMinutes, formatNumber, formatTime } from '@/lib/format'
import { Panel, PanelHeader } from './Shared'
import { LineChart } from './Charts'
import { ActivityIcon, TrendIcon } from './icons'
import { WorkdayMovement, MovementWeek, useWorkdaySettings } from './WorkdayMovement'
import { MovementDayChart } from './MovementDayChart'

const measured = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
export function MovementView({ data }: { data: DashboardData }) {
  const { settings, update } = useWorkdaySettings()
  const score = calculateMovementScore(data)
  const [range, setRange] = useState({ date: data.selectedDate, end: data.selectedDate, count: 7 })
  const end = range.date === data.selectedDate ? range.end : data.selectedDate, count = range.count, first = offsetDate(end, 1-count)
  const changeRange = (until: string, n = count) => { if (until && until <= localIso()) setRange({ date: data.selectedDate, end: until, count: n }) }
  const [archive, setArchive] = useState<{ key: string; days: RawFitbitPayload[]; error: boolean } | null>(null)
  const key = `${data.source}:${data.selectedDate}:${data.generatedAt}`
  useEffect(() => {
    let canceled = false
    if (data.source === 'demo' || !window.fitbit) setArchive({ key, days: [], error: false })
    else void window.fitbit.getCachedArchive().then(raw => { if (!canceled) setArchive({ key, days: Object.values(raw.days), error: false }) }).catch(() => { if (!canceled) setArchive({ key, days: [], error: true }) })
    return () => { canceled = true }
  }, [key, data.source])
  const ready = archive?.key === key
  const days = useMemo(() => {
    const records = new Map<string, DashboardData>()
    if (data.source === 'demo') for (let i = 0; i < count; i++) { const date = offsetDate(end, -i); records.set(date, createDemoData(date)) }
    else if (ready) for (const raw of archive.days) if ((raw.date >= first && raw.date <= end) || (raw.date >= offsetDate(data.selectedDate, -7) && raw.date <= data.selectedDate)) records.set(raw.date, normalizeFitbitData(raw))
    records.set(data.selectedDate, data)
    return [...records.values()].sort((a,b) => a.generatedAt.localeCompare(b.generatedAt))
  }, [archive, ready, data, first, end, count])
  const trendMap = new Map<string, TrendPoint>()
  for (const day of [...days.filter(d => d !== data), data]) for (const point of day.activity.historyTrends ?? day.trends) {
    const previous = trendMap.get(point.date)
    trendMap.set(point.date, { ...previous, ...Object.fromEntries(Object.entries(point).filter(([,v]) => v !== null && v !== undefined)) } as TrendPoint)
  }
  const a = data.activity
  trendMap.set(data.selectedDate, {
    date: data.selectedDate, label: formatDate(data.selectedDate, {weekday:'short'}),
    steps: a.steps, calories: a.calories, distanceKm: a.distanceKm, floors: a.floors,
    activeMinutes: a.activeMinutes, lightActiveMinutes: a.lightActiveMinutes, moderateActiveMinutes: a.moderateActiveMinutes, vigorousActiveMinutes: a.vigorousActiveMinutes,
    activeCalories: a.activeCalories, zoneMinutes: a.zoneMinutes, sedentaryMinutes: a.sedentaryMinutes,
    restingHeartRate: data.health.restingHeartRate, hrvMs: data.health.hrvMs, breathingRate: data.health.breathingRate,
    spo2: data.health.spo2, skinTemperature: data.health.skinTemperature, coreTemperature: data.health.coreTemperature, cardioScore: data.health.cardioScore,
    sleepMinutes: data.sleep.totalMinutes, sleepScore: data.sleep.score, sleepEfficiency: data.sleep.efficiency,
    weight: data.body.weightKg, bodyFat: data.body.bodyFat, waterMl: data.body.waterMl, caloriesIn: data.body.caloriesIn,
  })
  const trends = [...trendMap.values()].sort((a,b) => a.date.localeCompare(b.date))
  const intervals = [...new Map(days.flatMap(d => d.activity.sedentaryIntervals ?? []).map(i => [`${i.startTime}:${i.endTime}`, i])).values()]
  const historyData = { ...data, trends, activity: { ...data.activity, sedentaryIntervals: intervals } }
  const dates = Array.from({ length: count }, (_, i) => offsetDate(first, i))
  const points = dates.map(date => trendMap.get(date))
  const snapshots = new Map(days.map(day => [day.selectedDate, day]))
  const scores = points.map(point => {
    if (!point) return null
    if (point.date === data.selectedDate) return score
    const day = snapshots.get(point.date)
    return day ? calculateMovementScore({ ...day, activity: { ...day.activity, steps: point.steps ?? day.activity.steps, distanceKm: point.distanceKm ?? day.activity.distanceKm, activeCalories: point.activeCalories ?? day.activity.activeCalories, lightActiveMinutes: point.lightActiveMinutes ?? day.activity.lightActiveMinutes, moderateActiveMinutes: point.moderateActiveMinutes ?? day.activity.moderateActiveMinutes, vigorousActiveMinutes: point.vigorousActiveMinutes ?? day.activity.vigorousActiveMinutes, zoneMinutes: point.zoneMinutes ?? day.activity.zoneMinutes, sedentaryIntervals: intervals } }) : movementScoreForTrend(point, historyData)
  })
  const metrics = [
    { label: 'Steps', value: formatNumber(data.activity.steps) },
    { label: 'Active minutes', value: measured(data.activity.activeMinutes) ? formatMinutes(data.activity.activeMinutes) : '—' },
    { label: 'Distance', value: measured(data.activity.distanceKm) ? `${formatDecimal(data.activity.distanceKm,1)} km` : '—' },
    { label: 'Active energy', value: measured(data.activity.activeCalories) ? `${formatNumber(data.activity.activeCalories)} kcal` : '—' },
    { label: 'Light activity', value: measured(data.activity.lightActiveMinutes) ? formatMinutes(data.activity.lightActiveMinutes) : '—' },
    { label: 'Zone minutes', value: measured(data.activity.zoneMinutes) ? `${formatNumber(data.activity.zoneMinutes)} min` : '—' },
    { label: 'Day inactive', value: formatMinutes(data.activity.sedentaryMinutes) },
    ...(measured(data.activity.floors) ? [{ label: 'Floors', value: formatNumber(data.activity.floors) }] : []),
    { label: 'Total energy', value: measured(data.activity.calories) ? `${formatNumber(data.activity.calories)} kcal` : '—' },
  ]
  const charts = [
    { name: 'Movement estimate', values: scores.map(s => s?.value ?? null), format: (v: number) => `${Math.round(v)} / 100` },
    { name: 'Daily steps', values: points.map(p => p?.steps ?? null), format: (v: number) => `${formatNumber(v)} steps` },
    { name: 'Active minutes', values: points.map(p => p?.activeMinutes ?? null), format: formatMinutes },
    { name: 'Active energy', values: points.map(p => p?.activeCalories ?? null), format: (v: number) => `${formatNumber(v)} kcal` },
    { name: 'Distance', values: points.map(p => p?.distanceKm ?? null), format: (v: number) => `${formatDecimal(v,1)} km` },
    { name: 'Zone minutes', values: points.map(p => p?.zoneMinutes ?? null), format: (v: number) => `${formatNumber(v)} min` },
    { name: 'Day inactive', values: points.map(p => p?.sedentaryMinutes ?? null), format: formatMinutes },
    { name: 'Floors', values: points.map(p => p?.floors ?? null), format: formatNumber },
    { name: 'Total energy', values: points.map(p => p?.calories ?? null), format: (v: number) => `${formatNumber(v)} kcal` },
  ].filter(c => c.values.some(measured))
  return <div className="page-stack movement-page movement-page-v2">
    <Panel className="movement-overview" category="activity"><PanelHeader title="Daily movement" eyebrow={formatDate(data.selectedDate, { weekday:'short', month:'short', day:'numeric', year:'numeric' })} icon={ActivityIcon} action={<span className="movement-asof">{data.source === 'demo' ? 'Demo' : `As of ${formatTime(data.generatedAt)}`}</span>} />
      <div className="movement-overview-body"><div className="movement-score" title={`OpenFit estimate · ${score.coverage}% input availability`}>
        <span>OpenFit movement score</span><strong>{score.value ?? '—'}<small>/ 100</small></strong><div className="movement-score-labels"><span>Estimate</span>{data.selectedDate === localIso() && <span>In progress</span>}<span title="Availability of score components, not device wear time">{score.coverage}% inputs</span></div>
        {score.value === null && <small>{score.reason}</small>}
        {score.inactivityPenalty > 0 && <small>−{formatDecimal(score.inactivityPenalty,1)} long inactivity</small>}
      </div><dl className="movement-metric-tiles">{metrics.map(m => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd></div>)}</dl></div>
      <div className="movement-score-parts">{score.components.map(c => <span key={c.key}>{c.label}<strong>{c.fraction === null ? '—' : `${Math.round(c.fraction*100)}%`}</strong></span>)}</div>
    </Panel>
    <MovementDayChart data={data} />
    <WorkdayMovement data={data} intervals={intervals} settings={settings} update={update} />
    <section className="movement-history" aria-label="Movement history"><header className="movement-history-header"><div><h2>Movement history</h2><small>{formatDate(first,{month:'short',day:'numeric'})} – {formatDate(end,{month:'short',day:'numeric',year:'numeric'})}</small></div><div className="movement-history-controls">
      <div role="group" aria-label="Movement history range">{[7,14,30].map(n => <button type="button" key={n} aria-pressed={n===count} onClick={() => changeRange(end,n)}>{n} days</button>)}</div>
      <button aria-label="Previous movement period" onClick={() => changeRange(offsetDate(end,-count))}>←</button><input type="date" aria-label="Movement history end date" value={end} max={localIso()} onChange={e => changeRange(e.target.value)} /><button aria-label="Next movement period" disabled={end>=localIso()} onClick={() => changeRange(offsetDate(end,count)>localIso()?localIso():offsetDate(end,count))}>→</button>
    </div></header>
      {ready && archive.error && <p role="status" className="movement-asof">Archive unavailable · showing synced history</p>}
      <div className="movement-history-charts">{charts.map(chart => <Panel key={chart.name} category="activity"><PanelHeader title={chart.name} eyebrow={`${chart.values.filter(measured).length}/${count} days${chart.name === 'Movement estimate' && scores.some(s => s && s.coverage < 100) ? ' · partial inputs' : ''}`} icon={TrendIcon} /><LineChart values={chart.values} labels={dates.map(d => formatDate(d,{month:'short',day:'numeric'}))} xValues={dates.map(d=>Date.parse(`${d}T12:00:00Z`))} height={155} compact showRangeLabels color="var(--category-activity)" formatter={chart.format} ariaLabel={`${chart.name}, ${first} to ${end}${chart.name === 'Movement estimate' ? '; estimates may use partial inputs' : ''}`} /></Panel>)}</div>
      <MovementWeek data={historyData} intervals={intervals} endDate={end} count={count} settings={settings} />
    </section>
  </div>
}
