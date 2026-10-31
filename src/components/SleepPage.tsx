import { useEffect, useMemo, useState } from 'react'
import type { DashboardData } from '@/types'
import { createDemoData, localIso } from '@/data/demo'
import { normalizeFitbitData } from '@/data/normalize'
import { compactMinutes, formatDate, formatDecimal, formatMinutes, formatTime } from '@/lib/format'
import { offsetDate } from '@/lib/research-insights'
import { calculateSleepScore, sleepScoreForTrend } from '@/lib/sleep-score'
import { sleepHistory } from '@/lib/sleep-history'
import { sleepProcessingNote } from '@/lib/sleep-page'
import { Panel, PanelHeader, EmptyValue } from './Shared'
import { LineChart, SleepStageTimeline } from './Charts'
import { SleepIcon, TrendIcon, GaugeIcon } from './icons'
import { WeeklySleep } from './WeeklySleep'
import { SleepScoreDetails } from './SleepScoreDetails'
import { SleepOvernightSignals } from './SleepOvernightSignals'
import { SleepDetailedSignals } from './SleepDetailedSignals'
import { ResearchInsights } from './ResearchInsights'

const available = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="tiny-stat"><span>{label}</span><strong>{value}</strong></div>
}

export function SleepView({ data }: { data: DashboardData }) {
  const [selection, setSelection] = useState<{ date: string; id: string } | null>(null)
  const sessions = [...(data.sleep.sessions ?? [])].sort((a, b) => Number(b.isMainSleep) - Number(a.isMainSleep) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  const session = sessions.find(s => selection?.date === data.selectedDate && s.id === selection.id)
    ?? sessions.find(s => s.id === data.sleep.mainSessionId) ?? sessions.find(s => s.isMainSleep) ?? sessions[0]
  const sleep = session ? { ...data.sleep, ...session, stageTimeline: session.processed === false ? [] : session.stageTimeline } : data.sleep
  const score = calculateSleepScore(sleep)
  const hasSleep = available(sleep.totalMinutes) || !!sleep.startTime
  const processing = sleepProcessingNote(session)
  const allDurations = sessions.map(s => s.totalMinutes).filter(available)
  const allTotal = allDurations.reduce((a, b) => a + b, 0)
  const [range, setRange] = useState({ date: data.selectedDate, end: data.selectedDate, count: 7 })
  const end = range.date === data.selectedDate ? range.end : data.selectedDate
  const count = range.count
  const changeRange = (nextEnd: string, nextCount = count) => {
    if (nextEnd && nextEnd <= localIso()) setRange({ date: data.selectedDate, end: nextEnd, count: nextCount })
  }
  const [archive, setArchive] = useState<{ key: string; days: DashboardData[]; error: boolean } | null>(null)
  const archiveKey = `${data.source}:${data.selectedDate}:${data.generatedAt}`
  useEffect(() => {
    let canceled = false
    if (data.source === 'demo') setArchive({ key: archiveKey, days: [], error: false })
    else if (window.fitbit) void window.fitbit.getCachedArchive().then(raw => {
      if (!canceled) setArchive({ key: archiveKey, days: Object.values(raw.days).map(normalizeFitbitData), error: false })
    }).catch(() => { if (!canceled) setArchive({ key: archiveKey, days: [], error: true }) })
    else setArchive({ key: archiveKey, days: [], error: false })
    return () => { canceled = true }
  }, [archiveKey, data.source])
  const ready = archive?.key === archiveKey
  const days = useMemo(() => {
    const records = new Map((ready ? archive.days : []).map(day => [day.selectedDate, day]))
    if (data.source === 'demo') for (let i = 0; i < count; i++) {
      const date = offsetDate(end, -i); records.set(date, createDemoData(date))
    }
    records.set(data.selectedDate, data)
    return [...records.values()]
  }, [archive, ready, data, end, count])
  const trends = useMemo(() => {
    return [...sleepHistory(days).values()].map(record => record.point).sort((a, b) => a.date.localeCompare(b.date))
  }, [days, data])
  const historyData = { ...data, trends }
  const first = offsetDate(end, 1 - count)
  const points = Array.from({ length: count }, (_, i) => trends.find(p => p.date === offsetDate(first, i)))
  const labels = points.map((_, i) => formatDate(offsetDate(first, i), { month: 'short', day: 'numeric' }))
  const dateLabel = formatDate(data.selectedDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const charts = [
    { title: 'Time asleep', values: points.map(p => p?.sleepMinutes ?? null), format: compactMinutes, target: data.sleep.goalMinutes },
    { title: 'Efficiency', values: points.map(p => p?.sleepEfficiency ?? null), format: (v: number) => `${formatDecimal(v, 0)}%`, target: null },
  ]
  return <div className="page-stack sleep-page">
    {hasSleep ? <Panel className="sleep-main-card sleep-key-metrics" category="sleep">
      <PanelHeader eyebrow={dateLabel} title="Your sleep" icon={SleepIcon} action={<span className="sleep-source-label">{data.source === 'demo' ? 'Demo data' : data.source === 'google-health' ? 'Google Health' : data.source === 'cache' ? 'Local archive' : 'Fitbit'}</span>} />
      {sessions.length > 1 && <div className="sleep-session-controls">
        <div className="sleep-session-total">
          <span className="sleep-session-tab-heading"><span>Total sleep</span><strong>{allDurations.length ? compactMinutes(allTotal) : '—'}</strong></span>
          <span className="sleep-session-tab-time">All sessions{allDurations.length < sessions.length && ' · partial duration'}</span>
        </div>
        <div className="sleep-session-tabs" role="tablist" aria-label="Sleep session">
          {sessions.map((s, index) => <button key={s.id} id={`sleep-tab-${index}`} type="button" role="tab"
            aria-selected={session?.id === s.id} aria-controls="sleep-session-summary" tabIndex={session?.id === s.id ? 0 : -1}
            onClick={() => setSelection({ date: data.selectedDate, id: s.id })}
            onKeyDown={event => {
              const next = event.key === 'ArrowRight' ? (index + 1) % sessions.length
                : event.key === 'ArrowLeft' ? (index - 1 + sessions.length) % sessions.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? sessions.length - 1 : null
              if (next === null) return
              event.preventDefault()
              setSelection({ date: data.selectedDate, id: sessions[next].id })
              document.getElementById(`sleep-tab-${next}`)?.focus()
            }}>
            <span className="sleep-session-tab-heading"><span>{s.isMainSleep ? 'Main sleep' : `${s.isNap ? 'Nap' : 'Sleep'}${sessions.filter(item => !item.isMainSleep).length > 1 ? ` ${sessions.filter(item => !item.isMainSleep).indexOf(s) + 1}` : ''}`}</span><strong>{compactMinutes(s.totalMinutes)}</strong></span>
            <span className="sleep-session-tab-time">{formatTime(s.startTime)}–{formatTime(s.endTime)}</span>
          </button>)}
        </div>
      </div>}
      <div className="sleep-key-grid sleep-summary-grid" id="sleep-session-summary" role={sessions.length > 1 ? 'tabpanel' : undefined} aria-labelledby={sessions.length > 1 ? `sleep-tab-${sessions.findIndex(s => s.id === session?.id)}` : undefined}>
        <div className="sleep-key-primary"><span>Time asleep</span><strong>{compactMinutes(sleep.totalMinutes)}</strong></div>
        <div title={processing ?? score.reason ?? 'Experimental OpenFit estimate'}><span>OpenFit estimate</span><strong>{score.value === null ? '—' : <>{score.value}<small> / 100</small></>}</strong></div>
        <div><span>Efficiency</span><strong>{available(sleep.efficiency) ? `${sleep.efficiency}%` : '—'}</strong></div>
        <div><span>{session?.isNap ? 'Start' : 'Bedtime'}</span><strong>{formatTime(sleep.startTime)}</strong></div>
        <div><span>Wake time</span><strong>{formatTime(sleep.endTime)}</strong></div>
        <div><span>Awake</span><strong>{available(sleep.minutesAwake) ? formatMinutes(sleep.minutesAwake) : '—'}</strong></div>
      </div>
    </Panel> : <EmptyValue>No sleep session recorded for {dateLabel}. Sync your tracker to check for new sleep data.</EmptyValue>}

    {sleep.stageTimeline.length > 0 && <Panel className="sleep-timeline-card" category="sleep">
      <PanelHeader eyebrow={`${formatTime(sleep.startTime)} – ${formatTime(sleep.endTime)}`} title="Sleep timeline" icon={TrendIcon} />
      <SleepStageTimeline height={280} key={`${data.selectedDate}:${session?.id ?? 'main'}`} segments={sleep.stageTimeline} outOfBedSegments={session?.outOfBedSegments} />
      {sleep.stages.some(s => s.minutes > 0) && <div className="sleep-stage-totals">{sleep.stages.map(stage => <div className="sleep-stage-total" key={stage.key}>
        <span><i style={{ background: `var(--sleep-${stage.key})` }} />{stage.name}</span>
        <strong>{compactMinutes(stage.minutes)} <small title="Share of the recorded period">{Math.round(stage.minutes / sleep.stages.reduce((total, s) => total + s.minutes, 0) * 100)}%</small></strong>
      </div>)}</div>}
      {score.timeline && <div className="sleep-detail-stats sleep-timeline-stats">
        <Stat label="Mid-sleep awake" value={formatMinutes(score.timeline.awakeMinutes)} />
        <Stat label="Wake spells ≥5 min" value={String(score.timeline.sustainedAwakenings)} />
        <Stat label="Longest wake" value={formatMinutes(score.timeline.longestAwakeMinutes)} />
        <Stat label="Longest sleep" value={formatMinutes(score.timeline.longestSleepMinutes)} />
      </div>}
    </Panel>}

    <SleepOvernightSignals health={data.health} trends={data.source === 'demo' ? data.sleep.historyTrends ?? data.trends : trends} selectedDate={data.selectedDate} source={data.source} />
    <SleepDetailedSignals sleep={sleep} details={data.sleep.details} />

    <section className="sleep-history" aria-label="Sleep history">
      <div className="sleep-history-heading"><div><h2>Sleep history</h2><p>Main sleep · {formatDate(first, { month: 'short', day: 'numeric' })} – {formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
        <div className="sleep-history-controls"><div className="sleep-range-buttons" role="group" aria-label="Sleep history range">{[7, 14, 30].map(n => <button key={n} aria-pressed={count === n} onClick={() => changeRange(end, n)}>{n} days</button>)}</div>
          <button aria-label="Previous sleep period" onClick={() => changeRange(offsetDate(end, -count))}>←</button><label>Ending<input type="date" aria-label="Sleep history end date" value={end} max={localIso()} onChange={e => changeRange(e.target.value)} /></label><button aria-label="Next sleep period" disabled={end >= localIso()} onClick={() => changeRange(offsetDate(end, count) > localIso() ? localIso() : offsetDate(end, count))}>→</button>
        </div>
      </div>
      <WeeklySleep data={historyData} days={days.map(day => day.selectedDate === data.selectedDate ? historyData : day)} endDate={end} dayCount={count} ready={ready} error={ready && archive.error} />
      <div className="sleep-week-trend-grid">{charts.filter(c => c.values.filter(available).length > 1).map(chart => <Panel key={chart.title} category="sleep"><PanelHeader title={chart.title} eyebrow={`${chart.values.filter(available).length} / ${count} nights recorded`} icon={GaugeIcon} /><LineChart values={chart.values} labels={labels} xValues={points.map((_, i) => Date.parse(`${offsetDate(first, i)}T12:00:00Z`))} target={chart.target} color="var(--category-sleep)" height={150} compact showRangeLabels formatter={chart.format} ariaLabel={`${chart.title}, ${first} to ${end}`} /></Panel>)}</div>
      <details className="sleep-score-history"><summary>Compare OpenFit estimates</summary><SleepScoreDetails sleep={sleep} /><p className="sleep-signal-note">Experimental timeline estimates; nights without complete staged recordings have no estimate.</p><LineChart values={points.map(p => p ? sleepScoreForTrend(p) : null)} labels={labels} color="var(--category-sleep)" height={150} compact formatter={v => `${v} / 100`} ariaLabel={`OpenFit estimates, ${first} to ${end}`} /></details>
    </section>
    <ResearchInsights data={data} kind="sleep" />
  </div>
}
