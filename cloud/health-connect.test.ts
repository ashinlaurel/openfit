import { describe, expect, it } from 'vitest'
const hc = require('./health-connect.cjs')
const body = require('./body-history.cjs')
const record = (overrides = {}) => ({ id: 'record-1', type: 'BoneMass', origin: 'com.fitdays.app', time: '2026-10-26T20:00:00Z', modifiedAt: '2026-10-27T00:00:00Z', offsetMinutes: 330, value: 3.2, ...overrides })
const batch = (records = [record()], extra = {}) => ({ version: 1, deviceId: 'phone-1', records, deletedIds: [], ...extra })
describe('Health Connect ingestion', () => {
  it('upserts by device and record ID, keeps source provenance, and rejects stale edits', () => {
    const first = hc.merge(null, batch())
    const next = hc.merge(first, batch([record({ value: 3.4, modifiedAt: '2026-10-27T01:00:00Z', unexpectedSecret: 'discard' })]))
    const stale = hc.merge(next, batch())
    expect(hc.summary(stale)).toMatchObject({ records: 1, counts: { BoneMass: 1 }, sources: ['com.fitdays.app'] })
    expect(Object.values(stale.records)[0]).toMatchObject({ value: 3.4 })
    expect(JSON.stringify(stale)).not.toContain('unexpectedSecret')
    expect(hc.bodyHistory(stale).days['2026-10-27'].metrics.boneMassKg).toEqual({ value: 3.4, updatedAt: '2026-10-26T20:00:00.000Z', source: 'health-connect' })
  })
  it('deletes only the uploading device’s records and reconciles expired-cursor snapshots', () => {
    let archive = hc.merge(null, batch())
    archive = hc.merge(archive, batch([record()], { deviceId: 'phone-2' }))
    archive = hc.merge(archive, batch([], { deletedIds: ['record-1'] }))
    expect(Object.keys(archive.records)).toEqual(['phone-2:record-1'])
    archive = hc.merge(archive, batch([record({ id: 'record-2' })]))
    archive = hc.merge(archive, batch([], { window: { type: 'BoneMass', startTime: '2026-10-01T00:00:00Z', endTime: '2026-11-01T00:00:00Z', ids: [] } }))
    expect(Object.keys(archive.records)).toEqual(['phone-2:record-1'])
  })
  it('preserves heart-rate samples and validates the time range and measurement bounds', () => {
    const hr = record({ type: 'HeartRate', endTime: '2026-10-26T20:01:00Z', samples: [{ time: '2026-10-26T20:00:30Z', bpm: 74 }] })
    expect(hc.summary(hc.merge(null, batch([hr]))).counts).toEqual({ HeartRate: 1 })
    expect(() => hc.validate(batch([record({ type: 'Unknown' })]))).toThrow('Invalid')
    expect(() => hc.validate(batch([record({ value: -1 })]))).toThrow('Invalid')
    expect(() => hc.validate(batch([record({ offsetMinutes: 9999 })]))).toThrow('Invalid')
    expect(() => hc.validate(batch([{ ...hr, samples: [{ time: '2026-10-27T20:00:30Z', bpm: 74 }] }]))).toThrow('Invalid')
  })
  it('does not let Google refresh timestamps replace native readings or resurrect cached deletions', () => {
    const native = hc.bodyHistory(hc.merge(null, batch()))
    const google = { version: 1, days: { '2026-10-27': { metrics: { boneMassKg: { value: 9, updatedAt: '2026-10-28T00:00:00Z' } } } } }
    expect(body.merge(native, google).days['2026-10-27'].metrics.boneMassKg.value).toBe(3.2)
    expect(body.withoutHealthConnect(native).days).toEqual({})
  })
})
