'use strict'

// Preserve Health Connect records separately from the Google Health daily archive.
const TYPES = {
  Weight: ['weightKg', .01, 1000], BodyFat: ['bodyFat', 0, 100],
  BodyWaterMass: ['bodyWaterMassKg', 0, 1000], BoneMass: ['boneMassKg', 0, 1000],
  LeanBodyMass: ['leanBodyMassKg', 0, 1000], Height: ['heightCm', 30, 300],
  BasalMetabolicRate: ['basalMetabolicRate', 0, 20000], HeartRate: [null, 1, 300],
}
const invalid = () => { throw Object.assign(new Error('Invalid Health Connect records.'), { status: 400 }) }
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Date.parse(value) >= 0 && Date.parse(value) <= 4102444800000
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value)
function validate(input) {
  if (input?.version !== 1 || !identifier(input.deviceId) || !Array.isArray(input.records) || input.records.length > 200 || !Array.isArray(input.deletedIds) || input.deletedIds.length > 1000 || !input.deletedIds.every(identifier)) invalid()
  const window = input.window
  if (window && (!Object.hasOwn(TYPES, window.type) || !timestamp(window.startTime) || !timestamp(window.endTime) || Date.parse(window.startTime) >= Date.parse(window.endTime) || !Array.isArray(window.ids) || window.ids.length > 100000 || !window.ids.every(identifier))) invalid()
  for (const row of input.records) {
    if (!row || !Object.hasOwn(TYPES, row.type) || !identifier(row.id) || !identifier(row.origin) || !timestamp(row.time) || !timestamp(row.modifiedAt) || !Number.isInteger(row.offsetMinutes) || Math.abs(row.offsetMinutes) > 1080) invalid()
    const [, min, max] = TYPES[row.type]
    if (row.type === 'HeartRate') {
      if (!timestamp(row.endTime) || Date.parse(row.endTime) < Date.parse(row.time) || !Array.isArray(row.samples) || !row.samples.length || row.samples.length > 20000) invalid()
      if (row.samples.some(s => !timestamp(s?.time) || Date.parse(s.time) < Date.parse(row.time) || Date.parse(s.time) > Date.parse(row.endTime) || !Number.isFinite(s.bpm) || s.bpm < min || s.bpm > max)) invalid()
    } else if (!Number.isFinite(row.value) || row.value < min || row.value > max) invalid()
  }
  return input
}
function merge(current, input) {
  validate(input)
  const records = { ...(current?.records || {}) }
  for (const id of input.deletedIds) delete records[`${input.deviceId}:${id}`]
  for (const row of input.records) {
    const clean = { id: row.id, type: row.type, origin: row.origin, time: row.time, modifiedAt: row.modifiedAt, offsetMinutes: row.offsetMinutes }
    if (row.type === 'HeartRate') { clean.endTime = row.endTime; clean.samples = row.samples.map(s => ({ time: s.time, bpm: s.bpm })) }
    else clean.value = row.value
    const id = `${input.deviceId}:${row.id}`
    if (!records[id] || Date.parse(row.modifiedAt) >= Date.parse(records[id].modifiedAt)) records[id] = clean
  }
  if (input.window) {
    const { type, startTime, endTime, ids } = input.window, seen = new Set(ids)
    for (const [key, record] of Object.entries(records)) {
      if (key.startsWith(`${input.deviceId}:`) && record.type === type && Date.parse(record.time) >= Date.parse(startTime) && Date.parse(record.time) < Date.parse(endTime) && !seen.has(record.id)) delete records[key]
    }
  }
  if (Object.keys(records).length > 100000) throw Object.assign(new Error('Health Connect archive has reached its record limit.'), { status: 507 })
  return { version: 1, syncedAt: new Date().toISOString(), records }
}
function summary(value) {
  const counts = {}, sources = new Set()
  for (const row of Object.values(value?.records || {})) { counts[row.type] = (counts[row.type] || 0) + 1; sources.add(row.origin) }
  return { syncedAt: value?.syncedAt || null, records: Object.values(counts).reduce((a, b) => a + b, 0), counts, sources: [...sources] }
}
function bodyHistory(value) {
  const days = {}
  for (const row of Object.values(value?.records || {})) {
    const metric = TYPES[row.type]?.[0]
    if (!metric) continue
    const date = new Date(Date.parse(row.time) + row.offsetMinutes * 60000).toISOString().slice(0, 10)
    const metrics = (days[date] ||= { metrics: {} }).metrics
    if (!metrics[metric] || Date.parse(row.time) > Date.parse(metrics[metric].updatedAt)) metrics[metric] = { value: row.value, updatedAt: new Date(row.time).toISOString(), source: 'health-connect' }
  }
  return { version: 1, days }
}
module.exports = { validate, merge, summary, bodyHistory }
