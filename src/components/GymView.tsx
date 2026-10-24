import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarDays, Check, ArrowLeft, ArrowUpRight, Clock3, Dumbbell, Heart, Link2, RefreshCw, Trophy, Flame, Layers3 } from 'lucide-react'
import type { ActivityItem, CloudStatus, DashboardData } from '@/types'
import { Button } from '@/components/ui/button'
import { Panel, PanelHeader } from './Shared'
import { ActivityIcon } from './icons'
import { LineChart } from './Charts'
import { formatClockLabel, formatDate, formatMinutes, formatNumber, relativeTime } from '@/lib/format'
import { completedGymSets, gymWindow, linkGymWorkouts, manualHealthChoices, type LinkedGymSession, type WorkoutLinkInput } from '@/lib/gym-sync'
import { useGymProfile } from '@/lib/use-gym-profile'
import { useWorkoutHistory } from '@/lib/use-workout-history'
import { workoutClock, workoutHeartSeries } from '@/lib/workouts'

const GymSessionDetails = lazy(() => import('./GymSessionDetails'))

const positive = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
function clockRange(start: number | null, end: number | null, timezone: string | null) {
  if (!positive(start)) return ''
  const first = formatClockLabel(workoutClock(new Date(start).toISOString(), timezone).time)
  return first + (positive(end) && end > start ? `–${formatClockLabel(workoutClock(new Date(end).toISOString(), timezone).time)}` : '')
}
const statuses = {
  automatic: 'Matched by time', manual: 'Linked by you', ambiguous: 'Review possible matches',
  unmatched: 'Awaiting a matching recording', unlinked: 'Standalone session', 'missing-time': 'Session time unavailable', 'missing-record': 'Saved recording unavailable',
}

