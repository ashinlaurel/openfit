import { describe, expect, it } from 'vitest'
const links = require('./workout-links.cjs')
const alice = { apiUrl: 'https://api.example.com', user: { id: 'alice' } }
const bob = { ...alice, user: { id: 'bob' } }
describe('Encrypted local workout link metadata', () => {
  it('isolates decisions by account and server', () => {
    const saved = links.update(null, alice, { gymId: 'g', mode: 'link', healthId: 'h' })
    expect(links.read(saved.store, alice)).toEqual({ g: 'h' })
    expect(links.read(saved.store, bob)).toEqual({})
    expect(links.read(saved.store, { ...alice, apiUrl: 'https://other.example.com' })).toEqual({})
  })
  it('keeps a health recording assigned to only one gym session and supports undoing overrides', () => {
    const first = links.update(null, alice, { gymId: 'g1', mode: 'link', healthId: 'h' })
    const next = links.update(first.store, alice, { gymId: 'g2', mode: 'link', healthId: 'h' })
    expect(next.links).toEqual({ g1: null, g2: 'h' })
    expect(links.update(next.store, alice, { gymId: 'g1', mode: 'auto' }).links).toEqual({ g2: 'h' })
    expect(links.update(next.store, alice, { gymId: 'g2', mode: 'unlink' }).links.g2).toBeNull()
  })
  it('rejects invalid writes and safely treats unusual IDs as data', () => {
    expect(() => links.update(null, null, { gymId: 'g', mode: 'auto' })).toThrow()
    expect(() => links.update(null, alice, { gymId: 'g', mode: 'link' })).toThrow()
    expect(() => links.update(null, alice, { gymId: 'g', mode: 'bogus' })).toThrow()
    const saved = links.update(null, alice, { gymId: '__proto__', mode: 'link', healthId: 'h' })
    expect(Object.hasOwn(saved.links, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(saved.links)).toBe(Object.prototype)
    expect(links.read(saved.store, alice)).toEqual(JSON.parse('{"__proto__":"h"}'))
  })
})
