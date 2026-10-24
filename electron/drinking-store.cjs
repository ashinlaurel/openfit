'use strict'

function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }
function isDate(value, current) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > current) return false
  const instant = Date.parse(`${value}T12:00:00Z`)
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value
}
function emptyStore(date = today()) { return { version: 1, trackingStart: date, entries: [], dryDays: [], goal: 8 } }
function validateStore(value, current = today()) {
  if (value?.version !== 1 || !isDate(value.trackingStart, current) || !Number.isInteger(value.goal) || value.goal < 0 || value.goal > 14 || !Array.isArray(value.entries) || value.entries.length > 10000 || !Array.isArray(value.dryDays) || value.dryDays.length > 10000 || !value.dryDays.every(date => isDate(date, current))) throw new Error('Invalid drinking log.')
  const ids = new Set()
  const entries = value.entries.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !entry.id.length || entry.id.length > 100 || ids.has(entry.id) || !isDate(entry.date, current) || entry.date < value.trackingStart || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 80 || !Number.isFinite(entry.ml) || entry.ml < 1 || entry.ml > 10000 || !Number.isFinite(entry.abv) || entry.abv < 0 || entry.abv > 100 || typeof entry.note !== 'string' || entry.note.length > 300) throw new Error('Invalid drink record.')
    ids.add(entry.id)
    return { id: entry.id, date: entry.date, name: entry.name.trim(), ml: entry.ml, abv: entry.abv, note: entry.note }
  })
  return { version: 1, trackingStart: value.trackingStart, entries, dryDays: [...new Set(value.dryDays)], goal: value.goal }
}
module.exports = { emptyStore, validateStore }
