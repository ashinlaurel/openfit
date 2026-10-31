import bodyHistory from './body-history.cjs'
import healthHistory from './health-history.cjs'
import healthConnect from './health-connect.cjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const exerciseNames = JSON.parse(fs.readFileSync(path.join(here, 'exercise-names.json'), 'utf8')).names
const port = Number(process.env.PORT || 3100)
const dataDir = path.resolve(process.env.DATA_DIR || path.join(here, 'data'))
const gymUrl = String(process.env.OPEN_GYM_API_URL || '').replace(/\/+$/, '')
const keyText = process.env.STORAGE_KEY || ''
const key = /^[a-f0-9]{64}$/i.test(keyText) ? Buffer.from(keyText, 'hex') : Buffer.from(keyText, 'base64')
const maxArchiveBytes = 40 * 1024 * 1024
const maxHealthArchiveBytes = 100 * 1024 * 1024
const maxPdfBytes = 20 * 1024 * 1024
const writes = new Map()
const pairAttempts = new Map()

if (!gymUrl || !/^https?:\/\//.test(gymUrl)) throw new Error('Set OPEN_GYM_API_URL to the Open Gym server origin.')
if (key.length !== 32) throw new Error('STORAGE_KEY must contain 32 random bytes in hex or base64.')
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })

function response(res, status, value, headers = {}) {
  if (status === 204) {
    res.writeHead(204, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
    return res.end()
  }
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers })
  res.end(body)
}

function encrypt(bytes, aad) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad))
  const data = Buffer.concat([cipher.update(bytes), cipher.final()])
  return Buffer.concat([Buffer.from('OF1'), iv, cipher.getAuthTag(), data])
}

