'use strict'
// Read-only provenance check; never prints credentials or user profile fields.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeArchive } = require('../electron/health-cache.cjs')
app.setName('pulseboard-fitbit-desktop')
app.whenReady().then(() => {
  try {
    const dir = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const read = name => {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) return null
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!envelope.encrypted || !safeStorage.isEncryptionAvailable()) throw new Error('Encrypted storage unavailable')
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
    }
    const credentials = read('credentials.secure.json')
    const archive = normalizeArchive(read('health-cache.secure.json'))
    console.log(JSON.stringify({ provider: credentials?.config?.provider, connected: Boolean(credentials?.token), lastDate: archive.lastDate,
      days: Object.values(archive.days).map(day => ({ date: day.date, source: day.source, fetchedAt: day.fetchedAt, generatedAt: day.generatedAt,
        summary: day.endpoints?.activity?.summary, requestStats: day.requestStats, errors: (day.errors || []).map(e => ({ key: e.key, status: e.status })),
        workoutCount: day.endpoints?.activities?.activities?.length || 0,
      })) }, null, 2))
    app.exit(0)
  } catch (e) { console.error(e.message); app.exit(1) }
})
