import { useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Bike, CalendarDays, Check, ChevronRight, Clock3, Dumbbell, Footprints, Heart, Layers3, Search, Waves, X } from 'lucide-react'
import type { ActivityItem, DashboardData, HeartZoneMinutes, WorkoutSplit } from '@/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Panel, PanelHeader } from './Shared'
import { ColumnChart, LineChart } from './Charts'
import { ActivityIcon, HeartIcon, TrendIcon } from './icons'
import { formatDate, formatDecimal, formatMinutes, formatNumber, relativeTime } from '@/lib/format'
import { collectWorkouts, knownNumber, paceLabel, workoutGroup, workoutHeartSeries, workoutMetric, workoutMinutes, type WorkoutMetric } from '@/lib/workouts'
import { offsetDate } from '@/lib/research-insights'
import { useWorkoutHistory } from '@/lib/use-workout-history'

const zoneColors = {light:'#72a8a0',moderate:'#e2b45c',vigorous:'#e38a57',peak:'#d66c73'}
const zoneNames = {light:'Light',moderate:'Moderate',vigorous:'Vigorous',peak:'Peak'}
const metricNames:Record<WorkoutMetric,string> = {duration:'Duration',distance:'Distance',pace:'Average pace',heart:'Average heart rate'}
function sessionIcon(item:ActivityItem) {
  const type=`${item.exerciseType || ''} ${item.name}`.toLowerCase()
  return /swim/.test(type)?Waves:/bike|cycling|biking/.test(type)?Bike:/strength|weight|functional|resistance/.test(type)?Dumbbell:/walk|run|treadmill/.test(type)?Footprints:Activity
}
const elapsedClock = (minutes:number) => { const seconds=Math.round(minutes*60); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}` }
const formatMetric = (value:number,metric:WorkoutMetric) => metric==='duration'?formatMinutes(value):metric==='distance'?`${formatDecimal(value)} km`:metric==='pace'?`${paceLabel(value)} /km`:`${formatNumber(value)} bpm`
function reportedSum(items:ActivityItem[],get:(item:ActivityItem)=>number|null|undefined) { const values=items.map(get).filter(knownNumber); return values.length?values.reduce((a,b)=>a+b,0):null }
function Zones({zones}:{zones:HeartZoneMinutes|null}) {
  const rows=(Object.keys(zoneNames) as Array<keyof HeartZoneMinutes>).flatMap(key=>knownNumber(zones?.[key])?[{key,value:zones![key]!}]:[])
  const total=rows.reduce((sum,row)=>sum+row.value,0)
  if(!rows.length || !total)return null
  return <section className="workout-detail-section"><div className="workout-section-heading"><h3>Heart-rate zones</h3><span>{formatMinutes(total)} reported</span></div><div className="workout-zone-bar" aria-label="Reported heart-rate zone distribution">{rows.filter(row=>row.value>0).map(row=><i key={row.key} style={{width:`${row.value/total*100}%`,background:zoneColors[row.key]}} title={`${zoneNames[row.key]}: ${formatMinutes(row.value)}`}/>)}</div><div className="workout-zone-legend">{rows.map(row=><div key={row.key}><i style={{background:zoneColors[row.key]}}/><span>{zoneNames[row.key]}</span><strong>{formatMinutes(row.value)}</strong></div>)}</div><p className="workout-caption">Distribution uses reported zone minutes. Any unreported zones remain unknown.</p></section>
}
function SplitDetails({splits}:{splits:WorkoutSplit[]}) {
  const rows=splits.filter(split=>[split.distanceKm,split.activeMinutes,split.elapsedMinutes,split.paceSecondsPerMeter,split.averageHeartRate,split.calories].some(knownNumber))
  if(!rows.length)return null
  const has=(key:keyof WorkoutSplit)=>rows.some(row=>knownNumber(row[key] as number|null))
  const pace=rows.some(row=>knownNumber(row.paceSecondsPerMeter)&&row.paceSecondsPerMeter>0), distance=has('distanceKm'), duration=has('activeMinutes') || has('elapsedMinutes'), heart=rows.some(row=>knownNumber(row.averageHeartRate)&&row.averageHeartRate>0), calories=has('calories')
  return <section className="workout-detail-section"><div className="workout-section-heading"><h3>Recorded laps & splits</h3><span>{rows.length} segments</span></div>
    {rows.filter(row=>knownNumber(row.paceSecondsPerMeter)&&row.paceSecondsPerMeter>0).length>1 && <><ColumnChart values={rows.map(row=>knownNumber(row.paceSecondsPerMeter)&&row.paceSecondsPerMeter>0?row.paceSecondsPerMeter*1000:null)} labels={rows.map((_,i)=>`${i+1}`)} formatter={paceLabel} color="var(--category-activity)" height={175} ariaLabel="Pace by recorded lap in minutes per kilometre"/><p className="workout-caption">Pace per kilometre · lower is faster. Short final laps are retained.</p></>}
    <div className="workout-table-scroll"><table className="workout-split-table"><caption className="sr-only">Recorded workout splits</caption><thead><tr><th>Lap</th>{distance&&<th>Distance</th>}{duration&&<th>Duration</th>}{pace&&<th>Pace /km</th>}{heart&&<th>Avg HR</th>}{calories&&<th>Calories</th>}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}><th>{i+1}{row.type==='MANUAL'&&<small>Manual</small>}</th>{distance&&<td>{knownNumber(row.distanceKm)?`${formatDecimal(row.distanceKm,2)} km`:'—'}</td>}{duration&&<td>{knownNumber(row.activeMinutes??row.elapsedMinutes)?elapsedClock((row.activeMinutes??row.elapsedMinutes)!):'—'}</td>}{pace&&<td>{knownNumber(row.paceSecondsPerMeter)&&row.paceSecondsPerMeter>0?paceLabel(row.paceSecondsPerMeter*1000):'—'}</td>}{heart&&<td>{knownNumber(row.averageHeartRate)&&row.averageHeartRate>0?`${formatNumber(row.averageHeartRate)} bpm`:'—'}</td>}{calories&&<td>{knownNumber(row.calories)?`${formatNumber(row.calories)} kcal`:'—'}</td>}</tr>)}</tbody></table></div><p className="workout-caption">Duration is shown as minutes:seconds, using active time where provided and elapsed time otherwise.</p>
  </section>
}
export function WorkoutDetails({item,samples,source}:{item:ActivityItem;samples:ReturnType<typeof collectWorkouts>['samples'];source:string}) {
  const series=useMemo(()=>workoutHeartSeries(item,samples),[item,samples])
  const Icon=sessionIcon(item), duration=workoutMinutes(item)
  const elapsed=knownNumber(item.elapsedDurationMinutes)?item.elapsedDurationMinutes:null
  const active=knownNumber(item.activeDurationMinutes)?item.activeDurationMinutes:null
  const pause=elapsed!==null&&active!==null&&elapsed>=active?elapsed-active:null
  const measures=[
    knownNumber(duration)?{label:active!==null?'Active time':'Recorded duration',value:formatMinutes(duration)}:null,
    knownNumber(item.distanceKm)?{label:'Workout distance',value:`${formatDecimal(item.distanceKm,2)} km`}:null,
    knownNumber(item.averageHeartRate)&&item.averageHeartRate>0?{label:'Average heart rate',value:`${formatNumber(item.averageHeartRate)} bpm`}:null,
    knownNumber(item.calories)?{label:'Workout calories',value:`${formatNumber(item.calories)} kcal`}:null,
    knownNumber(item.averagePaceSecondsPerMeter)&&item.averagePaceSecondsPerMeter>0?{label:'Average pace',value:`${paceLabel(item.averagePaceSecondsPerMeter*1000)} /km`}:null,
    knownNumber(item.averageSpeedKmh)?{label:'Average speed',value:`${formatDecimal(item.averageSpeedKmh)} km/h`}:null,
    knownNumber(item.zoneMinutes)?{label:'Active Zone Minutes',value:formatNumber(item.zoneMinutes)}:null,
    knownNumber(item.elevationGainMeters)?{label:'Elevation gain',value:`${formatNumber(item.elevationGainMeters)} m`}:null,
    knownNumber(item.runVo2Max)?{label:'Running VO₂ max',value:`${formatDecimal(item.runVo2Max)} ml/kg/min`}:null,
    knownNumber(item.swimLengths)?{label:'Pool lengths',value:formatNumber(item.swimLengths)}:null,
    knownNumber(item.poolLengthMeters)?{label:'Pool length',value:`${formatNumber(item.poolLengthMeters)} m`}:null,
  ].filter((metric):metric is {label:string;value:string}=>metric!==null)
  const start=Date.parse(item.startTime || ''), end=Date.parse(item.endTime || '')
  const events=(item.events||[]).filter(event=>Number.isFinite(start)&&Date.parse(event.time)>=start&&(!Number.isFinite(end)||Date.parse(event.time)<=end))
  return <>
    <div className="workout-detail-heading"><span className="workout-session-symbol"><Icon/></span><div><span className="workout-eyebrow">{source}{item.sourceDevice?` · ${item.sourceDevice}`:''}</span><DialogTitle>{item.name}</DialogTitle><DialogDescription>{formatDate(item.date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}{item.time?` · ${item.time}`:''} · local workout time</DialogDescription></div></div>
    {item.hasGps===true&&<span className="workout-source-pill">GPS-associated recording</span>}
    {measures.length>0&&<div className="workout-detail-metrics">{measures.map(metric=><div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>}
    {elapsed!==null&&active!==null&&<div className="workout-elapsed"><span><Clock3/>Elapsed <strong>{formatMinutes(elapsed)}</strong></span><span>Active <strong>{formatMinutes(active)}</strong></span>{pause!==null&&pause>0&&<span>Paused <strong>{formatMinutes(pause)}</strong></span>}</div>}
    {series&&<section className="workout-detail-section"><div className="workout-section-heading"><h3>Heart rate through the session</h3><span>{formatNumber(series.min)}–{formatNumber(series.max)} bpm observed</span></div><LineChart values={series.values} labels={series.labels} xValues={series.xValues} color="var(--category-heart)" height={210} compact showRangeLabels showYAxis minYTickStep={20} formatter={value=>`${formatNumber(value)} bpm`} ariaLabel="Workout heart rate by elapsed minutes"/><p className="workout-caption">{series.bucketMinutes}-minute averages · {series.observedBins} of {series.totalBins} intervals contain samples. Gaps are left open; the timeline includes pauses.</p></section>}
    <Zones zones={item.heartZoneMinutes}/>
    <SplitDetails splits={item.splits || []}/>
    {events.length>0&&<section className="workout-detail-section"><div className="workout-section-heading"><h3>Session events</h3><span>Reported by Google</span></div><ol className="workout-events">{events.map((event,i)=><li key={`${event.time}-${i}`}><i/><span>{event.type.toLowerCase().replaceAll('_',' ')}</span><time>{elapsedClock((Date.parse(event.time)-start)/60000)} into session</time></li>)}</ol></section>}
    {item.notes?.trim()&&<section className="workout-detail-section"><div className="workout-section-heading"><h3>Workout notes</h3></div><p className="workout-session-notes">{item.notes}</p></section>}
    <p className="workout-detail-footnote">Only reported metrics are shown. Heart-rate charts use timestamped samples already synced to this device. No data is inferred from missing fields.</p>
  </>
}

export function ActivityView({data}:{data:DashboardData}) {
  const history=useWorkoutHistory(data)
  const items=history.activities
  const [selected,setSelected]=useState<ActivityItem|null>(null)
  const [dateFilter,setDateFilter]=useState<string|null>(null)
  const [typeFilter,setTypeFilter]=useState('all')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState('newest')
  const [compareType,setCompareType]=useState('')
  const [compareMetric,setCompareMetric]=useState<WorkoutMetric>('duration')
  const groups=useMemo(()=>{
    const result=new Map<string,{key:string;name:string;items:ActivityItem[]}>()
    for(const item of items) { const key=workoutGroup(item); if(!result.has(key))result.set(key,{key,name:item.name,items:[]});result.get(key)!.items.push(item) }
    return [...result.values()].sort((a,b)=>b.items.length-a.items.length)
  },[items])
  const comparable=groups.filter(group=>group.items.length>1)
  const comparison=comparable.find(group=>group.key===compareType)||comparable[0]
  const metrics=(['duration','distance','pace','heart'] as WorkoutMetric[]).filter(metric=>(comparison?.items||[]).filter(item=>workoutMetric(item,metric)!==null).length>1)
  const metric=metrics.includes(compareMetric)?compareMetric:metrics[0]
  const comparisonItems=[...(comparison?.items||[])].reverse()
  const comparisonValues=metric?comparisonItems.map(item=>workoutMetric(item,metric)):[]
  const validComparison=comparisonValues.filter(knownNumber), latest=validComparison.at(-1), previous=validComparison.at(-2)
  const change=knownNumber(latest)&&knownNumber(previous)?latest-previous:null
  const sumMinutes=reportedSum(items,workoutMinutes), sumDistance=reportedSum(items,item=>item.distanceKm), sumCalories=reportedSum(items,item=>item.calories)
  const workoutDays=new Set(items.map(item=>item.date)).size
  const timedSessions=items.filter(item=>workoutMinutes(item)!==null).length
  const dates=Array.from({length:28},(_,i)=>offsetDate(history.firstDate,i))
  const byDate=new Map(dates.map(date=>[date,items.filter(item=>item.date===date)]))
  const maxMinutes=Math.max(1,...dates.map(date=>reportedSum(byDate.get(date) || [],workoutMinutes) || 0))
  const startWeekday=(new Date(`${history.firstDate}T12:00:00Z`).getUTCDay()+6)%7
  const filtered=items.filter(item=>(!dateFilter||item.date===dateFilter)&&(typeFilter==='all'||workoutGroup(item)===typeFilter)&&`${item.name} ${item.notes || ''} ${item.date}`.toLowerCase().includes(query.toLowerCase().trim())).sort((a,b)=>sort==='duration'?(workoutMinutes(b)??-1)-(workoutMinutes(a)??-1):`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
  const hasDistance=filtered.some(item=>knownNumber(item.distanceKm)), hasHeart=filtered.some(item=>knownNumber(item.averageHeartRate)&&item.averageHeartRate>0)
  const source=data.source==='demo'?'Illustrative sample data':'Google Health'
  return <div className="page-stack workout-page">
    <section className="workout-hero">
      <div className="workout-hero-top"><div><span className="workout-eyebrow"><Activity size={13}/> FITBIT AIR · WORKOUTS</span><h2>Your training,<br/><em>in focus.</em></h2><p>Every session has a story. See the rhythm behind yours.</p></div><div className="workout-hero-aside"><span className="workout-source-pill">{data.source==='demo'?source:data.device?.lastSyncTime?`Device synced ${relativeTime(data.device.lastSyncTime)}`:'Synced workout history'}</span><span className="workout-range"><CalendarDays/>{formatDate(history.firstDate,{month:'short',day:'numeric'})} — {formatDate(data.selectedDate,{month:'short',day:'numeric',year:'numeric'})}</span><div className="workout-mini-bars" aria-hidden="true">{dates.map(date=>{const day=byDate.get(date)||[],minutes=reportedSum(day,workoutMinutes);return <i key={date} className={day.length?'has-session':''} style={{height:`${day.length?Math.max(9,(minutes || 0)/maxMinutes*62):4}px`}}/>})}</div><small>28 days of recorded training</small></div></div>
      <div className="workout-hero-stats"><div><span>Recorded sessions</span><strong>{items.length}<small>workouts</small></strong></div><div><span>Training time</span><strong>{sumMinutes!==null?formatMinutes(sumMinutes):'—'}</strong>{timedSessions<items.length&&<small className="workout-partial-note">Duration available for {timedSessions} of {items.length} sessions</small>}</div><div><span>Workout days</span><strong>{workoutDays}<small>in this period</small></strong></div></div>
      <div className="workout-hero-footer"><span>{history.loading?'Opening local history…':`${history.coveredDates.size} / 28 days with complete workout coverage`}{history.error?' · Some local history could not be loaded':''}</span><span>{sumDistance!==null?`${formatDecimal(sumDistance)} km recorded`:''}{sumDistance!==null&&sumCalories!==null?' · ':''}{sumCalories!==null?`${formatNumber(sumCalories)} workout kcal`:''}</span></div>
    </section>
    <div className="workout-overview-grid">
      <Panel className="workout-calendar-panel" category="activity"><PanelHeader eyebrow="28-day view" title="A rhythm you can see" icon={ActivityIcon}/><div className="workout-calendar-weekdays">{['M','T','W','T','F','S','S'].map((label,i)=><span key={i}>{label}</span>)}</div><div className="workout-calendar-grid">{Array.from({length:startWeekday},(_,i)=><span key={`pad-${i}`} aria-hidden="true"/>)}{dates.map(date=>{
        const sessions=byDate.get(date)||[], known=history.coveredDates.has(date), minutes=reportedSum(sessions,workoutMinutes)
        const label=`${formatDate(date,{weekday:'long',month:'short',day:'numeric'})}: ${sessions.length?`${sessions.length} ${sessions.length===1?'workout':'workouts'}${minutes!==null?`, ${formatMinutes(minutes)}`:''}`:known?'No recorded workouts':'No complete synced workout coverage'}`
        return <button key={date} aria-label={label} aria-pressed={dateFilter===date} title={label} className={`${sessions.length?'has-session':known?'is-covered':'is-unknown'} ${date===data.selectedDate?'is-selected-day':''} ${dateFilter===date?'is-filtered':''}`} style={sessions.length?{'--session-opacity':.16+(minutes || 0)/maxMinutes*.62} as React.CSSProperties:{}} onClick={()=>setDateFilter(value=>value===date?null:date)}><span>{Number(date.slice(-2))}</span><i>{sessions.length||''}</i></button>
      })}</div><div className="workout-calendar-legend"><span><i className="has-session"/> Workout</span><span><i className="is-covered"/> No workout recorded</span><span><i className="is-unknown"/> Unknown</span></div><p className="workout-caption">Select a day to filter sessions. Training time uses active duration when reported, elapsed time otherwise.</p></Panel>
      <Panel className="workout-mix-panel" category="activity"><PanelHeader eyebrow="Your training mix" title="Room for every kind of effort" icon={ActivityIcon}/>{groups.length?<div className="workout-mix-list">{groups.map(group=>{const Icon=sessionIcon(group.items[0]),minutes=reportedSum(group.items,workoutMinutes);return <button key={group.key} aria-pressed={typeFilter===group.key} onClick={()=>setTypeFilter(value=>value===group.key?'all':group.key)}><span className="workout-mix-icon"><Icon/></span><span className="workout-mix-copy"><strong>{group.name}</strong><span>{group.items.length} sessions{minutes!==null?` · ${formatMinutes(minutes)}`:''}</span>{minutes!==null&&sumMinutes!==null&&sumMinutes>0&&<i><b style={{width:`${minutes/sumMinutes*100}%`}}/></i>}</span><ChevronRight/></button>})}</div>:<div className="workout-quiet-state"><Dumbbell/><h3>A fresh training page.</h3><p>Record a workout with your Fitbit Air, sync it through Google Health, and its available details will appear here.</p></div>}<p className="workout-caption">A breakdown of recorded sessions, not daily steps or general movement.</p></Panel>
    </div>
    {comparison&&metric&&<Panel className="workout-comparison-panel" category="activity"><div className="workout-comparison-head"><PanelHeader eyebrow="Like-for-like sessions" title="Watch your sessions evolve" icon={TrendIcon}/><div><select aria-label="Compare exercise type" value={comparison.key} onChange={event=>setCompareType(event.target.value)}>{comparable.map(group=><option key={group.key} value={group.key}>{group.name}</option>)}</select><select aria-label="Comparison metric" value={metric} onChange={event=>setCompareMetric(event.target.value as WorkoutMetric)}>{metrics.map(value=><option key={value} value={value}>{metricNames[value]}</option>)}</select></div></div><div className="workout-comparison-reading"><strong>{latest!==undefined?formatMetric(latest,metric):''}</strong>{change!==null&&previous!==undefined&&<span>{change===0?<Check/>:change>0?<ArrowUpRight/>:<ArrowDownRight/>}{change===0?'Same as previous recorded session':`${formatMetric(Math.abs(change),metric)} ${change>0?'higher':'lower'} than previous`}</span>}</div><LineChart values={comparisonValues} labels={comparisonItems.map(item=>`${formatDate(item.date,{month:'short',day:'numeric'})} ${item.time}`)} formatter={value=>formatMetric(value,metric)} color="var(--category-activity)" height={190} compact showRangeLabels ariaLabel={`${metricNames[metric]} across ${comparison.name} sessions`}/><p className="workout-caption">{validComparison.length} sessions with this metric. Exercise types are matched; distance, route and effort can still differ. Gaps mean a metric was not reported.</p></Panel>}
    <section className="workout-session-section"><div className="workout-section-title"><div><span className="workout-eyebrow">THE SESSION LOG</span><h2>A closer look at the work.</h2></div><span>{filtered.length} of {items.length} sessions</span></div><div className="workout-session-controls"><label className="workout-search"><Search/><input type="search" aria-label="Search workouts" placeholder="Find a workout or note…" value={query} onChange={event=>setQuery(event.target.value)}/></label><select aria-label="Filter workout type" value={typeFilter} onChange={event=>setTypeFilter(event.target.value)}><option value="all">All workout types</option>{groups.map(group=><option key={group.key} value={group.key}>{group.name}</option>)}</select><select aria-label="Sort workouts" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="duration">Longest first</option></select>{dateFilter&&<button className="workout-filter-chip" onClick={()=>setDateFilter(null)}>{formatDate(dateFilter,{month:'short',day:'numeric'})}<X/></button>}</div>
      <Panel className="workout-session-list" category="activity">{filtered.length?<>{filtered.map(item=>{const Icon=sessionIcon(item),minutes=workoutMinutes(item);return <button className="workout-session-row" key={item.id} onClick={()=>setSelected(item)} aria-label={`Open ${item.name}, ${formatDate(item.date,{month:'short',day:'numeric'})}`}><span className="workout-session-symbol"><Icon/></span><span className="workout-session-copy"><strong>{item.name}</strong><span>{formatDate(item.date,{weekday:'short',month:'short',day:'numeric'})}{item.time?` · ${item.time}`:''}</span></span><span className="workout-row-value"><small>Duration</small><strong>{minutes!==null?formatMinutes(minutes):'—'}</strong></span>{hasDistance&&<span className="workout-row-value optional-distance"><small>Distance</small><strong>{knownNumber(item.distanceKm)?`${formatDecimal(item.distanceKm,2)} km`:'—'}</strong></span>}{hasHeart&&<span className="workout-row-value optional-heart"><small>Avg HR</small><strong>{knownNumber(item.averageHeartRate)&&item.averageHeartRate>0?`${formatNumber(item.averageHeartRate)} bpm`:'—'}</strong></span>}<ChevronRight className="workout-row-arrow"/></button>})}</>:<div className="workout-quiet-state"><Layers3/><h3>{items.length?'No matching sessions.':'Your next workout starts the story.'}</h3><p>{items.length?'Try another date, workout type or search.':'Only recorded workouts appear here. Optional details will arrive when Google provides them.'}</p>{(dateFilter||typeFilter!=='all'||query)&&<button onClick={()=>{setDateFilter(null);setTypeFilter('all');setQuery('')}}>Clear filters</button>}</div>}</Panel>
    </section>
    <p className="workout-page-note"><span>Built around Fitbit Air.</span> Optional workout data appears only when reported. Laps, swimming details and running VO₂ max are not guaranteed for every recording. Cached history may be partial until you refresh Google Health.</p>
    <Dialog open={selected!==null} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent className="workout-dialog">{selected&&<WorkoutDetails item={items.find(item=>item.id===selected.id)||selected} samples={history.samples} source={source}/>}</DialogContent></Dialog>
  </div>
}
