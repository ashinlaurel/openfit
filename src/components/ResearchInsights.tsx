import { useEffect, useState } from 'react'
import type { DashboardData } from '@/types'
import { normalizeFitbitData } from '@/data/normalize'
import { createDemoData } from '@/data/demo'
import { offsetDate, personalBaseline, socialJetlag, weeklyActivity } from '@/lib/research-insights'
import { formatMinutes } from '@/lib/format'

function Source({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noreferrer" onClick={event => {
    if (window.fitbit) { event.preventDefault(); void window.fitbit.openExternal(href) }
  }}>{children} ↗</a>
}

export function ResearchInsights({ data, kind }: { data: DashboardData; kind: 'activity' | 'sleep' | 'recovery' }) {
  const [history, setHistory] = useState<{ key: string; days: DashboardData[]; error: boolean } | null>(null)
  const [workdays, setWorkdays] = useState<number[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem('openfit-workdays') ?? 'null')
      if (Array.isArray(stored) && stored.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return stored
    } catch { /* Use editable default when storage is unavailable. */ }
    return [1, 2, 3, 4, 5]
  })
  const key = `${data.source}:${data.selectedDate}:${data.generatedAt}`
  useEffect(() => {
    if (kind === 'recovery') return
    let canceled = false
    if (data.source === 'demo') {
      setHistory({ key, days: Array.from({ length: 28 }, (_, i) => createDemoData(offsetDate(data.selectedDate, -i))), error: false })
    } else if (window.fitbit) {
      void window.fitbit.getCachedArchive().then(archive => {
        const days = Object.values(archive.days).filter(day => day.date >= offsetDate(data.selectedDate, -27) && day.date <= data.selectedDate).map(normalizeFitbitData)
        if (!canceled) setHistory({ key, days, error: false })
      }).catch(() => { if (!canceled) setHistory({ key, days: [], error: true }) })
    } else setHistory({ key, days: [], error: false })
    return () => { canceled = true }
  }, [key, kind, data.selectedDate, data.source])

  const ready = history?.key === key
  const days = [...(ready ? history.days : []).filter(day => day.selectedDate !== data.selectedDate), data]
  const timezone = data.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  let jetlag: ReturnType<typeof socialJetlag> | null = null
  try { jetlag = socialJetlag(days, data.selectedDate, workdays, timezone) } catch { /* Invalid provider timezone: show missing data. */ }
  const weekly = weeklyActivity(days, data.selectedDate)
  const hrv = personalBaseline(data, 'hrvMs', data.health.hrvMs)
  const heart = personalBaseline(data, 'restingHeartRate', data.health.restingHeartRate)
  const delta = (value: number | null, unit: string) => value === null ? 'Building baseline' : `${value > 0 ? '+' : ''}${value.toFixed(1)} ${unit}`

  return <section className="research-insights" aria-label={kind === 'recovery' ? 'Personal recovery trends' : kind === 'sleep' ? 'Sleep schedule insight' : 'Weekly activity insight'}>
    <header><h2>{kind === 'recovery' ? 'Personal recovery trends' : kind === 'sleep' ? 'Sleep schedule' : 'Weekly activity progress'}</h2><span>{data.source === 'demo' ? 'Demo estimates' : 'Recorded data'}</span></header>
    {kind === 'activity' && <>
      <div className="research-stats"><div><small>Moderate-equivalent minutes</small><strong>{weekly.equivalent === null ? '—' : Math.round(weekly.equivalent)}<span> / 150 min</span></strong><p>{weekly.count}/7 days with both intensity measurements · 7 days ending {data.selectedDate}</p></div><div><small>Recorded intensity</small><strong>{weekly.count ? Math.round(weekly.moderate) : '—'}<span> moderate · </span>{weekly.count ? Math.round(weekly.vigorous) : '—'}<span> vigorous min</span></strong><p>Incomplete weeks are partial totals, not zero-activity days.</p></div></div>
      {weekly.equivalent !== null && <progress aria-label="Estimated moderate-equivalent minutes toward 150" max={150} value={Math.min(150, weekly.equivalent)} />}
      <details><summary>How calculated & evidence</summary><p>Moderate minutes + 2 × vigorous minutes. Estimated from provider intensity categories, which may differ from guideline definitions. General adult aerobic reference: at least 150 moderate-equivalent minutes weekly; muscle strengthening is separate and is not assessed here.</p><Source href="https://www.cdc.gov/physical-activity-basics/adding-adults/what-counts.html">CDC activity guidelines</Source></details>
    </>}
    {kind === 'recovery' && <>
      <div className="research-stats">{[{ title: 'HRV vs baseline', value: hrv, unit: 'ms' }, { title: 'Resting heart rate vs baseline', value: heart, unit: 'bpm' }].map(item => <div key={item.title}><small>{item.title}</small><strong>{item.value.mean !== null && item.value.delta === null ? 'No reading for this day' : delta(item.value.delta, item.unit)}</strong><p>{item.value.mean === null ? `Needs 7 valid prior days; ${item.value.count} available.` : `Baseline ${item.value.mean.toFixed(1)} ${item.unit} · ${item.value.count}/28 prior days`}</p></div>)}</div>
      <details><summary>How calculated & evidence</summary><p>Selected-day value minus the arithmetic mean of valid readings in the preceding 28 calendar days; at least 7 are required as an app coverage rule. Selected day and future days are excluded. These descriptive comparisons are not a validated readiness score or training prescription. HRV-guided training research uses specific measurement protocols; wearable nightly estimates are not interchangeable with those protocols.</p><Source href="https://pubmed.ncbi.nlm.nih.gov/17849143/">HRV-guided training research</Source></details>
    </>}
    {kind === 'sleep' && <>
      <div className="research-stats"><div><small>Social jetlag estimate</small><strong>{jetlag?.minutes == null ? 'Not enough timing data' : formatMinutes(Math.round(jetlag.minutes))}</strong><p>{jetlag?.workCount ?? 0} workday nights · {jetlag?.freeCount ?? 0} free-day nights · last 28 days</p></div></div>
      <fieldset className="research-workdays"><legend>Your workdays <small>(choose your usual schedule)</small></legend>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label key={day}><input type="checkbox" checked={workdays.includes(index)} onChange={() => {
        const next = workdays.includes(index) ? workdays.filter(d => d !== index) : [...workdays, index]
        setWorkdays(next)
        try { localStorage.setItem('openfit-workdays', JSON.stringify(next)) } catch { /* Session setting still works. */ }
      }} />{day}</label>)}</fieldset>
      <details><summary>How calculated & evidence</summary><p>Absolute circular difference between average sleep midpoint on workdays and free days, using wake-up day to classify each night. Time zone: {timezone}. Needs at least 3 workday and 2 free-day records as an app coverage rule. Bedtime/wake-time midpoints approximate actual sleep timing; naps, historical travel, irregular shifts, and missing nights can affect the estimate. This is not the Sleep Regularity Index.</p><Source href="https://pubmed.ncbi.nlm.nih.gov/16687322/">Social jetlag research</Source></details>
    </>}
    {kind !== 'recovery' && !ready && <p role="status">Loading local history…</p>}
    {kind !== 'recovery' && ready && history.error && <p role="status">Local history could not be read. Only the selected day is included.</p>}
  </section>
}
