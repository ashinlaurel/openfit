'use strict'
const crypto = require('node:crypto')
const COLORS = ['mint', 'blue', 'violet', 'amber', 'rose']
const ICONS = ['spark', 'book', 'move', 'water', 'moon', 'mind', 'sun', 'leaf']
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function isDate(v) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d=new Date(`${v}T12:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===v }
function fields(value) {
  if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || typeof value.note !== 'string' || value.note.length > 1000 || !COLORS.includes(value.color) || !ICONS.includes(value.icon) || !Array.isArray(value.days) || !value.days.length || value.days.length > 7 || value.days.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new Error('Choose a title, color, icon and at least one scheduled day.')
  return { title: value.title.trim(), note: value.note, color: value.color, icon: value.icon, days: [...new Set(value.days)].sort() }
}
function emptyStore() { return { version: 1, habits: [] } }
function validateStore(store) {
  if (store?.version !== 1 || !Array.isArray(store.habits) || store.habits.length > 200) throw new Error('Unsupported or damaged habit store.')
  const ids = new Set()
  for (const h of store.habits) {
    fields(h)
    if (typeof h.id !== 'string' || ids.has(h.id) || !isDate(h.createdDate) || typeof h.archived !== 'boolean' || !h.checkins || typeof h.checkins !== 'object' || Array.isArray(h.checkins) || !Array.isArray(h.schedules) || !h.schedules.length || !Array.isArray(h.history)) throw new Error('Invalid habit record.')
    for (const s of h.schedules) if (!isDate(s.from) || !Array.isArray(s.days) || s.days.some(d=>!Number.isInteger(d)||d<0||d>6)) throw new Error('Invalid habit schedule.')
    for (const [date, log] of Object.entries(h.checkins)) if (!isDate(date) || !log || typeof log.at !== 'string') throw new Error('Invalid check-in.')
    ids.add(h.id)
  }
  return store
}
function scheduled(habit, date) {
  if (date < habit.createdDate) return false
  if (habit.checkins[date]) return true
  const schedule = habit.schedules.filter(s=>s.from<=date).sort((a,b)=>a.from.localeCompare(b.from)).at(-1)
  return Boolean(schedule?.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
}
function mutate(store, action, date=today()) {
  validateStore(store)
  if (!action || typeof action !== 'object' || !isDate(date)) throw new Error('Invalid habit action.')
  const next = structuredClone(store), now = new Date().toISOString()
  if (action.type === 'create') {
    if (next.habits.length >= 200) throw new Error('Habit limit reached (200).')
    const details=fields(action.habit)
    next.habits.push({ id: crypto.randomUUID(), ...details, createdDate: date, createdAt: now, updatedAt: now, archived: false, schedules: [{ from: date, days: details.days }], checkins: {}, history: [{ at: now, action: 'created' }] })
    return next
  }
  const h=next.habits.find(h=>h.id===action.id)
  if (!h) throw new Error('Habit no longer exists.')
  if (action.type === 'update') {
    const details=fields(action.habit)
    if (h.archived) throw new Error('Reactivate the habit before editing.')
    if (JSON.stringify(h.days)!==JSON.stringify(details.days)) h.schedules=[...h.schedules.filter(s=>s.from!==date),{ from: date, days: details.days }]
    Object.assign(h,details)
  } else if (action.type === 'archive' || action.type === 'restore') {
    h.archived=action.type==='archive'
    // Schedule versions preserve prior completions and exclude archived days from streaks.
    h.schedules=[...h.schedules.filter(s=>s.from!==date),{ from: date, days: h.archived ? [] : h.days }]
  } else if (action.type === 'checkin') {
    if (h.archived || !isDate(action.date) || action.date>date || !scheduled(h, action.date)) throw new Error('Check-ins must be for scheduled days up to today.')
    if (h.checkins[action.date]) delete h.checkins[action.date]
    else h.checkins[action.date]={ at: now }
  } else throw new Error('Unknown habit action.')
  h.updatedAt=now
  h.history.push({ at: now, action: action.type, ...(action.date ? { date: action.date } : {}) })
  h.history=h.history.slice(-200)
  return next
}
module.exports={emptyStore,validateStore,mutate,scheduled,isDate}
