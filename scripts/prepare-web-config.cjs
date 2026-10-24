'use strict'
// Export only server configuration to a private temporary file, never to stdout.
const { app, safeStorage } = require('electron')
const fs = require('node:fs'), path = require('node:path')
const google = require('../electron/google-health-service.cjs')
app.setName('pulseboard-fitbit-desktop')
app.whenReady().then(async () => {
  try {
    const dir = path.join(app.getPath('appData'), 'pulseboard-fitbit-desktop')
    const read = name => { const e = JSON.parse(fs.readFileSync(path.join(dir, name))); if (!e.encrypted || !safeStorage.isEncryptionAvailable()) throw new Error('Secure storage unavailable'); return JSON.parse(safeStorage.decryptString(Buffer.from(e.data, 'base64'))) }
    const credentials = read('credentials.secure.json'), gym = read('openfit-cloud.secure.json')
    const token = await google.refreshAccessToken(credentials.config, credentials.token)
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } })
    if (!response.ok) throw new Error('Could not verify the owner Google account')
    const user = await response.json()
    if (!user.sub) throw new Error('Google did not provide an owner identity')
    const output = process.argv.find(a => a.startsWith('--output='))?.slice(9)
    if (!output) throw new Error('Output path required')
    const config = { OPENFIT_WEB_ORIGIN: 'https://fit.129-225-66-175.sslip.io', OPENFIT_OWNER_SUB: user.sub, GOOGLE_CLIENT_ID: credentials.config.clientId, GOOGLE_CLIENT_SECRET: credentials.config.clientSecret, OPEN_GYM_TOKEN: gym.token, OPENFIT_API_URL: 'http://openfit-cloud:3100' }
    fs.writeFileSync(output, Object.entries(config).map(([k,v]) => { if (typeof v !== 'string' || /[\r\n]/.test(v)) throw new Error('Invalid configuration'); return `${k}=${v}` }).join('\n')+'\n', { mode: 0o600, flag: 'wx' })
    console.log(JSON.stringify({ ownerVerified: true, callback: config.OPENFIT_WEB_ORIGIN + '/auth/google/callback', configurationSaved: true }))
    app.exit(0)
  } catch (e) { console.error(e.message); app.exit(1) }
})
