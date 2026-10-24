import { describe, expect, it } from 'vitest'
// @ts-expect-error tested JS runtime module
import { cookies, digest, random, sameOrigin, ownerIdentity, validDate } from './security.mjs'
describe('Private website access controls', () => {
  it('accepts only the pinned Google subject, never just a matching display name', () => {
    expect(ownerIdentity({ sub: 'owner', email: 'owner@example.com' }, 'owner')).toBe(true)
    expect(ownerIdentity({ sub: 'attacker', email: 'owner@example.com' }, 'owner')).toBe(false)
    expect(ownerIdentity({}, 'owner')).toBe(false)
  })
  it('requires the exact origin and custom request header for cookie-authenticated writes', () => {
    const origin = 'https://fit.example.com'
    expect(sameOrigin({ headers: { origin, 'x-openfit-request': '1' } }, origin)).toBe(true)
    expect(sameOrigin({ headers: { origin: 'https://attacker.example', 'x-openfit-request': '1' } }, origin)).toBe(false)
    expect(sameOrigin({ headers: { origin } }, origin)).toBe(false)
  })
  it('uses unpredictable opaque cookies and hashes stored session identifiers', () => {
    const a = random(), b = random()
    expect(a).not.toBe(b); expect(a.length).toBeGreaterThan(40)
    expect(digest(a)).toHaveLength(64); expect(digest(a)).not.toBe(a)
    expect(cookies({ headers: { cookie: '__Host-openfit=opaque; other=value' } })['__Host-openfit']).toBe('opaque')
  })
  it('rejects malformed and impossible health dates', () => {
    expect(validDate('2026-02-30')).toBe(false)
    expect(validDate('2026-10-21')).toBe(true)
    expect(validDate('../../tokens')).toBe(false)
  })
})
