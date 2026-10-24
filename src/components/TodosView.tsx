import { APP_TIME_ZONE } from '@/lib/timezone'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Search, Plus, Sparkles, Trash2, RotateCcw, Download, Upload, Pencil, History, CheckCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { localIso } from '@/data/demo'
import type { TodoTask } from '@/types'
import type { useTodos } from '@/lib/use-todos'

type TodoState = ReturnType<typeof useTodos>
export function TodosView({ todos, focusRequest, onAssistant }: { todos: TodoState; focusRequest: number; onAssistant: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')
  const [sort, setSort] = useState('priority')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<TodoTask | 'new' | null>(null)
  const [history, setHistory] = useState<TodoTask | null>(null)
  const [draft, setDraft] = useState({ title: '', notes: '', due: '', priority: 'normal', tags: '' })
  const searchRef = useRef<HTMLInputElement>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const [quick, setQuick] = useState('')
  const tasks = todos.store.tasks
  const today = localIso()
  const counts = { active: tasks.filter(t => t.state === 'active').length, completed: tasks.filter(t => t.state === 'completed').length, trashed: tasks.filter(t => t.state === 'trashed').length }
  useEffect(() => { if (focusRequest) { setFilter('active'); setQuery(''); (focusRequest < 0 ? searchRef : quickRef).current?.focus() } }, [focusRequest])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (editing || history || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return
      if (event.key === 'n' || event.key === '/') { event.preventDefault(); (event.key === 'n' ? quickRef : searchRef).current?.focus() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [editing, history])
  const filtered = useMemo(() => {
    const rank = { high: 0, normal: 1, low: 2 }
    return tasks.filter(t => (filter === 'all' ? t.state !== 'trashed' : filter === 'overdue' ? t.state === 'active' && t.due && t.due < today : t.state === filter)
      && query.toLowerCase().trim().split(/\s+/).every(word => `${t.title} ${t.notes} ${t.tags.join(' ')}`.toLowerCase().includes(word)))
      .sort((a,b) => sort === 'due' ? (a.due || '9999').localeCompare(b.due || '9999') : sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : rank[a.priority] - rank[b.priority] || (a.due || '9999').localeCompare(b.due || '9999'))
  }, [tasks, filter, query, sort, today])
  const chosen = filtered.filter(t => selected.has(t.id))
  const edit = (task: TodoTask | 'new') => {
    setDraft(task === 'new' ? { title: '', notes: '', due: '', priority: 'normal', tags: '' } : { ...task, tags: task.tags.join(', ') })
    setEditing(task)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (await todos.perform([{ type: editing === 'new' ? 'create' : 'update', id: editing === 'new' ? undefined : editing?.id, task: { ...draft, priority: draft.priority as TodoTask['priority'], tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean) } }])) setEditing(null)
  }
  return <div className="page-stack todos-page">
    <div className="todo-heading"><div><span className="todo-eyebrow">YOUR PERSONAL WORKSPACE</span><h2>Clear your head.<br /><span>Make room for what matters.</span></h2><p>{counts.active} active · {counts.completed} completed · encrypted on this device</p></div><Button variant="outline" onClick={onAssistant}><Sparkles /> Plan with Codex</Button></div>
    {todos.error && <div className="todo-error" role="alert">{todos.error}<div><Button variant="outline" onClick={() => void todos.reload()}>Retry</Button><Button variant="outline" onClick={() => void todos.perform('recover')} disabled={todos.busy}>Recover backup</Button></div></div>}
    <form className="todo-quick" onSubmit={async e => { e.preventDefault(); if (quick.trim() && await todos.perform([{ type: 'create', task: { title: quick } }])) { setQuick(''); setFilter('active'); setQuery(''); quickRef.current?.focus() } }}><Plus aria-hidden="true" /><input ref={quickRef} aria-label="New task" maxLength={500} placeholder="Add a task, then press Enter…" value={quick} onChange={e => setQuick(e.target.value)} disabled={todos.loading || todos.busy} /><Button type="submit" disabled={!quick.trim() || todos.busy || todos.loading}>Add task</Button><Button type="button" variant="ghost" onClick={() => edit('new')} disabled={todos.busy}>Details</Button></form>
    <div className="todo-tools"><div className="todo-tabs" aria-label="Task filters">{[['active','Active'],['overdue','Overdue'],['completed','Completed'],['all','All'],['trashed','Trash']].map(([id,label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setSelected(new Set()) }}>{label}{id in counts && <small>{counts[id as keyof typeof counts]}</small>}</button>)}</div><div className="todo-search"><Search aria-hidden="true" /><input ref={searchRef} aria-label="Search tasks" placeholder="Search tasks, notes, tags…" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Sort tasks" value={sort} onChange={e => setSort(e.target.value)}><option value="priority">Priority first</option><option value="due">Due date</option><option value="newest">Newest first</option></select></div>
    {filtered.length > 0 && <div className="todo-selection"><label><input type="checkbox" aria-label="Select all visible tasks" checked={filtered.every(t => selected.has(t.id))} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(t => t.id)) : new Set())} /> Select visible</label><span>{chosen.length} selected</span>{chosen.length > 0 && <><Button variant="ghost" disabled={todos.busy || !chosen.some(t => t.state === 'active')} onClick={async () => { await todos.perform(chosen.filter(t => t.state === 'active').map(t => ({ type: 'complete', id: t.id }))); setSelected(new Set()) }}><CheckCheck /> Complete</Button><Button variant="ghost" disabled={todos.busy} onClick={async () => { await todos.perform(chosen.map(t => ({ type: t.state === 'trashed' ? 'restore' : 'trash', id: t.id }))); setSelected(new Set()) }}>{filter === 'trashed' ? 'Restore' : 'Move to Trash'}</Button></>}</div>}
    <div className="todo-list" aria-label="Tasks" aria-busy={todos.busy || todos.loading}>
      {todos.loading && <p className="todo-empty" role="status">Opening your local task store…</p>}
      {!todos.loading && !filtered.length && <div className="todo-empty"><CheckCheck /><h3>{query ? 'No matching tasks' : filter === 'active' ? 'A little space to think.' : 'Nothing here yet.'}</h3><p>{query ? 'Try a different title, note, or tag.' : 'Add your first task above, or plan your next steps with Codex.'}</p></div>}
      {filtered.map(task => <article key={task.id} className={`todo-row ${task.state === 'completed' ? 'is-done' : ''}`}><input type="checkbox" aria-label={`Select ${task.title}`} checked={selected.has(task.id)} onChange={e => setSelected(old => { const next = new Set(old); if (e.target.checked) next.add(task.id); else next.delete(task.id); return next })} /><button className="todo-check" aria-label={task.state === 'completed' ? `Reopen ${task.title}` : task.state === 'trashed' ? `Restore ${task.title}` : `Complete ${task.title}`} disabled={todos.busy} onClick={() => void todos.perform([{ type: task.state === 'trashed' ? 'restore' : task.state === 'completed' ? 'reopen' : 'complete', id: task.id }])}>{task.state === 'completed' ? '✓' : task.state === 'trashed' ? <RotateCcw /> : ''}</button><div className="todo-row-copy"><button className="todo-title" onClick={() => edit(task)}>{task.title}</button>{task.notes && <p>{task.notes}</p>}<div className="todo-meta"><span className={`todo-priority priority-${task.priority}`}>{task.priority}</span>{task.due && <span className={task.due < today && task.state === 'active' ? 'todo-overdue' : ''}>Due {task.due}</span>}{task.tags.map(tag => <button key={tag} onClick={() => setQuery(tag)}>#{tag}</button>)}{task.state === 'completed' && task.completedAt && <span>Done {new Date(task.completedAt).toLocaleDateString('en-IN', { timeZone: APP_TIME_ZONE })}</span>}</div></div><div className="todo-row-actions"><button title="Edit task" aria-label={`Edit ${task.title}`} disabled={todos.busy} onClick={() => edit(task)}><Pencil /></button><button title="Task history" aria-label={`History for ${task.title}`} onClick={() => setHistory(task)}><History /></button><button title={task.state === 'trashed' ? 'Delete permanently' : 'Move to Trash'} aria-label={`${task.state === 'trashed' ? 'Delete permanently' : 'Trash'} ${task.title}`} disabled={todos.busy} onClick={() => void todos.perform([{ type: task.state === 'trashed' ? 'purge' : 'trash', id: task.id }])}><Trash2 /></button></div></article>)}
    </div>
    <footer className="todo-footer"><span>N to add · / to search · saved independently of your health account</span><div><Button variant="ghost" disabled={todos.busy} onClick={() => void todos.perform('import')}><Upload /> Import JSON</Button><Button variant="ghost" disabled={todos.busy} onClick={() => void todos.perform('export')}><Download /> Export JSON</Button></div></footer>
    <details className="todo-storage"><summary>Storage, history & privacy</summary><p>Tasks are encrypted in Electron’s app-data directory, with one encrypted backup of the previous saved version. Completed tasks remain searchable; Trash is recoverable. Each task retains its latest 100 changes, including previous values and whether you or the assistant made them. Permanent deletion removes the task from both the store and backup. JSON exports are unencrypted; imports add new copies of non-trashed tasks and start fresh history. Codex receives a size-limited snapshot of non-trashed tasks only when you send a message in task mode; notes are limited to 2,000 characters per task. Proposed task changes require your review.</p><Button variant="ghost" disabled={todos.busy} onClick={() => void todos.perform('recover')}>Recover previous backup</Button></details>
    <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null) }}><DialogContent className="todo-dialog"><DialogTitle>{editing === 'new' ? 'New task' : 'Edit task'}</DialogTitle><DialogDescription>Add the details that make your next action clear.</DialogDescription><form onSubmit={save}><label>Title<input required maxLength={500} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} autoFocus /></label><label>Notes<textarea maxLength={10000} rows={4} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label><div className="todo-form-pair"><label>Due date<input type="date" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} /></label><label>Priority<select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })}><option>low</option><option>normal</option><option>high</option></select></label></div><label>Tags <small>comma-separated · up to 10</small><input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} /></label><Button disabled={todos.busy || !draft.title.trim()} type="submit">Save task</Button>{todos.error && <p role="alert">{todos.error}</p>}</form></DialogContent></Dialog>
    <Dialog open={history !== null} onOpenChange={open => { if (!open) setHistory(null) }}><DialogContent className="todo-dialog"><DialogTitle>Task history</DialogTitle><DialogDescription>{history?.title}</DialogDescription><div className="todo-history">{history?.history.slice().reverse().map((entry, index) => <div key={index}><strong>{entry.action} · {entry.actor}</strong><time>{new Date(entry.at).toLocaleString('en-IN', { timeZone: APP_TIME_ZONE })}</time>{entry.before && <details><summary>Previous values</summary><pre>{JSON.stringify(entry.before, null, 2)}</pre></details>}</div>)}</div></DialogContent></Dialog>
  </div>
}
