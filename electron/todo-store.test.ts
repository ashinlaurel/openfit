import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { emptyStore, mutate, validateStore } = require('./todo-store.cjs')

describe('encrypted task store domain', () => {
  it('keeps immutable history across completion, reopening, trash and restore', () => {
    const initial = emptyStore()
    let store = mutate(initial, { type: 'create', task: { title: 'First', tags: ['a','a'] } })
    const id = store.tasks[0].id
    expect(initial.tasks).toEqual([])
    store = mutate(store, { type: 'update', id, task: { title: 'Edited' }, actor: 'assistant' })
    expect(store.tasks[0].history[1]).toMatchObject({ actor: 'assistant', before: { title: 'First' } })
    store = mutate(store, { type: 'complete', id })
    expect(store.tasks[0].completedAt).toBeTruthy()
    store = mutate(store, { type: 'trash', id })
    store = mutate(store, { type: 'restore', id })
    expect(store.tasks[0].state).toBe('completed')
    store = mutate(store, { type: 'reopen', id })
    expect(store.tasks[0].completedAt).toBeNull()
    expect(store.tasks[0].tags).toEqual(['a'])
    store = mutate(store, { type: 'trash', id })
    store = mutate(store, { type: 'purge', id })
    expect(store.tasks).toEqual([])
  })
  it('rejects invalid dates, unknown ids and unsupported archive shapes', () => {
    expect(() => mutate(emptyStore(), { type: 'create', task: { title: 'x', due: '2026-02-30' } })).toThrow()
    expect(() => mutate(emptyStore(), { type: 'create', task: { title: ' ' } })).toThrow()
    expect(() => mutate(emptyStore(), { type: 'update', id: 'unknown' })).toThrow()
    expect(() => validateStore({ version: 5, tasks: [] })).toThrow()
  })
  it('bounds task history and rejects purge of active tasks', () => {
    let store = mutate(emptyStore(), { type: 'create', task: { title: 'x' } })
    const id = store.tasks[0].id
    expect(() => mutate(store, { type: 'purge', id })).toThrow()
    for (let i=0; i<110; i++) store = mutate(store, { type: 'update', id, task: { notes: String(i) } })
    expect(store.tasks[0].history).toHaveLength(100)
  })
})