function decrypt(bytes, aad) {
  if (bytes.length < 31 || bytes.subarray(0, 3).toString() !== 'OF1') throw new Error('Encrypted file has an unsupported format.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(3, 15))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(bytes.subarray(15, 31))
  return Buffer.concat([decipher.update(bytes.subarray(31)), decipher.final()])
}

function filePath(uid, name) {
  const dir = path.join(dataDir, uid)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return path.join(dir, name)
}

function readEncrypted(uid, name, aad) {
  try { return decrypt(fs.readFileSync(filePath(uid, name)), `${uid}:${aad}`) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

function writeEncrypted(uid, name, aad, bytes) {
  const target = filePath(uid, name)
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`
  fs.writeFileSync(temporary, encrypt(bytes, `${uid}:${aad}`), { mode: 0o600, flag: 'wx' })
  fs.renameSync(temporary, target)
}

async function body(req, limit) {
  const chunks = []
  let length = 0
  for await (const chunk of req) {
    length += chunk.length
    if (length > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function jsonBody(req, limit = 2 * 1024 * 1024) {
  try { return JSON.parse((await body(req, limit)).toString('utf8')) }
  catch (error) { if (error.status) throw error; throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }) }
}

async function gymRequest(route, token, options = {}) {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json', ...(options.headers || {}) }
  const result = await fetch(`${gymUrl}${route}`, { ...options, headers, signal: AbortSignal.timeout(15000) })
  const text = await result.text()
  let value = null
  try { value = text ? JSON.parse(text) : null } catch { /* handled below */ }
  if (!result.ok) throw Object.assign(new Error(result.status === 401 ? 'Open Gym pairing expired. Pair OpenFit again.' : `Open Gym returned ${result.status}.`), { status: result.status === 401 ? 401 : 502 })
  return value
}

async function identity(req) {
  const authorization = req.headers.authorization || ''
  if (!authorization.startsWith('Bearer ') || authorization.length > 4096) throw Object.assign(new Error('Pair OpenFit with Open Gym first.'), { status: 401 })
  const token = authorization.slice(7).trim()
  const result = await gymRequest('/api/me', token)
  const uid = result?.user?.id
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Object.assign(new Error('Open Gym returned an invalid profile.'), { status: 502 })
  return { uid, token, user: result.user, refreshedToken: result.token || null }
}

function validArchive(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && value.version === 1 && value.todos?.version === 1 && Array.isArray(value.todos.tasks) && value.todos.tasks.length <= 10000
    && value.habits?.version === 1 && Array.isArray(value.habits.habits) && value.habits.habits.length <= 200
    && value.reports?.version === 1 && Array.isArray(value.reports.reports) && value.reports.reports.length <= 500
}

async function serialized(uid, run) {
  const previous = writes.get(uid) || Promise.resolve()
  let release
  const current = new Promise(resolve => { release = resolve })
  const queued = previous.catch(() => {}).then(() => current)
  writes.set(uid, queued)
  await previous
  try { return await run() }
  finally { release(); if (writes.get(uid) === queued) writes.delete(uid) }
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'GET' && url.pathname === '/healthz') return response(res, 200, { ok: true })

  if (req.method === 'POST' && url.pathname === '/v1/pair') {
    const address = req.socket.remoteAddress || 'unknown'
    const now = Date.now(), attempts = (pairAttempts.get(address) || []).filter(time => now - time < 5 * 60_000)
    if (attempts.length >= 10) return response(res, 429, { error: 'Too many pairing attempts. Wait a few minutes and try again.' })
    attempts.push(now)
    pairAttempts.set(address, attempts)
    const input = await jsonBody(req, 4096)
    const code = String(input?.code || '').trim().toUpperCase()
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) return response(res, 400, { error: 'Enter the active Open Gym pairing code.' })
    const result = await fetch(`${gymUrl}/api/pair/redeem`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) })
    const value = await result.json().catch(() => null)
    if (!result.ok || typeof value?.token !== 'string') return response(res, result.status === 400 ? 400 : 502, { error: result.status === 400 ? 'That pairing code is invalid or expired.' : 'Could not pair with Open Gym.' })
    const check = await gymRequest('/api/me', value.token)
    return response(res, 200, { token: value.token, user: check?.user || value.user })
  }

  if (!url.pathname.startsWith('/v1/')) return response(res, 404, { error: 'Not found.' })
  let account
  try { account = await identity(req) }
  catch (error) { return response(res, error.status || 502, { error: error.message }) }
  res.setHeader('x-open-gym-token', account.refreshedToken || account.token)

  if (req.method === 'GET' && url.pathname === '/v1/me') {
    return response(res, 200, { user: account.user, token: account.refreshedToken })
  }
  if (req.method === 'GET' && url.pathname === '/v1/open-gym') {
    try {
      const result = await gymRequest('/api/data', account.token)
      const ids = new Set((Array.isArray(result?.state?.workouts) ? result.state.workouts : []).flatMap(w => Array.isArray(w?.entries) ? w.entries.map(e => e?.id).filter(id => typeof id === 'string') : []))
      const names = Object.fromEntries([...ids].filter(id => Object.hasOwn(exerciseNames, id)).map(id => [id, exerciseNames[id]]))
      return response(res, 200, { ...result, exerciseNames: names })
    }
    catch (error) { return response(res, error.status || 502, { error: error.message }) }
  }
  if (url.pathname === '/v1/health-connect' && ['GET', 'POST'].includes(req.method)) {
    let incoming = null
    if (req.method === 'POST') incoming = healthConnect.validate(await jsonBody(req, 6 * 1024 * 1024))
    return serialized(account.uid, async () => {
      const bytes = readEncrypted(account.uid, 'health-connect.enc', 'health-connect')
      const current = bytes ? JSON.parse(bytes.toString('utf8')) : null
      const next = incoming ? healthConnect.merge(current, incoming) : current
      if (incoming) {
        const data = Buffer.from(JSON.stringify(next))
        if (data.length > 50 * 1024 * 1024) return response(res, 507, { error: 'Health Connect archive has reached its storage limit.' })
        writeEncrypted(account.uid, 'health-connect.enc', 'health-connect', data)
      }
      return response(res, 200, { summary: healthConnect.summary(next) })
    })
  }
  if (url.pathname === '/v1/body-history' && ['GET', 'PUT'].includes(req.method)) {
    let incoming = null
    if (req.method === 'PUT') {
      try { incoming = (await jsonBody(req, 5 * 1024 * 1024)).history }
      catch (error) { return response(res, error.status || 400, { error: error.message }) }
      if (incoming?.version !== 1 || !incoming.days || typeof incoming.days !== 'object' || Array.isArray(incoming.days) || Object.keys(incoming.days).length > 40000 || JSON.stringify(bodyHistory.normalize(incoming)) !== JSON.stringify(incoming)) return response(res, 400, { error: 'Invalid body measurement history.' })
    }
    return serialized(account.uid, async () => {
      try {
        const bytes = readEncrypted(account.uid, 'body-history.enc', 'body-history')
        const current = bodyHistory.withoutHealthConnect(bytes ? JSON.parse(bytes.toString('utf8')) : null)
        const history = incoming ? bodyHistory.merge(current, bodyHistory.withoutHealthConnect(incoming)) : current
        if (incoming) writeEncrypted(account.uid, 'body-history.enc', 'body-history', Buffer.from(JSON.stringify(history)))
        const nativeBytes = readEncrypted(account.uid, 'health-connect.enc', 'health-connect')
        const native = nativeBytes ? healthConnect.bodyHistory(JSON.parse(nativeBytes.toString('utf8'))) : null
        return response(res, 200, { history: bodyHistory.merge(history, native) })
      } catch { return response(res, 500, { error: 'Could not access the encrypted body history.' }) }
    })
  }
  if (url.pathname === '/v1/health-history' && ['GET', 'PUT'].includes(req.method)) {
    let incoming = null
    if (req.method === 'PUT') {
      try { incoming = (await jsonBody(req, healthHistory.MAX_SNAPSHOT_BYTES + 4096)).snapshot }
      catch (error) { return response(res, error.status || 400, { error: error.message }) }
      if (!incoming || JSON.stringify(healthHistory.cleanSnapshot(incoming)) !== JSON.stringify(incoming)) return response(res, 400, { error: 'Invalid Google Health snapshot.' })
    }
    return serialized(account.uid, async () => {
      try {
        const bytes = readEncrypted(account.uid, 'health-history.enc', 'health-history')
        if (bytes?.length > maxHealthArchiveBytes) return response(res, 507, { error: 'The encrypted health archive exceeds its storage limit.' })
        const current = bytes ? healthHistory.normalize(JSON.parse(bytes.toString('utf8'))) : healthHistory.normalize(null)
        if (req.method === 'GET') {
          const date = url.searchParams.get('date')
          if (date) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return response(res, 400, { error: 'Invalid health archive date.' })
            return response(res, 200, { snapshot: current.snapshots[date] || null })
          }
          return response(res, 200, { summary: healthHistory.summary(current) })
        }
        const history = healthHistory.merge(current, { version: 1, snapshots: { [incoming.date]: incoming } })
        const serialized = Buffer.from(JSON.stringify(history))
        if (serialized.length > maxHealthArchiveBytes) return response(res, 507, { error: 'The encrypted health archive has reached its storage limit.' })
        writeEncrypted(account.uid, 'health-history.enc', 'health-history', serialized)
        return response(res, 200, { summary: healthHistory.summary(history), storedDate: incoming.date })
      } catch { return response(res, 500, { error: 'Could not access the encrypted health archive.' }) }
    })
  }
  if (url.pathname === '/v1/archive' && req.method === 'GET') {
    try {
      const data = readEncrypted(account.uid, 'archive.enc', 'archive')
      const archive = data ? JSON.parse(data.toString('utf8')) : { version: 1, todos: { version: 1, tasks: [] }, habits: { version: 1, habits: [] }, reports: { version: 1, reports: [] } }
      return response(res, 200, { archive, rev: archive.rev || 0 })
    } catch (error) { console.error('archive read failed', account.uid, error.message); return response(res, 500, { error: 'Could not read the encrypted OpenFit archive.' }) }
  }
  if (url.pathname === '/v1/archive' && req.method === 'PUT') {
    let input
    try { input = await jsonBody(req, maxArchiveBytes) }
    catch (error) { return response(res, error.status || 400, { error: error.message }) }
    if (!validArchive(input.archive) || !Number.isSafeInteger(input.baseRev) || input.baseRev < 0) return response(res, 400, { error: 'Archive or revision is invalid.' })
    return serialized(account.uid, async () => {
      let current = { version: 1, todos: { version: 1, tasks: [] }, habits: { version: 1, habits: [] }, reports: { version: 1, reports: [] }, rev: 0 }
      try { const data = readEncrypted(account.uid, 'archive.enc', 'archive'); if (data) current = JSON.parse(data.toString('utf8')) }
      catch (error) { console.error('archive read failed', account.uid, error.message); return response(res, 500, { error: 'Could not read the encrypted OpenFit archive.' }) }
      if (input.baseRev !== (current.rev || 0)) return response(res, 409, { error: 'Archive changed on another device.', archive: current, rev: current.rev || 0 })
      const next = { version: 1, todos: input.archive.todos, habits: input.archive.habits, reports: input.archive.reports, rev: (current.rev || 0) + 1 }
      try { writeEncrypted(account.uid, 'archive.enc', 'archive', Buffer.from(JSON.stringify(next))); return response(res, 200, { archive: next, rev: next.rev }) }
      catch (error) { console.error('archive write failed', account.uid, error.message); return response(res, 500, { error: 'Could not save the encrypted OpenFit archive.' }) }
    })
  }

  const reportMatch = /^\/v1\/reports\/([a-f0-9]{64})$/.exec(url.pathname)
  if (reportMatch) {
    const hash = reportMatch[1]
    if (req.method === 'HEAD') {
      const exists = fs.existsSync(filePath(account.uid, `report-${hash}.enc`))
      res.writeHead(exists ? 200 : 404, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      return res.end()
    }
    if (req.method === 'GET') {
      try {
        const data = readEncrypted(account.uid, `report-${hash}.enc`, `report:${hash}`)
        if (!data) return response(res, 404, { error: 'Source PDF is not stored in the cloud archive.' })
        res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': data.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
        return res.end(data)
      } catch (error) { console.error('PDF read failed', account.uid, error.message); return response(res, 500, { error: 'Could not read the encrypted source PDF.' }) }
    }
    if (req.method === 'PUT') {
      let data
      try { data = await body(req, maxPdfBytes) }
      catch (error) { return response(res, error.status || 400, { error: error.message }) }
      if (data.subarray(0, 5).toString() !== '%PDF-' || crypto.createHash('sha256').update(data).digest('hex') !== hash) return response(res, 400, { error: 'PDF did not match its content hash.' })
      try { writeEncrypted(account.uid, `report-${hash}.enc`, `report:${hash}`, data); return response(res, 204, {}) }
      catch (error) { console.error('PDF write failed', account.uid, error.message); return response(res, 500, { error: 'Could not save the encrypted source PDF.' }) }
    }
    if (req.method === 'DELETE') {
      try { fs.rmSync(filePath(account.uid, `report-${hash}.enc`), { force: true }); return response(res, 204, {}) }
      catch (error) { console.error('PDF delete failed', account.uid, error.message); return response(res, 500, { error: 'Could not delete the source PDF.' }) }
    }
  }
  return response(res, 404, { error: 'Not found.' })
}

const server = http.createServer(async (req, res) => {
  try { await handle(req, res) }
  catch (error) { console.error('request failed', error.message); if (!res.headersSent) response(res, error.status || 500, { error: error.status ? error.message : 'Request failed.' }); else res.destroy() }
})
server.listen(port, '0.0.0.0', () => console.log(`OpenFit cloud API listening on ${server.address().port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
