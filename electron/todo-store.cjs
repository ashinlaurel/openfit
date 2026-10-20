'use strict'
const crypto = require('node:crypto')
const dateValid = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value)
function fields(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) throw new Error('Task title must contain 1–500 characters.')
  const notes = input.notes ?? '', due = input.due ?? '', priority = input.priority ?? 'normal', tags = input.tags ?? []
  if (typeof notes !== 'string' || notes.length > 10000 || !dateValid(due) || !['low', 'normal', 'high'].includes(priority) || !Array.isArray(tags) || tags.length > 10 || tags.some(t => typeof t !== 'string' || t.length > 40)) throw new Error('Invalid task details.')
  return { title: input.title.trim(), notes, due, priority, tags: [...new Set(tags.map(t => t.trim()).filter(Boolean))] }
}
function emptyStore() { return { version: 1, tasks: [] } }
function validateStore(store) {
  if (store?.version !== 1 || !Array.isArray(store.tasks) || store.tasks.length > 10000) throw new Error('Unsupported or damaged task archive.')
  const ids = new Set()
  for (const task of store.tasks) {
    fields(task)
    if (typeof task.id !== 'string' || ids.has(task.id) || !Array.isArray(task.history) || !['active', 'completed', 'trashed'].includes(task.state)) throw new Error('Invalid task archive.')
    ids.add(task.id)
  }
  return store
}
function mutate(store, action) {
  validateStore(store)
  const next = structuredClone(store), now = new Date().toISOString()
  if (next.tasks.length >= 10000 && action.type === 'create') throw new Error('Task limit reached. Export and archive older tasks first.')
  const actor = action.actor === 'assistant' ? 'assistant' : 'user'
  if (action.type === 'create') {
    next.tasks.unshift({ id: crypto.randomUUID(), ...fields(action.task), state: 'active', createdAt: now, updatedAt: now, completedAt: null, trashedAt: null, history: [{ at: now, actor, action: 'created' }] })
    return next
  }
  const task = next.tasks.find(t => t.id === action.id)
  if (!task) throw new Error('Task no longer exists.')
  const before = { ...fields(task), state: task.state }
  if (action.type === 'update') Object.assign(task, fields({ ...task, ...action.task }))
  else if (action.type === 'complete' && task.state === 'active') { task.state = 'completed'; task.completedAt = now }
  else if (action.type === 'reopen' && task.state === 'completed') { task.state = 'active'; task.completedAt = null }
  else if (action.type === 'trash' && task.state !== 'trashed') { task.previousState = task.state; task.state = 'trashed'; task.trashedAt = now }
  else if (action.type === 'restore' && task.state === 'trashed') { task.state = task.previousState === 'completed' ? 'completed' : 'active'; task.trashedAt = null }
  else if (action.type === 'purge' && task.state === 'trashed') { next.tasks = next.tasks.filter(t => t.id !== task.id); return next }
  else throw new Error('Invalid task action for its current state.')
  task.updatedAt = now
  task.history.push({ at: now, actor, action: action.type, before })
  task.history = task.history.slice(-100)
  return next
}
module.exports = { emptyStore, validateStore, mutate, fields }
