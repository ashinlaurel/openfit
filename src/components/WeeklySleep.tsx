import { useEffect, useState, type CSSProperties } from 'react'
import { Clock3, Moon, Sunrise } from 'lucide-react'
import type { DashboardData } from '@/types'
import { compactMinutes, formatDate } from '@/lib/format'
import { offsetDate } from '@/lib/research-insights'
import { sleepHistory } from '@/lib/sleep-history'
import { sleepClock, sleepWeek } from '@/lib/sleep-week'
import { sleepScoreForTrend } from '@/lib/sleep-score'

export function WeeklySleep({ data, days, endDate, dayCount, ready, error }: {
  data: DashboardData; days: DashboardData[]; endDate: string; dayCount: number; ready: boolean; error: boolean
}) {
  const firstDate = offsetDate(endDate, 1 - dayCount)
  let timezone = data.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }) } catch { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone }
  const result = sleepWeek(days, endDate, timezone, dayCount)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setSelected(null), [endDate, dayCount])
  const current = result.nights.find(n => n.date === selected)
  const daysByDate = new Map([...days, data].map(day => [day.selectedDate, day]))
  const currentDay = current ? daysByDate.get(current.date) : undefined
  const history = sleepHistory(days)
  const scoreForDate = (date: string) => {
    const point = history.get(date)?.point
    return point ? sleepScoreForTrend(point) : null
  }
  const range = `${formatDate(firstDate, { month: 'short', day: 'numeric' })} – ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const dayOffset = (value: number) => value < 0 ? ' (previous day)' : value >= 1440 ? ' (next day)' : ''


  return <section className="weekly-sleep" aria-label="Sleep timing" aria-busy={!ready}>
    <header className="weekly-sleep-header"><div><span className="weekly-sleep-eyebrow"><Moon /> YOUR SLEEP SCHEDULE</span><h2>Sleep timing</h2><p>{range} · Main sleep and naps; bars include awake periods.</p></div></header>
    <div className="weekly-sleep-summary"><div><span className="weekly-sleep-summary-icon"><Clock3 /></span><div><small>AVERAGE MAIN SLEEP</small><strong>{result.averageAsleep === null ? '—' : compactMinutes(Math.round(result.averageAsleep))}</strong></div></div><div><span className="weekly-sleep-summary-icon"><Moon /></span><div><small>NIGHTS WITH TIMING</small><strong>{result.timedCount}<span> / {dayCount} nights</span></strong></div></div><div className="weekly-sleep-source"><i />{data.source === 'demo' ? 'Demo data' : 'From your local archive'}<small>{timezone}</small></div></div>
    {!ready && <p className="weekly-sleep-status" role="status">Loading your local nights…</p>}
    {ready && error && <p className="weekly-sleep-status" role="status">Local history could not be loaded. Showing any available selected-day data.</p>}
    <div className="weekly-sleep-scroll" role="region" aria-label="Sleep bars; scroll horizontally on smaller screens" tabIndex={0}>
      <div className="weekly-sleep-chart" style={{ '--sleep-grid-step': `${100 / (result.ticks.length - 1)}%` } as CSSProperties}>
        <div className="weekly-sleep-axis"><span>WAKE DAY</span><div>{result.ticks.map(tick => <span key={tick} style={{ left: `${(tick-result.min)/(result.max-result.min)*100}%` }} className={tick % 1440 === 0 ? 'is-midnight' : ''}>{tick % 1440 === 0 ? 'Midnight' : sleepClock(tick).replace(':00','')}</span>)}</div><span>TIME ASLEEP</span></div>
        {result.nights.map(night => {
          const timing = night.start !== null && night.end !== null
          const extra = night.sessions.filter(s => !s.isMainSleep)
          const chosen = selected === night.date
          const openfitScore = scoreForDate(night.date)
          const label = `${formatDate(night.date,{weekday:'long',month:'long',day:'numeric'})}. ${timing ? `Bedtime ${sleepClock(night.start!)}${dayOffset(night.start!)}; wake ${sleepClock(night.end!)}${dayOffset(night.end!)}.` : 'Bedtime and wake time unavailable.'} Time asleep ${night.asleep === null ? 'unavailable' : compactMinutes(night.asleep)}.`
          return <div key={night.date} className={`weekly-sleep-row ${night.date === data.selectedDate ? 'is-selected-day' : ''} ${chosen ? 'is-focused-night' : ''}`} >
            <div className="weekly-sleep-day"><strong>{formatDate(night.date,{weekday:'short'})}</strong><span>{formatDate(night.date,{month:'short',day:'numeric'})}</span></div>
            <div className="weekly-sleep-track">{timing ? <button className="weekly-sleep-bar" aria-label={label} aria-pressed={chosen} onClick={() => setSelected(chosen ? null : night.date)} style={{ left:`${(night.start!-result.min)/(result.max-result.min)*100}%`, width:`${(night.end!-night.start!)/(result.max-result.min)*100}%` }}><span><Moon />{sleepClock(night.start!)}</span><i/><span>{sleepClock(night.end!)}<Sunrise /></span></button> : <span className="weekly-sleep-missing">{ready ? 'No main sleep timing' : 'Loading…'}</span>}{extra.map(s => s.start !== null && s.end !== null && <button key={s.id} className="weekly-sleep-bar weekly-sleep-extra" style={{ left: `${(s.start-result.min)/(result.max-result.min)*100}%`, width: `${(s.end-s.start)/(result.max-result.min)*100}%` }} aria-label={`${night.date}. ${s.isNap ? 'Nap' : 'Additional sleep'} ${sleepClock(s.start)} to ${sleepClock(s.end)}. ${compactMinutes(s.asleep)} asleep.`} title={`${s.isNap ? 'Nap' : 'Sleep'} · ${sleepClock(s.start)}–${sleepClock(s.end)} · ${compactMinutes(s.asleep)} asleep`} aria-pressed={chosen} onClick={() => setSelected(chosen ? null : night.date)}><span className="weekly-sleep-extra-label">{s.isNap ? 'Nap' : 'Sleep'}</span><span className="weekly-sleep-extra-time">{compactMinutes(s.asleep)}</span></button>)}</div>
            <div className="weekly-sleep-duration"><strong>{night.asleep === null ? '—' : compactMinutes(night.asleep)}</strong><small>{openfitScore !== null ? `OpenFit ${openfitScore} · est.` : night.asleep !== null ? 'recorded sleep' : timing ? 'timing only' : 'No data'}</small>{extra.length > 0 && <small>+ {compactMinutes(extra.reduce((sum, s) => sum + (s.asleep ?? 0), 0))} {extra.every(s => s.isNap) ? 'nap' : 'extra sleep'}</small>}</div>
          </div>
        })}
      </div>
    </div>
    {current && <div className="weekly-sleep-night-detail" role="status"><strong>{formatDate(current.date,{weekday:'long',month:'short',day:'numeric'})}</strong>{current.start !== null && <span><Moon /> Bedtime {sleepClock(current.start)}{dayOffset(current.start)}</span>}{current.end !== null && <span><Sunrise /> Wake {sleepClock(current.end)}{dayOffset(current.end)}</span>}<span><Clock3 /> {current.asleep === null ? 'Asleep time unavailable' : `${compactMinutes(current.asleep)} asleep`}</span>{currentDay && currentDay.sleep.efficiency !== null && <span>{currentDay.sleep.efficiency}% efficiency</span>}{currentDay && currentDay.sleep.score !== null && <span>{currentDay.sleep.score} score</span>}{current.sessions.filter(s => !s.isMainSleep).map(s => <span key={s.id}>{s.isNap ? 'Nap' : 'Additional sleep'}: {s.start !== null ? sleepClock(s.start) : 'Unknown start'}–{s.end !== null ? sleepClock(s.end) : 'unknown end'} · {compactMinutes(s.asleep)} asleep</span>)}{currentDay?.sleep.stages.filter(stage => stage.minutes > 0).map(stage => <span key={stage.name}>{stage.name} {compactMinutes(stage.minutes)}</span>)}</div>}
    <footer><span><i/> Bedtime → wake time <small>including awake periods</small></span><p>Main sleep and naps share the timeline. Select a bar for exact times. {result.durationCount}/{dayCount} nights have duration data. Missing nights stay empty.</p></footer>
    <details className="weekly-sleep-exact"><summary>View exact times</summary><div className="weekly-sleep-table-scroll"><table><caption className="sr-only">Sleep timing, {range}, {timezone}</caption><thead><tr><th scope="col">Wake day</th><th scope="col">Bedtime</th><th scope="col">Wake time</th><th scope="col">Main sleep</th><th scope="col">Naps / additional sleep</th></tr></thead><tbody>{result.nights.map(n => <tr key={n.date}><th scope="row">{n.date}</th><td>{n.start === null ? 'Unavailable' : `${sleepClock(n.start)}${dayOffset(n.start)}`}</td><td>{n.end === null ? 'Unavailable' : `${sleepClock(n.end)}${dayOffset(n.end)}`}</td><td>{n.asleep === null ? 'Unavailable' : compactMinutes(n.asleep)}</td><td>{n.sessions.filter(s => !s.isMainSleep).map(s => `${s.isNap ? 'Nap' : 'Sleep'}: ${s.start === null ? 'Unknown' : sleepClock(s.start)}–${s.end === null ? 'unknown' : sleepClock(s.end)} (${compactMinutes(s.asleep)})`).join('; ') || 'None recorded'}</td></tr>)}</tbody></table></div></details>
  </section>
}
