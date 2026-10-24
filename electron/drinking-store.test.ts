import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { validateDrinking } from '../src/lib/drinking'
const require = createRequire(import.meta.url)
const { emptyStore, validateStore } = require('./drinking-store.cjs')
const date = '2026-10-25'
const entry = { id: 'real-entry', date, name: 'Beer', ml: 330, abv: 5, note: '' }

describe('personal drinking store', () => {
  it('starts empty and round trips real logs and their tracking start', () => {
    const initial = emptyStore(date)
    expect(initial.entries).toEqual([])
    const saved = validateStore({ ...initial, entries: [entry] }, date)
    expect(validateDrinking(JSON.parse(JSON.stringify(saved)), date)).toEqual(saved)
    expect(validateStore(saved, '2026-10-26').trackingStart).toBe(date)
  })
  it('rejects corrupt records, duplicate IDs, impossible dates and inconsistent coverage', () => {
    for (const value of [
      null, {}, { ...emptyStore(date), entries: [null] },
      { ...emptyStore(date), entries: [entry, entry] },
      { ...emptyStore(date), entries: [{ ...entry, abv: Infinity }] },
      { ...emptyStore(date), entries: [{ ...entry, date: '2026-02-30' }] },
      { ...emptyStore(date), entries: [{ ...entry, date: '2026-10-24' }] },
      { ...emptyStore(date), goal: 15 },
    ]) expect(() => validateStore(value, date)).toThrow()
  })
})
