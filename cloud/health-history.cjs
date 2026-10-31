'use strict'

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024
const ENDPOINTS = [
  'activity', 'activityGoals', 'movementSignals', 'sedentaryIntervals', 'stepsIntraday', 'caloriesIntraday', 'heartIntraday',
  'sleep', 'sleepDetails', 'sleepTrend', 'stepsTrend', 'caloriesTrend', 'heartTrend', 'metricTrends',
  'bodyWeight', 'bodyFat', 'water', 'waterGoal', 'food', 'breathing', 'hrv', 'spo2', 'skinTemperature', 'coreTemperature',
  'cardio', 'ecg', 'activities', 'irregularRhythm', 'bloodGlucose',
]

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function cleanSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || !validDate(value.date)) return null
  const generatedAt = typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt))
    ? new Date(value.generatedAt).toISOString() : null
  if (!generatedAt) return null
  const source = value.endpoints && typeof value.endpoints === 'object' && !Array.isArray(value.endpoints) ? value.endpoints : {}
  const endpoints = Object.fromEntries(ENDPOINTS.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]))
  const snapshot = { version: 1, date: value.date, generatedAt, endpoints }
  return Buffer.byteLength(JSON.stringify(snapshot)) <= MAX_SNAPSHOT_BYTES ? snapshot : null
}

function fromPayload(payload) {
  if (payload?.source !== 'google-health') return null
  return cleanSnapshot({ version: 1, date: payload.date, generatedAt: payload.generatedAt, endpoints: payload.endpoints })
}

function normalize(value) {
  const snapshots = {}
  if (value?.version !== 1 || !value.snapshots || typeof value.snapshots !== 'object' || Array.isArray(value.snapshots)) return { version: 1, snapshots }
  for (const [date, input] of Object.entries(value.snapshots)) {
    const snapshot = cleanSnapshot(input)
    if (date === snapshot?.date) snapshots[date] = snapshot
  }
  return { version: 1, snapshots }
}

function merge(...values) {
  const snapshots = {}
  for (const value of values) {
    for (const [date, snapshot] of Object.entries(normalize(value).snapshots)) {
      if (!snapshots[date] || Date.parse(snapshot.generatedAt) > Date.parse(snapshots[date].generatedAt)) snapshots[date] = snapshot
    }
  }
  return { version: 1, snapshots }
}

function summary(value) {
  const archive = normalize(value)
  const dates = Object.keys(archive.snapshots).sort()
  const endpoints = [...new Set(Object.values(archive.snapshots).flatMap(snapshot => Object.keys(snapshot.endpoints)))].sort()
  return { snapshots: dates.length, firstDate: dates[0] || null, lastDate: dates.at(-1) || null, endpoints }
}

module.exports = { ENDPOINTS, MAX_SNAPSHOT_BYTES, cleanSnapshot, fromPayload, merge, normalize, summary }
