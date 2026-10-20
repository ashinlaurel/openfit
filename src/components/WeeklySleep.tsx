import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, Moon, Sunrise } from 'lucide-react'
import type { DashboardData } from '@/types'
import { createDemoData, localIso } from '@/data/demo'
import { normalizeFitbitData } from '@/data/normalize'
import { compactMinutes, formatDate } from '@/lib/format'
import { offsetDate } from '@/lib/research-insights'
import { sleepClock, sleepWeek } from '@/lib/sleep-week'

export function WeeklySleep({ data }: { data: DashboardData }) {
  const [endDate, setEndDate] = useState(data.selectedDate)
  const [history, setHistory] = useState<{ key: string; days: DashboardData[]; error: boolean } | null>(null)
  const today = localIso()
  const firstDate = offsetDate(endDate, -6)
  const key = `${data.source}:${data.generatedAt}:${data.selectedDate}:${endDate}`
  useEffect(() => { setEndDate(data.selectedDate) }, [data.selectedDate])
  useEffect(() => {
    let canceled = false
    if (data.source === 'demo') {
      setHistory({ key, days: Array.from({ length: 7 }, (_, i) => createDemoData(offsetDate(endDate, -i))), error: false })
    } else if (window.fitbit) {
      void window.fitbit.getCachedArchive().then(archive => {
        const days = Object.values(archive.days).filter(day => day.date >= firstDate && day.date <= endDate).map(normalizeFitbitData)
        if (!canceled) setHistory({ key, days, error: false })
      }).catch(() => { if (!canceled) setHistory({ key, days: [], error: true }) })
    } else setHistory({ key, days: [], error: false })
    return () => { canceled = true }
  }, [key, data.source, firstDate, endDate])
  const ready = history?.key === key
  const timezone = useMemo(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone
    try { new Intl.DateTimeFormat('en-US', { timeZone: data.profile.timezone || device }); return data.profile.timezone || device } catch { return device }
  }, [data.profile.timezone])
  const result = useMemo(() => sleepWeek([
    ...(ready ? history.days : []).filter(day => day.selectedDate !== data.selectedDate),
    data,
  ], endDate, timezone), [data, history, ready, endDate, timezone])
  const [selected, setSelected] = useState<string | null>(null)
  const current = result.nights.find(n => n.date === selected)
  const range = `${formatDate(firstDate, { month: 'short', day: 'numeric' })} – ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const dayOffset = (value: number) => value < 0 ? ' (previous day)' : value >= 1440 ? ' (next day)' : ''
  const changeEnd = (date: string) => { if (date && date <= today) { setEndDate(date); setSelected(null) } }

  return <section className="weekly-sleep" aria-label="Weekly sleep timing" aria-busy={!ready}>
    <header className="weekly-sleep-header"><div><span className="weekly-sleep-eyebrow"><Moon /> THE SHAPE OF YOUR NIGHTS</span><h2>A week of rest.</h2><p>Bedtime, wake time, and the space in between.</p></div><div className="weekly-sleep-controls"><button aria-label="Previous sleep week" onClick={() => changeEnd(offsetDate(endDate, -7))}><ArrowLeft /></button><label><CalendarDays /><span>{range}</span><input type="date" aria-label="Last day of sleep week" max={today} value={endDate} onChange={e => changeEnd(e.target.value)} /></label><button aria-label="Next sleep week" disabled={endDate >= today} onClick={() => changeEnd(offsetDate(endDate, 7) > today ? today : offsetDate(endDate, 7))}><ArrowRight /></button></div></header>
    <div className="weekly-sleep-summary"><div><span className="weekly-sleep-summary-icon"><Clock3 /></span><div><small>AVERAGE TIME ASLEEP</small><strong>{result.averageAsleep === null ? '—' : compactMinutes(Math.round(result.averageAsleep))}</strong></div></div><div><span className="weekly-sleep-summary-icon"><Moon /></span><div><small>NIGHTS WITH TIMING</small><strong>{result.timedCount}<span> / 7 nights</span></strong></div></div><div className="weekly-sleep-source"><i />{data.source === 'demo' ? 'Demo data' : 'From your local archive'}<small>{timezone}</small></div></div>
    {!ready && <p className="weekly-sleep-status" role="status">Loading your local nights…</p>}
    {ready && history.error && <p className="weekly-sleep-status" role="status">Local history could not be loaded. Showing any available selected-day data.</p>}
    <div className="weekly-sleep-scroll" role="region" aria-label="Sleep bars; scroll horizontally on smaller screens" tabIndex={0}>
      <div className="weekly-sleep-chart" style={{ '--sleep-grid-step': `${100 / (result.ticks.length - 1)}%` } as CSSProperties}>
        <div className="weekly-sleep-axis"><span>WAKE DAY</span><div>{result.ticks.map(tick => <span key={tick} style={{ left: `${(tick-result.min)/(result.max-result.min)*100}%` }} className={tick % 1440 === 0 ? 'is-midnight' : ''}>{tick % 1440 === 0 ? 'Midnight' : sleepClock(tick).replace(':00','')}</span>)}</div><span>TIME ASLEEP</span></div>
        {result.nights.map(night => {
          const timing = night.start !== null && night.end !== null
          const chosen = selected === night.date
          const label = `${formatDate(night.date,{weekday:'long',month:'long',day:'numeric'})}. ${timing ? `Bedtime ${sleepClock(night.start!)}${dayOffset(night.start!)}; wake ${sleepClock(night.end!)}${dayOffset(night.end!)}.` : 'Bedtime and wake time unavailable.'} Time asleep ${night.asleep === null ? 'unavailable' : compactMinutes(night.asleep)}.`
          return <div key={night.date} className={`weekly-sleep-row ${night.date === data.selectedDate ? 'is-selected-day' : ''} ${chosen ? 'is-focused-night' : ''}`}>
            <div className="weekly-sleep-day"><strong>{formatDate(night.date,{weekday:'short'})}</strong><span>{formatDate(night.date,{month:'short',day:'numeric'})}</span></div>
            <div className="weekly-sleep-track">{timing ? <button className="weekly-sleep-bar" aria-label={label} aria-pressed={chosen} onClick={() => setSelected(chosen ? null : night.date)} style={{ left:`${(night.start!-result.min)/(result.max-result.min)*100}%`, width:`${(night.end!-night.start!)/(result.max-result.min)*100}%` }}><span><Moon />{sleepClock(night.start!)}</span><i/><span>{sleepClock(night.end!)}<Sunrise /></span></button> : <span className="weekly-sleep-missing">{ready ? 'No bedtime / wake-time record' : 'Loading…'}</span>}</div>
            <div className="weekly-sleep-duration"><strong>{night.asleep === null ? '—' : compactMinutes(night.asleep)}</strong><small>{night.asleep !== null ? 'recorded sleep' : timing ? 'timing only' : 'No data'}</small></div>
          </div>
        })}
      </div>
    </div>
    {current && current.start !== null && current.end !== null && <div className="weekly-sleep-night-detail" role="status"><strong>{formatDate(current.date,{weekday:'long',month:'short',day:'numeric'})}</strong><span><Moon /> Bedtime {sleepClock(current.start!)}{dayOffset(current.start!)}</span><span><Sunrise /> Wake {sleepClock(current.end!)}{dayOffset(current.end!)}</span><span><Clock3 /> {current.asleep === null ? 'Asleep time unavailable' : `${compactMinutes(current.asleep)} asleep`}</span></div>}
    <footer><span><i/> Bedtime → wake time <small>including awake periods</small></span><p>Time asleep is the recorded sleep duration. {result.durationCount}/7 nights have duration data. Missing nights stay empty.</p></footer>
    <details className="weekly-sleep-exact"><summary>View exact times</summary><div className="weekly-sleep-table-scroll"><table><caption className="sr-only">Weekly sleep timing, {range}, {timezone}</caption><thead><tr><th scope="col">Wake day</th><th scope="col">Bedtime</th><th scope="col">Wake time</th><th scope="col">Time asleep</th></tr></thead><tbody>{result.nights.map(n => <tr key={n.date}><th scope="row">{n.date}</th><td>{n.start === null ? 'Unavailable' : `${sleepClock(n.start)}${dayOffset(n.start)}`}</td><td>{n.end === null ? 'Unavailable' : `${sleepClock(n.end)}${dayOffset(n.end)}`}</td><td>{n.asleep === null ? 'Unavailable' : compactMinutes(n.asleep)}</td></tr>)}</tbody></table></div></details>
  </section>
}
