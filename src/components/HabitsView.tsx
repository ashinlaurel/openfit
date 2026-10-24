import { APP_TIME_ZONE } from '@/lib/timezone'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Activity, Archive, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, Flame, Leaf, MoreHorizontal, Moon, Pencil, Plus, Search, Sparkles, Sun, Target, Trophy, Waves, Zap, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { localIso } from '@/data/demo'
import { dayProgress, habitStats, isScheduled, shiftDay } from '@/lib/habits'
import type { useHabits } from '@/lib/use-habits'
import type { Habit, HabitColor, HabitFields, HabitIcon } from '@/types'

const icons = { spark: Sparkles, book: BookOpen, move: Activity, water: Waves, moon: Moon, mind: Brain, sun: Sun, leaf: Leaf }
const colors: HabitColor[] = ['mint','blue','violet','amber','rose']
const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const allDays=[0,1,2,3,4,5,6]
const initial: HabitFields={title:'',note:'',icon:'spark',color:'mint',days:allDays}
const templates: HabitFields[]=[
  {title:'Read a little',note:'Ten pages. One new perspective.',icon:'book',color:'violet',days:allDays},
  {title:'Move your body',note:'A walk, a stretch, a little momentum.',icon:'move',color:'mint',days:[1,2,3,4,5]},
  {title:'Make space to breathe',note:'Five quiet minutes, just for you.',icon:'mind',color:'blue',days:allDays},
  {title:'Wind down early',note:'Less scrolling. A softer landing.',icon:'moon',color:'amber',days:allDays},
]
const labelDate=(date:string,options:Intl.DateTimeFormatOptions)=>new Date(`${date}T12:00:00`).toLocaleDateString(undefined,options)
function HabitGlyph({icon}:{icon:HabitIcon}) { const Icon=icons[icon]; return <Icon aria-hidden="true" /> }

