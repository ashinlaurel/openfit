'use strict'

// Import a downloaded OAuth Web client into the desktop's OS-encrypted storage.
// Google sign-in continues through the existing app flow; this task never signs in.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.setName('pulseboard-fitbit-desktop')
app.whenReady().then(() => {
  try {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('OS credential encryption is unavailable.')
    const file = process.argv.find(value => value.startsWith('--client='))?.slice(9)
    if (!file) throw new Error('Specify the downloaded OAuth client JSON with --client=PATH.')
    const client = JSON.parse(fs.readFileSync(file, 'utf8')).web
    const redirectUri = 'http://127.0.0.1:42813/oauth/callback'
    if (!client?.client_id || !client?.client_secret || !client.redirect_uris?.includes(redirectUri)) throw new Error('Expected a Google OAuth Web client with the OpenFit loopback callback registered.')
    const config = { provider: 'google-health', clientId: client.client_id, clientSecret: client.client_secret, redirectUri }
    const dir = process.env.OPENFIT_USER_DATA || path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const target = path.join(dir, 'credentials.secure.json')
    let previous = null
    if (fs.existsSync(target)) {
      const envelope = JSON.parse(fs.readFileSync(target, 'utf8'))
      if (envelope.encrypted !== true) throw new Error('Expected encrypted credential storage.')
      previous = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.data, 'base64')))
    }
    const same = previous?.config?.provider === config.provider && previous?.config?.clientId === config.clientId
    const credentials = { config, token: same ? previous.token : null, lastSyncAt: same ? previous.lastSyncAt : null }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    const temporary = `${target}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, encrypted: true, data: safeStorage.encryptString(JSON.stringify(credentials)).toString('base64') }), { mode: 0o600 })
    fs.renameSync(temporary, target)
    console.log(JSON.stringify({ configured: true, provider: 'google-health', redirectUri, connected: Boolean(credentials.token) }))
    app.exit(0)
  } catch (error) { console.error(error.message); app.exit(1) }
})
