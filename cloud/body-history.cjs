'use strict'
const bounds = { weightKg: [.01, 1000], bodyFat: [0, 100], heightCm: [30, 300], bmi: [1, 200], waterMl: [0, 100000], caloriesIn: [0, 100000], bodyWaterMassKg: [0, 1000], boneMassKg: [0, 1000], leanBodyMassKg: [0, 1000], basalMetabolicRate: [0, 20000] }
function validDate(date) { return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date }
function normalize(value) {
  const days = {}
  for (const [date, row] of Object.entries(value?.days || {})) {
    if (!validDate(date)) continue
    const metrics = {}
    for (const [name, range] of Object.entries(bounds)) {
      const measurement = row?.metrics?.[name]
      if (typeof measurement?.value !== 'number' || !Number.isFinite(measurement.value) || measurement.value < range[0] || measurement.value > range[1] || !Number.isFinite(Date.parse(measurement.updatedAt))) continue
      metrics[name] = { value: measurement.value, updatedAt: new Date(measurement.updatedAt).toISOString() }
      if (measurement.source === 'health-connect') metrics[name].source = measurement.source
    }
    if (Object.keys(metrics).length) days[date] = { metrics }
  }
  return { version: 1, days }
}
function merge(...histories) {
  const result = { version: 1, days: {} }
  for (const history of histories) for (const [date, row] of Object.entries(normalize(history).days)) {
    const target = result.days[date] ||= { metrics: {} }
    for (const [name, measurement] of Object.entries(row.metrics)) if (!target.metrics[name] || (measurement.source === 'health-connect' && target.metrics[name].source !== 'health-connect') || (measurement.source === target.metrics[name].source && measurement.updatedAt > target.metrics[name].updatedAt)) target.metrics[name] = measurement
  }
  return result
}
function fromHealthArchive(archive) {
  const result = { version: 1, days: {} }
  const put = (date, name, value, updatedAt) => {
    if (!validDate(date) || typeof value !== 'number' || !Number.isFinite(value)) return
    const metrics = (result.days[date] ||= { metrics: {} }).metrics
    if (!metrics[name] || updatedAt > metrics[name].updatedAt) metrics[name] = { value, updatedAt }
  }
  const num = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
  for (const payload of Object.values(archive?.days || {})) {
    if (!Number.isFinite(Date.parse(payload?.generatedAt))) continue
    const updatedAt = new Date(payload.generatedAt).toISOString(), e = payload.endpoints || {}
    for (const row of e.bodyWeight?.weight || []) { put(row.date, 'weightKg', num(row.weight), updatedAt); put(row.date, 'bmi', num(row.bmi), updatedAt) }
    for (const row of e.bodyFat?.fat || []) put(row.date, 'bodyFat', num(row.fat), updatedAt)
    const profile = e.profile?.user || e.profile || {}
    put(payload.date, 'heightCm', num(profile.height), updatedAt)
    put(payload.date, 'waterMl', num(e.water?.summary?.water), updatedAt)
    put(payload.date, 'caloriesIn', num(e.food?.summary?.calories), updatedAt)
  }
  return normalize(result)
}
function withoutHealthConnect(value) {
  const result = normalize(value)
  for (const row of Object.values(result.days)) for (const [name, measurement] of Object.entries(row.metrics)) if (measurement.source === 'health-connect') delete row.metrics[name]
  return normalize(result)
}
module.exports = { normalize, merge, fromHealthArchive, withoutHealthConnect }