export function HabitsView({ habits:state, createRequest }: {habits:ReturnType<typeof useHabits>;createRequest:number}) {
  const [today,setToday]=useState(localIso())
  const [date,setDate]=useState(today)
  const previousToday=useRef(today)
  useEffect(()=>{const previous=previousToday.current;setDate(current=>current===previous?today:current);previousToday.current=today},[today])
  const [filter,setFilter]=useState<'today'|'all'|'archived'>('today')
  const [query,setQuery]=useState('')
  const [editing,setEditing]=useState<Habit|'new'|null>(null)
  const [draft,setDraft]=useState<HabitFields>(initial)
  const [detailId,setDetailId]=useState<string|null>(null)
  const searchRef=useRef<HTMLInputElement>(null)
  const {store,loading,busy,error,perform}=state
  const active=store.habits.filter(h=>!h.archived)
  const stats=useMemo(()=>new Map(store.habits.map(h=>[h.id,habitStats(h,today)])),[store,today])
  const progress=dayProgress(store.habits,date)
  const detail=store.habits.find(h=>h.id===detailId)
  const shown=store.habits.filter(h=>(filter==='archived'?h.archived:!h.archived&&(filter==='all'||isScheduled(h,date)))&&`${h.title} ${h.note}`.toLowerCase().includes(query.toLowerCase()))
  const week=Array.from({length:7},(_,i)=>shiftDay(date,i-6))
  const heatmap=Array.from({length:84},(_,i)=>shiftDay(today,i-83))
  const total=store.habits.reduce((sum,h)=>sum+Object.keys(h.checkins).length,0)
  const strongest=Math.max(0,...active.map(h=>stats.get(h.id)?.current??0))
  const last28=Array.from({length:28},(_,i)=>dayProgress(store.habits,shiftDay(today,-i)))
  const opportunities=last28.reduce((s,p)=>s+p.due,0), completions=last28.reduce((s,p)=>s+p.done,0)
  const consistency=opportunities?Math.round(completions/opportunities*100):null
  const openEditor=(habit:Habit|'new',template?:HabitFields)=>{setDraft(template??(habit==='new'?initial:{title:habit.title,note:habit.note,color:habit.color,icon:habit.icon,days:habit.days}));setEditing(habit)}
  useEffect(()=>{if(createRequest){setDraft(initial);setEditing('new')}},[createRequest])
  useEffect(()=>{
    const refresh=()=>setToday(localIso())
    const timer=window.setInterval(refresh,60000)
    window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[])
  useEffect(()=>{
    const shortcut=(event:KeyboardEvent)=>{
      if(editing||detailId||event.metaKey||event.ctrlKey||event.altKey||event.target instanceof HTMLElement&&(event.target.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)))return
      if(event.key==='n'){event.preventDefault();setDraft(initial);setEditing('new')}
      if(event.key==='/'){event.preventDefault();searchRef.current?.focus()}
    }
    window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut)
  },[editing,detailId])
  const save=async(event:FormEvent)=>{event.preventDefault();if(await perform({type:editing==='new'?'create':'update',id:editing==='new'?undefined:editing?.id,habit:draft})){setEditing(null);setFilter('all')}}

  return <div className="habits-page page-stack">
    <section className="habit-hero" aria-label="Habit overview">
      <div className="habit-hero-orbit" aria-hidden="true" />
      <div className="habit-hero-copy"><span className="habit-eyebrow"><i /> THE ART OF SHOWING UP</span><h2>Small steps.<br /><em>Extraordinary you.</em></h2><p>Build a rhythm that feels like yours.<br />One intentional day at a time.</p><Button className="habit-create" onClick={()=>openEditor('new')} disabled={loading||busy}><Plus /> New habit <kbd>N</kbd></Button></div>
      <div className="habit-orbit-area"><div className={`habit-daily-ring ${progress.due>0&&progress.done===progress.due?'is-complete':''}`}>
        <svg viewBox="0 0 180 180" aria-hidden="true"><circle className="habit-ring-track" cx="90" cy="90" r="76"/><circle className="habit-ring-fill" cx="90" cy="90" r="76" strokeDasharray={2*Math.PI*76} strokeDashoffset={2*Math.PI*76*(1-progress.rate/100)}/></svg>
        <div><span>{date===today?"TODAY’S RHYTHM":'DAILY RHYTHM'}</span><strong>{progress.done}<small>/{progress.due}</small></strong><p>{!progress.due?'A little room to begin':progress.done===progress.due?'Beautifully done.':'Keep showing up.'}</p></div>
      </div><span className="habit-orbit-caption"><Sparkles /> Progress, not perfection.</span></div>
      <div className="habit-hero-stats"><div><span className="habit-stat-icon"><Flame /></span><div><small>STRONGEST ACTIVE STREAK</small><strong>{strongest}<span> scheduled days</span></strong></div></div><div><span className="habit-stat-icon"><Target /></span><div><small>28-DAY CONSISTENCY</small><strong>{consistency===null?'—':`${consistency}%`}<span>{opportunities?' of scheduled check-ins':' your story starts here'}</span></strong></div></div><div><span className="habit-stat-icon"><Zap /></span><div><small>MOMENTS OF MOMENTUM</small><strong>{total}<span> lifetime check-ins</span></strong></div></div></div>
    </section>

    {error&&<div className="todo-error" role="alert">{error}<div><Button variant="outline" onClick={()=>void state.reload()}>Retry</Button><Button variant="outline" onClick={()=>void perform('recover')} disabled={busy}>Recover backup</Button></div></div>}

    <div className="habit-body-grid"><section className="habit-main">
      <div className="habit-section-heading"><div><span className="habit-eyebrow">A LITTLE BETTER, EVERY DAY</span><h3>Your rituals <span>{active.length}</span></h3></div><div className="habit-date-nav"><button aria-label="Previous habit day" onClick={()=>setDate(shiftDay(date,-1))}><ArrowLeft /></button><label>{date===today?'Today':labelDate(date,{month:'short',day:'numeric'})}<input type="date" aria-label="Habit check-in date" value={date} max={today} onChange={e=>{if(e.target.value&&e.target.value<=today)setDate(e.target.value)}} /></label><button aria-label="Next habit day" disabled={date>=today} onClick={()=>setDate(shiftDay(date,1))}><ArrowRight /></button>{date!==today&&<button className="habit-back-today" onClick={()=>setDate(today)}>Today</button>}</div></div>
      <div className="habit-toolbar"><div className="habit-tabs">{(['today','all','archived'] as const).map(tab=><button key={tab} aria-pressed={filter===tab} onClick={()=>setFilter(tab)}>{tab==='today'?'Scheduled':tab==='all'?'All habits':'Archived'}</button>)}</div><label className="habit-search"><Search /><input ref={searchRef} aria-label="Search habits" placeholder="Find a ritual…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="habit-cards" aria-busy={loading||busy}>
        {loading&&<p role="status" className="habit-empty">Opening your local rituals…</p>}
        {!loading&&!shown.length&&<div className="habit-empty"><span className="habit-empty-mark"><Leaf /></span><h4>{query?'A fresh search?':filter==='archived'?'Nothing on pause.':active.length?'A lighter day.':'Every rhythm starts with one.'}</h4><p>{query?'Try a different habit name.':active.length?'No habits scheduled here. Enjoy the space, or explore all your rituals.':'Choose something small enough to start, meaningful enough to keep.'}</p>{!query&&filter!=='archived'&&<Button variant="outline" onClick={()=>openEditor('new')}><Plus /> Create a ritual</Button>}</div>}
        {shown.map(habit=>{
          const s=stats.get(habit.id)!, done=Boolean(habit.checkins[date]), scheduled=isScheduled(habit,date)
          return <article key={habit.id} className={`habit-card habit-color-${habit.color} ${done?'is-checked':''}`}>
            <div className="habit-card-top"><span className="habit-glyph"><HabitGlyph icon={habit.icon}/></span><div className="habit-card-copy"><button className="habit-title" onClick={()=>setDetailId(habit.id)}>{habit.title}</button><p>{habit.note||'A small promise to yourself.'}</p></div><div className="habit-card-menu"><button aria-label={`Edit ${habit.title}`} disabled={busy||habit.archived} onClick={()=>openEditor(habit)}><Pencil /></button><button aria-label={`${habit.archived?'Reactivate':'Archive'} ${habit.title}`} disabled={busy} onClick={()=>void perform({type:habit.archived?'restore':'archive',id:habit.id})}>{habit.archived?<ArrowLeft/>:<Archive/>}</button></div></div>
            <div className="habit-card-middle"><span className={`habit-streak ${s.current?'has-streak':''}`}><Flame />{s.current} <small>day streak</small></span><span className="habit-schedule">{habit.days.length===7?'Every day':habit.days.map(d=>weekdays[d]).join(' · ')}</span><button className="habit-checkin" aria-label={`${done?'Undo':'Check in'} ${habit.title} for ${date}`} aria-pressed={done} disabled={busy||!scheduled||habit.archived||date>today} onClick={()=>void perform({type:'checkin',id:habit.id,date})}>{habit.archived?'Paused':done?<><Check /> Done</>:scheduled?<><Plus /> Check in</>:'Rest day'}</button></div>
            <div className="habit-card-week">{week.map(day=>{
              const due=isScheduled(habit,day), checked=Boolean(habit.checkins[day])
              return <button key={day} className={`habit-week-day ${checked?'is-done':''} ${day===date?'is-selected':''} ${!due?'is-rest':''}`} aria-label={`${habit.title}, ${labelDate(day,{weekday:'long',month:'short',day:'numeric'})}: ${checked?'completed':due?'not checked in':'not scheduled'}`} aria-pressed={checked} disabled={busy||!due||habit.archived} onClick={()=>void perform({type:'checkin',id:habit.id,date:day})}><span>{labelDate(day,{weekday:'narrow'})}</span><i>{checked?<Check/>:due?labelDate(day,{day:'numeric'}):'·'}</i></button>
            })}<button className="habit-detail-link" aria-label={`View ${habit.title} history`} onClick={()=>setDetailId(habit.id)}><MoreHorizontal/></button></div>
          </article>
        })}
      </div>
      {!active.length&&filter!=='archived'&&!query&&!loading&&<div className="habit-starters"><span className="habit-eyebrow">BORROW A LITTLE INSPIRATION</span><div>{templates.map(template=><button key={template.title} className={`habit-color-${template.color}`} onClick={()=>openEditor('new',template)}><span className="habit-glyph"><HabitGlyph icon={template.icon}/></span><span>{template.title}<small>{template.days.length===7?'Every day':'Weekdays'}</small></span><Plus/></button>)}</div></div>}
    </section>

    <aside className="habit-insights">
      <section className="habit-garden"><div className="habit-panel-heading"><span><Sparkles /> Your consistency garden</span><small>12 WEEKS</small></div><div className="habit-heatmap" aria-label="Daily habit completion over the last 84 days">{heatmap.map(day=>{
        const p=dayProgress(store.habits,day), level=p.done===0?0:p.rate<50?1:p.rate<100?2:3
        return <button key={day} data-level={level} aria-label={`${labelDate(day,{month:'long',day:'numeric'})}: ${p.done} of ${p.due} scheduled habits completed`} title={`${day} · ${p.done}/${p.due} check-ins`} onClick={()=>{setDate(day);setFilter('today')}}/>
      })}</div><div className="habit-heatmap-legend"><span>{labelDate(heatmap[0],{month:'short',day:'numeric'})} — {labelDate(today,{month:'short',day:'numeric'})}</span><span>Less <i/><i/><i/><i/> More</span></div><p>Every little square is a day you made space for yourself.</p></section>
      <section className="habit-week-summary"><div className="habit-panel-heading"><span><Activity /> The last seven days</span></div><div className="habit-week-bars">{Array.from({length:7},(_,i)=>shiftDay(today,i-6)).map(day=>{const p=dayProgress(store.habits,day);return <div key={day}><strong>{p.due?`${p.rate}%`:'—'}</strong><div className="habit-bar-track"><i style={{height:`${p.rate}%`}}/></div><span>{labelDate(day,{weekday:'narrow'})}</span></div>})}</div><p>{completions} completed of {opportunities} scheduled check-ins in the last 28 days.</p></section>
      <section className="habit-milestones"><div className="habit-panel-heading"><span><Trophy /> Little milestones</span></div>{[7,30,100].map(goal=>{const best=Math.max(0,...store.habits.map(h=>stats.get(h.id)?.best??0));const achieved=best>=goal;return <div key={goal} className={achieved?'is-earned':''}><span className="habit-milestone-medal">{achieved?<Check/>:<Flame/>}</span><div><strong>{goal===7?'Finding your rhythm':goal===30?'A beautiful routine':'Part of who you are'}</strong><small>{goal} scheduled-day streak</small></div><span>{achieved?'Earned':`${Math.min(best,goal)}/${goal}`}</span></div>})}</section>
      <div className="habit-quiet-note"><Leaf /><p>“You don’t have to be perfect.<br />Just keep coming back.”</p><small>A NOTE TO YOUR FUTURE SELF</small></div>
    </aside></div>

    <footer className="habit-footer"><span><i/> Private by design. Your rituals live on this device.</span><Button variant="ghost" onClick={()=>void perform('export')} disabled={busy||loading}><ArrowDownToLine/> Export history</Button></footer>
    <details className="habit-method"><summary>How streaks & storage work</summary><p>Streaks count consecutive scheduled days; rest days and archived days do not break a streak. Today remains open until the day ends. Consistency is completed ÷ scheduled check-ins, including today, over 28 calendar days. Schedule edits take effect today without rewriting earlier days. Daily history uses this computer’s local calendar date. Check-ins can be undone or backfilled on scheduled days since creation; future dates are blocked. Habits and history are encrypted locally with one previous-version backup. Exports are unencrypted JSON. Archiving keeps your history. N creates a habit; / focuses search.</p><Button variant="ghost" disabled={busy} onClick={()=>void perform('recover')}>Recover previous backup</Button></details>

    <Dialog open={editing!==null} onOpenChange={open=>{if(!open)setEditing(null)}}><DialogContent className="habit-editor"><DialogTitle>{editing==='new'?'Create a little ritual':'Shape your ritual'}</DialogTitle><DialogDescription>Small enough to start. Meaningful enough to keep.</DialogDescription><form onSubmit={save}><div className={`habit-editor-preview habit-color-${draft.color}`}><span className="habit-glyph"><HabitGlyph icon={draft.icon}/></span><span>{draft.title||'Your next chapter'}</span></div><label>What will you show up for?<input autoFocus required maxLength={120} placeholder="e.g. Read for 20 minutes" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><label>A little intention <small>optional</small><input maxLength={1000} placeholder="Why does this matter to you?" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label><fieldset><legend>Give it a feeling</legend><div className="habit-color-picker">{colors.map(color=><button type="button" key={color} className={`habit-color-${color}`} aria-label={`${color} color`} aria-pressed={draft.color===color} onClick={()=>setDraft({...draft,color})}><i/>{draft.color===color&&<Check/>}</button>)}</div><div className="habit-icon-picker">{(Object.keys(icons) as HabitIcon[]).map(icon=><button type="button" key={icon} aria-label={`${icon} icon`} aria-pressed={draft.icon===icon} onClick={()=>setDraft({...draft,icon})}><HabitGlyph icon={icon}/></button>)}</div></fieldset><fieldset><legend>Your rhythm</legend><div className="habit-presets"><button type="button" onClick={()=>setDraft({...draft,days:allDays})}>Every day</button><button type="button" onClick={()=>setDraft({...draft,days:[1,2,3,4,5]})}>Weekdays</button><button type="button" onClick={()=>setDraft({...draft,days:[0,6]})}>Weekends</button></div><div className="habit-day-picker">{weekdays.map((day,i)=><button type="button" key={day} aria-pressed={draft.days.includes(i)} onClick={()=>setDraft({...draft,days:draft.days.includes(i)?draft.days.filter(d=>d!==i):[...draft.days,i].sort()})}>{day}</button>)}</div></fieldset>{error&&<p className="habit-form-error" role="alert">{error}</p>}<Button type="submit" className="habit-create" disabled={busy||!draft.title.trim()||!draft.days.length}>{editing==='new'?'Begin this ritual':'Save changes'}<ArrowRight/></Button></form></DialogContent></Dialog>
    <Dialog open={Boolean(detail)} onOpenChange={open=>{if(!open)setDetailId(null)}}><DialogContent className={`habit-detail habit-color-${detail?.color??'mint'}`}><DialogTitle>{detail?.title}</DialogTitle><DialogDescription>{detail?.note||'Every check-in is a little promise kept.'}</DialogDescription>{detail&&<><div className="habit-detail-stats">{[['Current streak',stats.get(detail.id)?.current],['Best streak',stats.get(detail.id)?.best],['Total check-ins',stats.get(detail.id)?.total]].map(([label,value])=><div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div><h4>Last 12 weeks</h4><div className="habit-heatmap habit-detail-grid">{heatmap.map(day=><button key={day} data-level={detail.checkins[day]?3:0} title={`${day} · ${detail.checkins[day]?'completed':isScheduled(detail,day)?'not checked in':'not scheduled'}`} aria-label={`${detail.title} on ${day}: ${detail.checkins[day]?'completed':isScheduled(detail,day)?'not checked in':'not scheduled'}`} aria-pressed={Boolean(detail.checkins[day])} disabled={busy||detail.archived||!isScheduled(detail,day)} onClick={()=>void perform({type:'checkin',id:detail.id,date:day})}/>)}</div><p className="habit-detail-hint">Click a scheduled day to check in or undo. History begins {labelDate(detail.createdDate,{month:'long',day:'numeric',year:'numeric'})}.</p><details><summary>Recent changes</summary><div className="habit-event-list">{detail.history.slice(-20).reverse().map((event,i)=><div key={i}><span>{event.action==='checkin'?'Check-in toggled':event.action}{event.date?` · ${event.date}`:''}</span><time>{new Date(event.at).toLocaleString('en-IN', { timeZone: APP_TIME_ZONE })}</time></div>)}</div></details></>}</DialogContent></Dialog>
  </div>
}
