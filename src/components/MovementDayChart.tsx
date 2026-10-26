import { useState } from 'react'
import type { DashboardData } from '@/types'
import { movementHours, movementWindow, zonedInstant } from '@/lib/movement'
import { formatClockLabel, formatNumber, formatDecimal, formatTime } from '@/lib/format'
import { Panel, PanelHeader } from './Shared'
import { ColumnChart } from './Charts'
import { StepsIcon } from './icons'

export function MovementDayChart({ data }: { data: DashboardData }) {
  const timezone = data.profile.timezone || 'Asia/Kolkata'
  const observedUntil = Date.parse(data.generatedAt)
  const hours = movementHours(data.activity.stepsIntraday)
  const window = movementWindow([], data.selectedDate, timezone, { start: 0, end: 24, threshold: 30 }, observedUntil)
  const values = hours.map(h => zonedInstant(`${data.selectedDate}T${String(h.hour).padStart(2, '0')}:00:00`, timezone) > observedUntil ? null : h.steps)
  const labels = hours.map(h => formatClockLabel(`${String(h.hour).padStart(2,'0')}:00`))
  const intervals = (data.activity.intensityIntervals ?? []).flatMap(item => {
    const start = Math.max(window.start, Date.parse(item.startTime)), end = Math.min(window.end, observedUntil, Date.parse(item.endTime))
    return end > start ? [{ ...item, start, end }] : []
  })
  const [overlay, setOverlay] = useState<'none' | 'distance' | 'zones'>('none')
  const samples = overlay === 'distance' ? data.activity.distanceIntervals ?? [] : overlay === 'zones' ? data.activity.zoneIntervals ?? [] : []
  const hourly = hours.map(h => {
    const start = zonedInstant(`${data.selectedDate}T${String(h.hour).padStart(2,'0')}:00:00`, timezone), end = start + 3600000
    const points = samples.flatMap(p => {
      const from = Date.parse(p.startTime), to = Date.parse(p.endTime)
      const overlap = Math.max(0, Math.min(end, to, observedUntil) - Math.max(start, from))
      return overlap && to > from ? [p.value * overlap / (to - from)] : []
    })
    return points.length ? points.reduce((a,b) => a+b,0) : null
  })
  const unit = overlay === 'distance' ? 'km' : 'zone min'
  return <Panel className="movement-day-chart" category="activity">
    <PanelHeader title="Movement across the day" eyebrow={data.selectedDate} icon={StepsIcon} action={<select aria-label="Hourly movement metric" value={overlay} onChange={e => setOverlay(e.target.value as typeof overlay)}><option value="none">Steps</option>{data.activity.distanceIntervals?.length ? <option value="distance">Distance</option> : null}{data.activity.zoneIntervals?.length ? <option value="zones">Zone minutes</option> : null}</select>} />
    <div className="movement-hour-chart"><ColumnChart key={overlay} values={overlay === 'none' ? values : hourly} labels={labels} color="var(--category-activity)" height={260} formatter={v => overlay === 'none' ? `${formatNumber(v)} steps` : `${formatDecimal(v, overlay === 'distance' ? 2 : 0)} ${unit}`} ariaLabel={overlay === 'none' ? 'Steps per hour' : `Estimated ${overlay} per hour from recorded intervals`} />
      {window.observedEnd < window.end && <div className="movement-chart-future" style={{ left: `${Math.max(0, (window.observedEnd-window.start)/(window.end-window.start)*100)}%` }} title="After this snapshot" />}
    </div>
    {intervals.length > 0 && <div className="movement-intensity"><span className="movement-strip-label">Recorded intensity</span><div className="movement-intensity-track" role="group" aria-label="Timestamped movement intensity">{intervals.map((segment, i) => <button type="button" key={`${segment.start}-${i}`} className={`movement-intensity-segment intensity-${segment.level}`} style={{ left: `${(segment.start-window.start)/(window.end-window.start)*100}%`, width: `${(segment.end-segment.start)/(window.end-window.start)*100}%` }} aria-label={`${segment.level}, ${formatTime(segment.startTime)}–${formatTime(segment.endTime)}`}><span className="movement-tooltip"><strong>{segment.level === 'sedentary' ? 'Inactive' : segment.level}</strong><small>{formatTime(segment.startTime)}–{formatTime(segment.endTime)}</small></span></button>)}</div>
      <div className="movement-legend">{['light','moderate','vigorous','sedentary'].map(level => <span key={level}><i className={`intensity-${level}`} />{level === 'sedentary' ? 'Inactive' : level}</span>)}</div>
    </div>}
  </Panel>
}
