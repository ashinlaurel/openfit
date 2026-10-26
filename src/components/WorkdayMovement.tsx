import { useId, useState } from 'react'
import type { DashboardData } from '@/types'
import { defaultWorkday, movementWindow, workdaySettings, workdayAverages } from '@/lib/movement'
import type { WorkdaySettings, MovementInterval } from '@/lib/movement'
import { formatClockLabel, formatMinutes, formatDate, formatNumber } from '@/lib/format'
import { offsetDate } from '@/lib/research-insights'
import { Panel, PanelHeader } from './Shared'
import { DurationIcon } from './icons'

type Window = ReturnType<typeof movementWindow>
function clock(time: number, timezone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(time)
}
function Timeline({ window, timezone, label }: { window: Window; timezone: string; label: string }) {
  const unseen = Math.max(0, (window.end - window.observedEnd) / (window.end - window.start) * 100)
  return <div className="movement-timeline" role="group" aria-label={label}>
    {unseen > 0 && <div className="movement-future" style={{ width: `${unseen}%` }} title="After this snapshot" />}
    {window.segments.map(segment => <button type="button" key={segment.start} className="movement-segment" style={{ left: `${segment.left}%`, width: `${segment.width}%` }} aria-label={`${formatMinutes(segment.minutes)} inactive, ${clock(segment.start, timezone)}–${clock(segment.end, timezone)}`}>
      <span className="movement-tooltip"><strong>{formatMinutes(segment.minutes)} inactive</strong><small>{clock(segment.start, timezone)}–{clock(segment.end, timezone)}</small></span>
    </button>)}
  </div>
}
function Axis({ window, timezone }: { window: Window; timezone: string }) {
  return <div className="movement-timeline-ticks">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction}>{clock(window.start + (window.end - window.start) * fraction, timezone)}</span>)}</div>
}
export function useWorkdaySettings() {
  const [settings, setSettings] = useState(() => {
    try { return workdaySettings(JSON.parse(localStorage.getItem('openfit:workday') ?? 'null')) } catch { return defaultWorkday }
  })
  const update = (value: WorkdaySettings) => {
    setSettings(value)
    try { localStorage.setItem('openfit:workday', JSON.stringify(value)) } catch { /* Session preference remains usable. */ }
  }
  return { settings, update }
}
export function WorkdayMovement({ data, settings, update, intervals = data.activity.sedentaryIntervals ?? [] }: { data: DashboardData; settings: WorkdaySettings; update: (value: WorkdaySettings) => void; intervals?: MovementInterval[] }) {
  const [editing, setEditing] = useState(false)
  const settingsId = useId()
  const timezone = data.profile.timezone || 'Asia/Kolkata'
  const window = movementWindow(data.activity.sedentaryIntervals ?? [], data.selectedDate, timezone, settings, Date.parse(data.generatedAt))
  const recorded = window.segments.length > 0
  const averages = workdayAverages(intervals, data.selectedDate, timezone, settings)
  const averageNote = averages.count ? ` · ${averages.count}d` : ''
  const averageTitle = 'Previous 7 days with timed records · same work hours'
  return <Panel className="movement-workday movement-workday-compact" category="activity">
    <PanelHeader title="Workday movement" icon={DurationIcon} action={<button type="button" className="movement-settings-toggle" aria-expanded={editing} aria-controls={settingsId} onClick={() => setEditing(open => !open)}>{editing ? 'Done' : 'Settings'}</button>} />
    {editing && <div id={settingsId} className="movement-controls movement-controls-inline">
      <label>From<select aria-label="Workday starts" value={settings.start} onChange={e => { const start = Number(e.target.value); update({ ...settings, start, end: Math.max(settings.end, start + 1) }) }}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{formatClockLabel(`${h}:00`)}</option>)}</select></label>
      <label>To<select aria-label="Workday ends" value={settings.end} onChange={e => update({ ...settings, end: Number(e.target.value) })}>{Array.from({ length: 24 - settings.start }, (_, i) => i + settings.start + 1).map(h => <option key={h} value={h}>{h === 24 ? 'Midnight (+1 day)' : formatClockLabel(`${h}:00`)}</option>)}</select></label>
      <label>Long stretch<select aria-label="Long stretch threshold" value={settings.threshold} onChange={e => update({ ...settings, threshold: Number(e.target.value) })}>{[30,45,60].map(n => <option key={n} value={n}>{n}+ min</option>)}</select></label>
      <span className="movement-timezone">{timezone}</span>
    </div>}
    <div className="movement-workday-mini-stats movement-workday-featured-stats">
      <div><span>Work-hours inactive</span><strong>{recorded ? formatMinutes(window.minutes) : '—'}</strong><small title={averageTitle}>Avg {averages.minutes === null ? '—' : formatMinutes(Math.round(averages.minutes))}{averageNote}</small></div>
      <div><span>Longest stretch</span><strong>{recorded ? formatMinutes(window.longest) : '—'}</strong><small title={averageTitle}>Avg {averages.longest === null ? '—' : formatMinutes(Math.round(averages.longest))}{averageNote}</small></div>
      <div><span>Stretches ≥{settings.threshold} min</span><strong>{recorded ? window.longCount : '—'}</strong><small title={averageTitle}>Avg {formatNumber(averages.longCount, { maximumFractionDigits: 1 })}{averageNote}</small></div>
    </div>
    <Timeline window={window} timezone={timezone} label="Recorded inactive periods during work hours" />
    <Axis window={window} timezone={timezone} />
    <div className="movement-legend"><span><i />Recorded inactive</span><span><i className="is-unknown" />Unrecorded</span>{window.observedEnd < window.end && <span><i className="is-future" />After snapshot</span>}</div>
    {!recorded && <p className="movement-no-intervals">No timed records</p>}
  </Panel>
}
export function MovementWeek({ data, intervals, endDate, count, settings }: { data: DashboardData; intervals: MovementInterval[]; endDate: string; count: number; settings: WorkdaySettings }) {
  const timezone = data.profile.timezone || 'Asia/Kolkata'
  const week = Array.from({ length: count }, (_, i) => {
    const date = offsetDate(endDate, i - count + 1)
    return { date, ...movementWindow(intervals, date, timezone, settings, Date.parse(data.generatedAt)) }
  })
  return <Panel className="movement-week" category="activity"><PanelHeader title="Inactive periods · work hours" icon={DurationIcon} />
    <div className="movement-week-axis"><span>Day</span><Axis window={week[0]} timezone={timezone} /><span>Inactive</span></div>
    <div className="movement-week-rows">{week.map(day => <div className={`movement-week-row ${day.date === data.selectedDate ? 'is-selected-day' : ''}`} key={day.date}>
      <span>{formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      <Timeline window={day} timezone={timezone} label={`${day.date}: ${day.segments.length ? `${formatMinutes(day.minutes)} recorded inactive` : 'No timed records'}`} />
      <strong>{day.segments.length ? formatMinutes(day.minutes) : '—'}</strong>
    </div>)}</div>
  </Panel>
}
