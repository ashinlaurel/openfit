import { APP_TIME_ZONE } from '@/lib/timezone'
import { useMemo, useState } from 'react'
import { ArrowUpRight, ChevronRight, Dumbbell, Layers3, RotateCcw, Target, Trophy, X } from 'lucide-react'
import geometry from '@/data/body-geometry.json'
import catalogue from '@/data/gym-catalogue.json'
import type { GymWorkout, GymSet } from '@/lib/gym-sync'
import { analyzeGymSession } from '@/lib/gym-session-analysis'
import { MUSCLE_LABELS, type MuscleId } from '@/lib/gym-muscles'
import { formatDecimal, formatNumber } from '@/lib/format'

type AnatomyView = { vb: string; p: Record<string, string[]> }
const muscles = Object.keys(MUSCLE_LABELS) as MuscleId[]
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
function setPerformance(set: GymSet) {
  if (set.sides) return Object.entries(set.sides).map(([side, value]) => `${side}: ${value.r ?? '—'} reps${value.done === false ? ' (unfinished)' : ''}`).join(' · ')
  return [set.r !== null ? `${set.r} reps` : null, set.sec !== null ? `${set.sec} sec` : null, set.min !== null ? `${set.min} min` : null, set.speed !== null ? `${set.speed} km/h` : null].filter(Boolean).join(' · ') || '—'
}
function setLoad(set: GymSet, unit: string) {
  if (set.sides) return Object.entries(set.sides).map(([side, value]) => `${side}: ${value.w === null ? '—' : `${formatDecimal(value.w)} ${unit}`}`).join(' · ')
  return set.w === null ? '—' : `${formatDecimal(set.w)} ${unit}`
}
function tickTime(at: number | null | undefined, timezone: string | null) {
  if (!at || !Number.isFinite(at) || at > 8640000000000000) return '—'
  try { return new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: true, minute: '2-digit', second: '2-digit', timeZone: timezone || APP_TIME_ZONE }).format(at) }
  catch { return new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: true, minute: '2-digit', timeZone: APP_TIME_ZONE }).format(at) }
}