export function GymSessionCard({ session, unit, timezone, activities, samples, decision, onLink, saving }: {
  session: LinkedGymSession; unit: 'kg' | 'lb'; timezone: string | null; activities: ActivityItem[]
  samples: Array<{ timestamp: string; value: number }>; decision: string | null | undefined
  onLink: (input: WorkoutLinkInput) => void; saving: boolean
}) {
  const [highlightedExercise, setHighlightedExercise] = useState<number | null>(null)
  const { gym, health } = session
  const span = gymWindow(gym), sets = gym.entries.flatMap(completedGymSets)
  const choices = manualHealthChoices(gym, activities)
  if (health && !choices.some(row => row.id === health.id)) choices.unshift(health)
  const series = useMemo(() => span ? workoutHeartSeries({ startTime: new Date(span.start).toISOString(), endTime: new Date(span.end).toISOString() }, samples) : null, [gym.start, gym.end, samples])
  const exerciseColors = ['#d5b47b','#8dbdaf','#aca5d3','#d494a6','#7eafd0','#b7bd81']
  const timedExercises = gym.entries.map((entry,index) => ({ name:entry.name, index, color:exerciseColors[index % exerciseColors.length], times:completedGymSets(entry).map((set,setIndex) => ({ at:set.at, set:setIndex+1 })).filter((set): set is {at:number;set:number} => typeof set.at === 'number' && Number.isFinite(set.at) && Boolean(span && set.at >= span.start && set.at <= span.end)) })).filter(entry => entry.times.length)
  const markers = span ? timedExercises.filter(entry => highlightedExercise === null || entry.index === highlightedExercise).flatMap(entry => entry.times.map(set => ({ x:(set.at-span.start)/60000, color:entry.color, label:`${entry.name} · Set ${set.set} · ${formatClockLabel(workoutClock(new Date(set.at).toISOString(),timezone).time)}` }))) : []
  const linked = session.status === 'automatic' || session.status === 'manual'
  return <article className="gym-workout-card">
    <div className="gym-session-top"><div className="gym-workout-heading">
      <span><CalendarDays size={14}/>{gym.date ? formatDate(gym.date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date not recorded'}{span && <><Clock3 size={14}/>{clockRange(gym.start, gym.end, timezone)}</>}</span>
      <h2>{gym.name}</h2>
    </div><span className={`gym-match-status ${linked ? 'is-linked' : ''}`}>{linked ? <Link2 size={13}/> : <Activity size={13}/>}{statuses[session.status]}</span></div>
    <section className="gym-session-hero" aria-label="Session highlights">
      <div className="gym-hero-stats">
        <div className="gym-hero-stat"><span className="gym-hero-stat-label"><Clock3 size={15}/> Duration</span><strong>{span ? formatMinutes((span.end-span.start)/60000) : '—'}</strong><small>Time in session</small></div>
        <div className="gym-hero-stat is-energy"><span className="gym-hero-stat-label"><Flame size={15}/> Calories</span><strong>{health?.calories != null ? formatNumber(health.calories) : '—'}<em>kcal</em></strong><small>Energy burned</small></div>
        <div className="gym-hero-stat is-heart"><span className="gym-hero-stat-label"><Heart size={15}/> Average heart rate</span><strong>{positive(health?.averageHeartRate) ? formatNumber(health.averageHeartRate) : '—'}<em>bpm</em></strong><small>Across your recording</small></div>
        <div className="gym-hero-stat"><span className="gym-hero-stat-label"><Dumbbell size={15}/> Volume</span><strong>{gym.volume !== null ? formatNumber(gym.volume) : '—'}<em>{unit}·reps</em></strong><small>Total recorded load</small></div>
      </div>
      <div className="gym-hero-summary"><span><Dumbbell size={14}/><strong>{gym.entries.length}</strong> exercises</span><span><Layers3 size={14}/><strong>{sets.length}</strong> recorded sets</span>{health?.zoneMinutes != null && <span><Activity size={14}/><strong>{formatNumber(health.zoneMinutes)}</strong> zone min</span>}{gym.prs.length > 0 && <span className="gym-hero-record"><Trophy size={14}/><strong>{gym.prs.length}</strong> personal record{gym.prs.length === 1 ? '' : 's'}</span>}</div>
    </section>
    <section className="gym-heart-section gym-session-timeline" aria-label="Heart rate and exercise timeline">
      <div className="gym-timeline-heading"><div><span className="gym-section-kicker">SESSION TIMELINE</span><h3>Your effort, set by set.</h3></div>{series && <span>{series.min}–{series.max} <small>bpm</small></span>}</div>
      {series && span ? <>
        <LineChart values={series.values} labels={series.xValues.map(minutes => formatClockLabel(workoutClock(new Date(span.start+minutes*60000).toISOString(),timezone).time))} xValues={series.xValues} xDomain={[0,(span.end-span.start)/60000]} markers={markers} color="var(--category-heart)" height={280} formatter={value => `${formatNumber(value)} bpm`} ariaLabel={`Heart rate and recorded exercise sets during ${gym.name}`}/>
        {timedExercises.length > 0 ? <><div className="gym-timeline-legend" aria-label="Highlight an exercise"><button className={highlightedExercise === null ? 'is-active' : ''} aria-pressed={highlightedExercise === null} onClick={() => setHighlightedExercise(null)}>All exercises</button>{timedExercises.map(entry => <button key={entry.index} className={highlightedExercise === entry.index ? 'is-active' : ''} aria-pressed={highlightedExercise === entry.index} onClick={() => setHighlightedExercise(current => current === entry.index ? null : entry.index)}><i style={{background:entry.color}}/>{entry.name}<small>{entry.times.length} sets</small></button>)}</div><p className="workout-caption">Dots mark when sets were logged, not exercise start or end times. {gym.entries.length-timedExercises.length > 0 ? `${gym.entries.length-timedExercises.length} exercises have no set timestamps in this session.` : 'Select an exercise to highlight its sets.'}</p></> : <p className="workout-caption">No set timestamps were recorded for this session, so exercise markers are unavailable.</p>}
      </> : <p className="workout-caption">Heart-rate samples for this session are not available yet.</p>}
    </section>
    <div className="gym-session-details">
      <Suspense fallback={<p role="status" className="workout-caption">Loading session details…</p>}><GymSessionDetails workout={gym} unit={unit} timezone={timezone}/></Suspense>
    </div>
    <div className="gym-link-controls"><label><Link2 size={13}/><span className="sr-only">Google Health recording for {gym.name}</span><select aria-label={`Google Health recording for ${gym.name}`} disabled={saving} value={decision === null ? 'none' : typeof decision === 'string' ? `record:${decision}` : 'auto'} onChange={event => {
      const value = event.target.value
      onLink({ gymId: gym.id, mode: value === 'auto' ? 'auto' : value === 'none' ? 'unlink' : 'link', ...(value.startsWith('record:') ? { healthId: value.slice(7) } : {}) })
    }}><option value="auto">Match automatically</option><option value="none">Keep this session separate</option>{typeof decision === 'string' && !choices.some(row => row.id === decision) && <option value={`record:${decision}`}>Saved recording unavailable</option>}{choices.map(row => <option value={`record:${row.id}`} key={row.id}>{row.name} · {row.date} {formatClockLabel(row.time)}</option>)}</select></label>
    </div>
  </article>
}

function GymSessionTile({ session, timezone, onOpen, tileRef }: {
  session: LinkedGymSession; timezone: string | null; onOpen: () => void; tileRef: (node: HTMLButtonElement | null) => void
}) {
  const { gym, health } = session
  const span = gymWindow(gym), sets = gym.entries.flatMap(completedGymSets)
  return <button ref={tileRef} type="button" className="gym-session-tile" onClick={onOpen} aria-label={`Open ${gym.name}, ${gym.date}`}>
    <span className="gym-tile-date"><CalendarDays size={13}/>{gym.date ? formatDate(gym.date, { weekday:'short', month:'short', day:'numeric' }) : 'Undated session'}<ArrowUpRight className="gym-tile-arrow" size={18}/></span>
    <span className="gym-tile-title">{gym.name}</span>
    <span className="gym-tile-time">{span ? clockRange(gym.start, gym.end, timezone) : 'Time not recorded'} · IST</span>
    <span className="gym-tile-stats"><span><strong>{span ? formatMinutes((span.end-span.start)/60000) : '—'}</strong><small>Duration</small></span><span><strong>{gym.entries.length}</strong><small>Exercises</small></span><span><strong>{sets.length}</strong><small>Sets</small></span></span>
    <span className="gym-tile-health">{health ? <><Heart size={14}/><span>{positive(health.averageHeartRate) ? `${formatNumber(health.averageHeartRate)} bpm` : 'Health recording linked'}{health.calories !== null ? ` · ${formatNumber(health.calories)} kcal` : ''}</span></> : <><Activity size={14}/><span>{statuses[session.status]}</span></>}</span>
    <span className="gym-tile-footer"><span><Dumbbell size={12}/> Open Gym{health && <><span className="gym-tile-source-plus">+</span><Heart size={12}/> Health</>}</span>{gym.prs.length > 0 ? <span className="gym-tile-pr"><Trophy size={12}/>{gym.prs.length} PR{gym.prs.length === 1 ? '' : 's'}</span> : <span>View session</span>}</span>
  </button>
}

export function GymView({ data, cloudStatus, onConnect, onSyncHealth, healthConnected, healthSyncing }: {
  data: DashboardData; cloudStatus: CloudStatus; onConnect: () => void; onSyncHealth: () => Promise<void>; healthConnected: boolean; healthSyncing: boolean
}) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())
  const backRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<{ id: string; scroll: number } | null>(null)
  const gym = useGymProfile(cloudStatus, refreshKey)
  const history = useWorkoutHistory(data, true)
  const activities = data.source === 'demo' ? [] : history.activities
  const samples = data.source === 'demo' ? [] : history.samples
  const workouts = gym.profile.workouts.filter(row => row.date >= history.firstDate && row.date <= data.selectedDate).sort((a, b) => (b.start || 0) - (a.start || 0) || b.date.localeCompare(a.date))
  const sessions = linkGymWorkouts(workouts, activities, gym.links)
  const linked = sessions.filter(s => s.health).length
  const selected = sessions.find(session => session.gym.id === selectedId)
  useLayoutEffect(() => {
    if (selectedId) { window.scrollTo({ top:0, behavior:'instant' }); backRef.current?.focus({ preventScroll:true }) }
    else if (returnTo.current) { window.scrollTo({ top:returnTo.current.scroll, behavior:'instant' }); tileRefs.current.get(returnTo.current.id)?.focus({ preventScroll:true }) }
  }, [selectedId])
  const refresh = () => { setRefreshKey(value => value + 1); if (healthConnected) void onSyncHealth() }
  if (selected) return <div className="page-stack gym-session-page">
    <nav className="gym-session-navigation" aria-label="Gym navigation"><Button ref={backRef} variant="ghost" onClick={() => setSelectedId(null)}><ArrowLeft size={16}/> All sessions</Button><span>Gym / Session details</span><Button variant="outline" onClick={refresh} disabled={gym.refreshing || healthSyncing}><RefreshCw className={gym.refreshing || healthSyncing ? 'spin' : ''}/> Sync sources</Button></nav>
    {gym.error && <p className="gym-sync-notice" role="alert">{gym.error}</p>}
    <GymSessionCard key={selected.gym.id} session={selected} unit={gym.profile.unit} timezone={data.profile.timezone} activities={activities} samples={samples} decision={Object.hasOwn(gym.links, selected.gym.id) ? gym.links[selected.gym.id] : undefined} saving={gym.saving} onLink={input => void gym.saveLink(input)}/>
  </div>
  return <div className="page-stack gym-overview">
    <section className="section-title"><div><h2>Your gym sessions</h2><p>Exercises from Open Gym. Fitbit recordings from Google Health.</p></div><Button variant="outline" onClick={refresh} disabled={gym.refreshing || healthSyncing || !cloudStatus.configured}><RefreshCw className={gym.refreshing || healthSyncing ? 'spin' : ''}/> Sync sources</Button></section>
    {!cloudStatus.configured ? <Panel category="activity"><div className="workout-quiet-state"><Dumbbell/><h3>Connect your Open Gym profile</h3><p>Your phone already syncs to the VM. Pair OpenFit with the same profile to bring your training log here.</p><Button onClick={onConnect}>Connect Open Gym</Button></div></Panel> : <>
      <div className="gym-sync-summary"><span><Check size={14}/>{cloudStatus.user?.name || 'Open Gym'} connected</span><span>{workouts.length} sessions · {linked} linked to Google Health</span><span>{formatDate(history.firstDate, { month: 'short', day: 'numeric' })}–{formatDate(data.selectedDate, { month: 'short', day: 'numeric' })}</span></div>
      {gym.error && <p className="gym-sync-notice" role="alert">{gym.error}</p>}
      {gym.snapshot?.fromCache && <p className="gym-sync-notice" role="status">Showing the encrypted local copy. {gym.snapshot.syncError}</p>}
      {history.error && <p className="gym-sync-notice" role="status">Some cached Google Health history could not be read. Refresh the sources to retry.</p>}
      {!healthConnected && <p className="gym-sync-notice">Google Health is disconnected. Cached recordings can still match; <button onClick={onConnect}>connect it in Settings</button> for fresh data.</p>}
      <Panel category="activity"><PanelHeader eyebrow="OPEN GYM + GOOGLE HEALTH" title="Choose a session" icon={ActivityIcon}/>
        {gym.loading && !gym.snapshot ? <p role="status">Loading your Open Gym profile…</p> : sessions.length ? <div className="gym-session-grid">{sessions.map(session => <GymSessionTile key={session.gym.id} session={session} timezone={data.profile.timezone} tileRef={node => { if (node) tileRefs.current.set(session.gym.id,node); else tileRefs.current.delete(session.gym.id) }} onOpen={() => { returnTo.current = { id:session.gym.id, scroll:window.scrollY }; setSelectedId(session.gym.id) }}/>)}</div> : !gym.error && <div className="workout-quiet-state"><Activity/><h3>{gym.profile.workouts.length ? 'No gym sessions in this period' : 'No completed Open Gym sessions yet'}</h3><p>{gym.profile.workouts.length ? 'Choose an earlier date to explore older training.' : 'Finish a workout in the mobile app and let it sync. It will appear here automatically.'}</p></div>}
        {gym.snapshot && <p className="workout-caption">Open Gym {gym.snapshot.syncedAt ? `updated ${relativeTime(gym.snapshot.syncedAt)}` : 'connected'}. Google Health recordings are matched locally; your original exercise log and health recording remain distinct.</p>}
      </Panel>
      <p className="workout-page-note">Clear time overlaps link automatically, one recording per session. Review uncertain matches or keep them separate. Unlinked Fitbit workouts remain available in Activity.</p>
    </>}
  </div>
}
