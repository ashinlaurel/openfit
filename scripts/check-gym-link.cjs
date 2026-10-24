'use strict'

// Read-only connection check. Prints counts and connection flags, never credentials
// or the contents of workouts, medical records, or heart-rate samples.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const cloud = require('../electron/cloud-service.cjs')
const healthCache = require('../electron/health-cache.cjs')
app.setName('pulseboard-fitbit-desktop')

app.whenReady().then(async () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable.')
    const dir = process.env.OPENFIT_USER_DATA || path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const read = name => {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) return null
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (envelope.encrypted !== true) throw new Error('Expected encrypted local storage.')
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
    }
    const config = read('openfit-cloud.secure.json')
    if (!config?.token) throw new Error('OpenFit is not paired with the cloud API.')
    const result = await cloud.openGym(config)
    const credentials = read('credentials.secure.json')
    const archive = healthCache.normalizeArchive(read('health-cache.secure.json'))
    const recordings = new Map()
    for (const day of Object.values(archive.days)) {
      for (const item of Array.isArray(day.endpoints?.activities?.activities) ? day.endpoints.activities.activities : []) {
        recordings.set(String(item.logId || item.startTime), item)
      }
    }
    console.log(JSON.stringify({
      cloudAuthenticated: true, apiUrl: config.apiUrl,
      serverWorkoutCount: Array.isArray(result.state?.workouts) ? result.state.workouts.length : 0,
      serverRevision: result.rev, exerciseNamesSupported: typeof result.exerciseNames === 'object',
      googleHealthConnected: credentials?.config?.provider === 'google-health' && Boolean(credentials?.token),
      cachedWorkoutRecordings: recordings.size,
      cachedTimedRecordings: [...recordings.values()].filter(item => item.startTime && item.endTime).length,
      ...(process.argv.includes('--schema') ? { workoutSchemas: (result.state?.workouts || []).slice(0, 2).map(w => ({ fields: Object.keys(w), entrySchemas: (w.entries || []).slice(0, 3).map(e => ({ fields: Object.keys(e), snapshot: e.muscleSnapshot || null, setFields: (e.sets || []).slice(0, 2).map(s => Object.keys(s)) })) })) } : {}),
    }))
    app.exit(0)
  } catch (error) { console.error(error.message); app.exit(1) }
})
