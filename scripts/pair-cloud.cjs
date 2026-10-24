'use strict'

// A headless Electron task so credentials use the same OS encryption key as OpenFit.
// Supply a fresh device pairing code on stdin, never as a command-line argument.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const cloud = require('../electron/cloud-service.cjs')
app.setName('pulseboard-fitbit-desktop')

function save(file, value) {
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, encrypted: true, data: safeStorage.encryptString(JSON.stringify(value)).toString('base64') }), { mode: 0o600 })
  fs.renameSync(temporary, file)
}

app.whenReady().then(async () => {
  try {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('OS credential encryption is unavailable.')
    const apiUrl = process.argv.find(value => value.startsWith('--api='))?.slice(6) || 'https://api.129-225-66-175.sslip.io'
    const input = readline.createInterface({ input: process.stdin, terminal: false })
    let code = ''
    for await (const line of input) { code = line.trim(); break }
    input.close()
    if (!/^[A-Za-z0-9-]{4,32}$/.test(code)) throw new Error('Supply a fresh Open Gym mobile pairing code on stdin.')
    const config = await cloud.pair(apiUrl, code)
    const profile = await cloud.openGym(config)
    const dir = process.env.OPENFIT_USER_DATA || path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    save(path.join(dir, 'openfit-cloud.secure.json'), config)
    save(path.join(dir, 'open-gym-cache.secure.json'), { apiUrl: config.apiUrl, uid: config.user.id, ...profile, syncedAt: new Date().toISOString() })
    console.log(JSON.stringify({ connected: true, apiUrl: config.apiUrl, workouts: Array.isArray(profile.state?.workouts) ? profile.state.workouts.length : 0, revision: profile.rev }))
    app.exit(0)
  } catch (error) {
    console.error(error.message)
    app.exit(1)
  }
})
