'use strict'
// Read-only verification of desktop archives against the authenticated VM copy.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const cloud = require('../electron/cloud-service.cjs')
app.setName('pulseboard-fitbit-desktop')
app.whenReady().then(async () => {
  try {
    const dir = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const read = name => {
      const file = path.join(dir, name)
      if (!fs.existsSync(file)) return null
      const envelope = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!envelope.encrypted || !safeStorage.isEncryptionAvailable()) throw new Error('Encrypted storage unavailable')
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
    }
    const config = read('openfit-cloud.secure.json')
    if (!config?.token) throw new Error('Cloud pairing unavailable')
    const remote = await cloud.readArchive(config)
    const result = { revision: remote.rev, archives: {}, pdfs: { total: 0, verified: 0 } }
    for (const [kind, file, field] of [['todos', 'todos.secure.json', 'tasks'], ['habits', 'habits.secure.json', 'habits'], ['reports', 'reports.secure.json', 'reports']]) {
      const localRows = read(file)?.[field] || []
      const remoteRows = remote.archive[kind]?.[field] || []
      const key = row => kind === 'reports' ? row.hash : row.id
      const map = new Map(remoteRows.map(row => [key(row), row]))
      result.archives[kind] = { local: localRows.length, cloud: remoteRows.length,
        localRecordsMatchCloud: localRows.every(row => JSON.stringify(row) === JSON.stringify(map.get(key(row)))) }
    }
    for (const report of remote.archive.reports.reports) {
      result.pdfs.total++
      const bytes = await cloud.getPdf(config, report.hash)
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== report.hash) throw new Error('Cloud PDF integrity mismatch')
      result.pdfs.verified++
    }
    console.log(JSON.stringify(result, null, 2))
    app.exit(0)
  } catch (error) { console.error(error.message); app.exit(1) }
})
