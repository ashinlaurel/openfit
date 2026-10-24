import { createDemoData } from '@/data/demo'
import { offsetDate } from '@/lib/research-insights'
import { useState } from 'react'
import type { DashboardData } from '@/types'
import { defaultWorkday, movementHours, movementWindow, workdaySettings } from '@/lib/movement'
import { formatClockLabel, formatMinutes, formatNumber, relativeTime } from '@/lib/format'
import { Panel, PanelHeader } from './Shared'
import { DurationIcon, StepsIcon } from './icons'

export function WorkdayMovement({ data }: { data: DashboardData }) {
  const [settings, setSettings] = useState(() => {
    try { return workdaySettings(JSON.parse(localStorage.getItem('openfit:workday') ?? 'null')) } catch { return defaultWorkday }
  })
  const update = (value: typeof settings) => {
    setSettings(value)
    try { localStorage.setItem('openfit:workday', JSON.stringify(value)) } catch { /* Preferences remain available for this session. */ }
  }
  let timezone = data.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format() } catch { timezone = 'UTC' }
  const window = movementWindow(data.activity.sedentaryIntervals ?? [], data.selectedDate, timezone, settings)
  const available = window.segments.length > 0
  const hours = movementHours(data.activity.stepsIntraday)
  const known = hours.filter(hour => hour.steps !== null)
  const moving = known.filter(hour => hour.steps! > 0)
  const peak = moving.length ? moving.reduce((best, hour) => hour.steps! > best.steps! ? hour : best) : null
  const week = Array.from({length:7}, (_,i) => {
    const date = offsetDate(data.selectedDate, i-6)
    const intervals = data.source === 'demo' ? createDemoData(date).activity.sedentaryIntervals ?? [] : data.activity.sedentaryIntervals ?? []
    return { date, ...movementWindow(intervals, date, timezone, settings) }
  })
  const max = Math.max(1, ...known.map(hour => hour.steps!))
  const clock = (instant: number) => new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(instant)
  return <>
    <Panel className="movement-workday" category="activity">
      <div className="movement-workday-head">
        <div><span className="eyebrow">YOUR DAILY RHYTHM</span><h2>Make room to move.</h2><p>A closer look at the quiet stretches between everything else.</p></div>
        <span className="movement-source">{data.source === 'demo' ? 'Illustrative sample data' : data.device?.lastSyncTime ? `Device synced ${relativeTime(data.device.lastSyncTime)}` : `Snapshot ${relativeTime(data.generatedAt)}`}</span>
      </div>
      <div className="movement-controls">
        <label>Workday starts<select aria-label="Workday starts" value={settings.start} onChange={event => { const start = Number(event.target.value); update({ ...settings, start, end: Math.max(settings.end, start + 1) }) }}>{Array.from({length:24}, (_,h) => <option key={h} value={h}>{formatClockLabel(`${h}:00`)}{h === 24 ? ' (next day)' : ''}</option>)}</select></label>
        <label>Ends<select aria-label="Workday ends" value={settings.end} onChange={event => update({ ...settings, end: Number(event.target.value) })}>{Array.from({length:24-settings.start}, (_,i) => i+settings.start+1).map(h => <option key={h} value={h}>{formatClockLabel(`${h}:00`)}{h === 24 ? ' (next day)' : ''}</option>)}</select></label>
        <label>Long stretch<select aria-label="Long stretch threshold" value={settings.threshold} onChange={event => update({...settings, threshold:Number(event.target.value)})}>{[30,45,60].map(m => <option key={m} value={m}>{m}+ minutes</option>)}</select></label>
        <span className="movement-timezone">{timezone}</span>
      </div>
      <div className="movement-workday-stats">
        <div><span>Recorded inactivity · work hours</span><strong>{available ? formatMinutes(window.minutes) : '—'}</strong><small>Clipped to your chosen window</small></div>
        <div><span>Longest recorded stretch</span><strong>{available ? formatMinutes(window.longest!) : '—'}</strong><small>Overlapping intervals counted once</small></div>
        <div><span>Stretches of {settings.threshold}+ minutes</span><strong>{available ? window.longCount : '—'}</strong><small>Your tracking threshold</small></div>
      </div>
      <div className="movement-timeline-label"><strong>Workday timeline</strong><span><i /> Recorded sedentary period</span></div>
      <div className="movement-timeline" aria-label="Recorded sedentary intervals during work hours">
        {window.segments.map(segment => <div key={segment.start} className="movement-segment" style={{left:`${segment.left}%`,width:`${segment.width}%`}} title={`${clock(segment.start)}–${clock(segment.end)} · ${formatMinutes(segment.minutes)}`} />)}
      </div>
      <div className="movement-timeline-ticks">{[0,.25,.5,.75,1].map(fraction => <span key={fraction}>{clock(window.start+(window.end-window.start)*fraction)}</span>)}</div>
      {!available && <p className="movement-no-intervals">No sedentary intervals available in this window. Older cached days may contain only daily totals; refresh a connected Google Health account to fetch intervals.</p>}
      <details className="movement-records"><summary>Recorded intervals · {window.segments.length}</summary>{available ? <ul>{window.segments.map(segment => <li key={segment.start}><span>{clock(segment.start)}–{clock(segment.end)}</span><strong>{formatMinutes(segment.minutes)}</strong></li>)}</ul> : <p>No timed records to display.</p>}</details>
      <p className="movement-method">Sedentary means the wearable recorded no movement while worn; it does not identify sitting posture. Uncoloured time is unclassified, not confirmed activity. Synced history, not live monitoring.</p>
    </Panel>
    <Panel className="movement-distribution" category="activity">
      <PanelHeader eyebrow="Across the day" title="Every hour tells a story" icon={StepsIcon} />
      <div className="movement-hour-summary"><span><strong>{known.length ? moving.length : '—'}</strong> hours with recorded steps <small>of {known.length} hours containing records</small></span><span><DurationIcon />{peak ? `Busiest hour ${formatClockLabel(`${peak.hour}:00`)} · ${formatNumber(peak.steps)} steps` : 'No movement peak available'}</span></div>
      <div className="movement-hour-grid">{hours.map(hour => <div key={hour.hour} className={`movement-hour ${hour.steps === null ? 'is-missing' : ''}`} style={hour.steps === null ? {} : {background:`color-mix(in srgb, var(--category-activity) ${8+hour.steps/max*60}%, var(--surface-raised, #171e1d))`}} title={`${formatClockLabel(`${hour.hour}:00`)} · ${hour.steps === null ? 'No records' : `${formatNumber(hour.steps)} steps`}`}><span>{formatClockLabel(`${hour.hour}:00`)}</span><strong>{hour.steps === null ? '—' : formatNumber(hour.steps)}</strong></div>)}</div>
      <p className="movement-method">Hour labels use the provider’s local clock. “—” means no step records; 0 means an explicitly recorded zero. An hour with steps is not a full hour of activity.</p>
    </Panel>
    <Panel className="movement-week" category="activity">
      <PanelHeader eyebrow="Seven days · selected work hours" title="Your week, in motion" icon={DurationIcon} />
      <p className="movement-method">Recorded sedentary intervals aligned to the same workday window. Daily totals elsewhere include the whole day.</p>
      <div className="movement-week-rows">{week.map(day => <div className="movement-week-row" key={day.date}>
        <span>{new Intl.DateTimeFormat('en', { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(`${day.date}T12:00:00Z`))}</span>
        <div className="movement-timeline" aria-label={`${day.date}: ${day.segments.length ? `${formatMinutes(day.minutes)} recorded inactivity` : 'No timed records'}`}>
          {day.segments.map(segment => <div className="movement-segment" key={segment.start} style={{left:`${segment.left}%`,width:`${segment.width}%`}} title={`${day.date} · ${clock(segment.start)}–${clock(segment.end)} · ${formatMinutes(segment.minutes)}`} />)}
        </div><strong>{day.segments.length ? formatMinutes(day.minutes) : '—'}</strong>
      </div>)}</div>
      <p className="movement-method">Blank rows mean no timed records available, not zero inactivity. {data.source === 'demo' ? 'Sample intervals illustrate the layout.' : 'Uses the interval history returned at your latest sync.'}</p>
    </Panel>
  </>
}
