'use strict'

const CACHE_VERSION = 2

function emptyArchive() {
  return { version: CACHE_VERSION, lastDate: null, days: {} }
}

// Older translated snapshots lost the civil date and misread midnight as UTC.
// Keep their daily totals/history, but do not show known-ambiguous hourly plots.
function safeCachedPayload(payload) {
  if (payload?.source !== 'google-health' || payload.timeZoneVersion === 1) return payload
  const endpoints = { ...payload.endpoints }
  endpoints.stepsIntraday = { 'activities-steps-intraday': { dataset: [] } }
  endpoints.heartIntraday = { ...endpoints.heartIntraday, 'activities-heart-intraday': { dataset: [] } }
  return { ...payload, endpoints }
}

function normalizeArchive(value) {
  if (value?.version === CACHE_VERSION && value.days && typeof value.days === 'object') {
    return {
      version: CACHE_VERSION,
      lastDate: typeof value.lastDate === 'string' ? value.lastDate : null,
      days: Object.fromEntries(Object.entries(value.days).map(([date, payload]) => [date, safeCachedPayload(payload)])),
    }
  }

  // Version 1 stored one raw payload directly in the encrypted cache file.
  if (value && typeof value === 'object' && typeof value.date === 'string') {
    return { version: CACHE_VERSION, lastDate: value.date, days: { [value.date]: safeCachedPayload(value) } }
  }

  return emptyArchive()
}

function cachedDay(value, date) {
  return normalizeArchive(value).days[date] || null
}

function latestDay(value) {
  const archive = normalizeArchive(value)
  if (archive.lastDate && archive.days[archive.lastDate]) return archive.days[archive.lastDate]
  const dates = Object.keys(archive.days).sort()
  return dates.length ? archive.days[dates.at(-1)] : null
}

function storeDay(value, payload) {
  const archive = normalizeArchive(value)
  return {
    version: CACHE_VERSION,
    lastDate: [archive.lastDate, payload.date].filter(Boolean).sort().at(-1),
    days: { ...archive.days, [payload.date]: payload },
  }
}

// Backfill only missing snapshots. A normal sync already includes 14-day trends.
function recentMissingDates(value, today, count = 7) {
  const archive = normalizeArchive(value)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today + 'T12:00:00Z')
    date.setUTCDate(date.getUTCDate() - index)
    return date.toISOString().slice(0, 10)
  }).filter(date => !archive.days[date] || (archive.days[date].source === 'google-health' && archive.days[date].timeZoneVersion !== 1))
}

module.exports = { CACHE_VERSION, recentMissingDates, normalizeArchive, cachedDay, latestDay, storeDay }