export default function GymSessionDetails({ workout, unit, timezone }: { workout: GymWorkout; unit: 'kg' | 'lb'; timezone: string | null }) {
  const [selected, setSelected] = useState<MuscleId | null>(null)
  const [body, setBody] = useState<'male' | 'female'>('male')
  const analysis = useMemo(() => analyzeGymSession(workout, catalogue), [workout])
  const highlighted = analysis.groups.find(group => group.id === selected)
  const visible = selected ? analysis.exercises.filter(row => row.muscles.primary.includes(selected) || row.muscles.secondary.includes(selected)) : analysis.exercises
  const select = (id: MuscleId) => setSelected(current => current === id ? null : id)
  return <div className="gym-rich-details">
    <section className="gym-anatomy-panel" aria-label="Muscles used in this workout">
      <div className="gym-anatomy-heading"><div><span className="gym-section-kicker"><Target size={12}/> THE WORK, MAPPED</span><h4>See where you trained.</h4><p>Select a muscle to explore the exercises behind it.</p></div><label className="gym-body-picker"><span className="sr-only">Body outline</span><select aria-label="Body outline" value={body} onChange={event => setBody(event.target.value as 'male' | 'female')}><option value="male">Outline A</option><option value="female">Outline B</option></select></label></div>
      <div className="gym-anatomy-layout">
        <div className="gym-body-stage"><div className="gym-body-grid" aria-hidden="true"/><div className="gym-body-pair">{(['front', 'back'] as const).map(side => {
          const view: AnatomyView = geometry[body][side]
          return <figure key={side}><svg viewBox={view.vb} role="group" aria-label={`${side === 'front' ? 'Front' : 'Back'} muscle diagram`}>
            {Object.entries(view.p).filter(([id]) => !Object.hasOwn(MUSCLE_LABELS, id)).map(([id, paths]) => <g key={id} className="gym-body-inert">{paths.map((d, index) => <path key={index} d={d}/>)}</g>)}
            {muscles.map(id => {
              const group = analysis.groups.find(row => row.id === id), active = Boolean(group), paths = view.p[id] || []
              const label = `${MUSCLE_LABELS[id]}${group ? `: ${group.primarySets} primary working sets, ${group.secondarySets} supporting sets` : ': not listed in completed work sets'}`
              return paths.length ? <g key={id} className={`gym-body-muscle ${group?.primarySets ? 'is-primary' : active ? 'is-supporting' : ''} ${selected === id ? 'is-selected' : selected && active ? 'is-dimmed' : ''}`} role={active ? 'button' : undefined} tabIndex={active ? 0 : undefined} aria-label={label} aria-pressed={active ? selected === id : undefined} onClick={active ? () => select(id) : undefined} onKeyDown={active ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(id) } } : undefined}><title>{label}</title>{paths.map((d, index) => <path key={index} d={d}/>)}</g> : null
            })}
          </svg><figcaption>{side.toUpperCase()}</figcaption></figure>
        })}</div><div className="gym-body-legend"><span><i className="primary"/>Primary</span><span><i className="supporting"/>Supporting</span><span><i/>Not listed</span></div></div>
        <div className="gym-muscle-reading"><div className="gym-muscle-reading-title"><span>{highlighted ? 'SELECTED MUSCLE' : 'SESSION COVERAGE'}</span>{selected && <button onClick={() => setSelected(null)} aria-label="Clear muscle selection"><X size={14}/></button>}</div>
          <strong className="gym-muscle-headline">{highlighted ? MUSCLE_LABELS[highlighted.id] : analysis.groups.length ? `${analysis.groups.length} muscle groups` : 'Your training canvas'}</strong>
          <p>{highlighted ? `${highlighted.primarySets} primary working sets · ${highlighted.secondarySets} supporting sets` : analysis.groups.length ? 'Primary targets and supporting muscles, from Open Gym’s exercise metadata.' : 'Muscle metadata is not available for these exercises yet. Your recorded sets are shown below.'}</p>
          <div className="gym-muscle-groups">{analysis.groups.map(group => <button key={group.id} className={`${group.primarySets ? 'is-primary' : 'is-supporting'} ${selected === group.id ? 'is-selected' : ''}`} aria-pressed={selected === group.id} onClick={() => select(group.id)}><span><i/>{MUSCLE_LABELS[group.id]}</span><span>{group.primarySets ? `${group.primarySets} primary` : `${group.secondarySets} supporting`}<ChevronRight size={12}/></span></button>)}</div>
          {selected && <button className="gym-clear-muscle" onClick={() => setSelected(null)}><RotateCcw size={12}/> Show all exercises</button>}
          <p className="gym-anatomy-note">{analysis.unmappedExercises > 0 ? `${analysis.unmappedExercises} exercise${analysis.unmappedExercises === 1 ? ' has' : 's have'} no muscle metadata. ` : ''}Exercise involvement, not measured activation. Warm-ups are excluded; one set can involve several muscles.</p>
        </div>
      </div>
    </section>
    <div className="gym-detail-stats"><div><Layers3 size={14}/><strong>{analysis.workSets}</strong><span>Working sets</span></div><div><Dumbbell size={14}/><strong>{analysis.warmupSets}</strong><span>Warm-up sets</span></div><div><Target size={14}/><strong>{analysis.groups.length}</strong><span>Muscle groups</span></div>{validNumber(workout.bodyWeight) && workout.bodyWeight > 0 && <div><strong>{formatNumber(workout.bodyWeight)} <small>{unit}</small></strong><span>Logged body weight</span></div>}</div>
    <section className="gym-exercise-breakdown"><div className="gym-breakdown-heading"><div><span className="gym-section-kicker">EXERCISE BREAKDOWN</span><h4>{selected ? `${MUSCLE_LABELS[selected]} in this session` : 'Every set tells the story.'}</h4></div><span>{visible.length} exercise{visible.length === 1 ? '' : 's'}</span></div>
      {visible.map(({ entry, index, muscles: info, work, warmups, completed }) => {
        const target = entry.target || {}, isPr = workout.prs.includes(entry.id), hasTicks = completed.some(set => Boolean(set.at))
        const prescription = [validNumber(target.sets) ? `${target.sets} sets` : null, validNumber(target.reps) ? `${validNumber(target.repsMin) && target.repsMin !== target.reps ? `${target.repsMin}–` : ''}${target.reps} reps` : null, validNumber(target.sec) ? `${target.sec} sec` : null].filter(Boolean).join(' · ')
        return <article className="gym-exercise-detail" key={`${entry.id}:${index}`}><div className="gym-exercise-detail-head"><span className="gym-exercise-number">{String(index + 1).padStart(2, '0')}</span><div><h5>{entry.name}{isPr && <span className="gym-pr-badge"><Trophy size={11}/> PR</span>}</h5><p>{[info.equipment, info.bodyPart, info.category].filter(Boolean).join(' · ') || `${entry.mode === 'cardio' ? 'Cardio' : entry.mode === 'time' ? 'Timed exercise' : 'Resistance training'}`}{entry.superset ? ` · Superset ${entry.superset}` : ''}</p></div><span className="gym-exercise-set-count">{work.length} work{warmups.length ? ` + ${warmups.length} warm-up` : ''}</span></div>
          {(info.primary.length > 0 || info.secondary.length > 0) && <div className="gym-exercise-muscles">{info.primary.map(id => <button key={id} className="is-primary" onClick={() => select(id)}>{MUSCLE_LABELS[id]}</button>)}{info.secondary.map(id => <button key={id} className="is-supporting" onClick={() => select(id)}>{MUSCLE_LABELS[id]}<span>support</span></button>)}</div>}
          {prescription && <p className="gym-prescription"><Target size={12}/> Logged target: {prescription}</p>}
          <div className="gym-set-table-scroll"><table className="gym-set-table"><caption className="sr-only">Recorded sets for {entry.name}</caption><thead><tr><th>Set</th><th>Load</th><th>Performance</th><th>Effort</th>{hasTicks && <th>Ticked at</th>}</tr></thead><tbody>{completed.map((set, row) => <tr key={row} className={set.warmup ? 'is-warmup' : ''}><th>{row + 1}{set.warmup && <small>Warm-up</small>}{set.type === 'dropset' && <small>Drop set</small>}{set.type === 'restpause' && <small>Rest-pause</small>}</th><td>{setLoad(set, unit)}{set.drops?.map((drop, i) => <small key={i}><ArrowUpRight size={10}/> {drop.w === null ? '—' : `${formatDecimal(drop.w)} ${unit}`} × {drop.r ?? '—'} reps</small>)}</td><td>{setPerformance(set)}{Boolean(set.clusters?.length) && <small>Bursts: {set.clusters!.map(cluster => `${cluster.r ?? '—'} reps${cluster.restSec !== null ? ` / ${cluster.restSec}s rest` : ''}`).join(' · ')}</small>}</td><td>{[set.rir !== null ? `RIR ${set.rir}` : null, set.rpe !== null ? `RPE ${set.rpe}` : null, set.failure ? 'To failure' : null].filter(Boolean).join(' · ') || '—'}</td>{hasTicks && <td>{tickTime(set.at, timezone)}</td>}</tr>)}</tbody></table></div>
          {entry.note && <p className="gym-exercise-note">{entry.note}</p>}
        </article>
      })}
    </section>
    {workout.note && <section className="gym-session-note"><span className="gym-section-kicker">SESSION NOTES</span><p>{workout.note}</p></section>}
  </div>
}
