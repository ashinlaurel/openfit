import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { cookies, digest, random, sameOrigin, ownerIdentity, validDate } from './security.mjs'
const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const modules = fs.existsSync(path.join(here, 'electron')) ? path.join(here, 'electron') : path.resolve(here, '../../electron')
const healthCache = require(path.join(modules, 'health-cache.cjs'))
const google = require(path.join(modules, 'google-health-service.cjs'))
const cloud = require(path.join(modules, 'cloud-service.cjs'))
const todos = require(path.join(modules, 'todo-store.cjs'))
const habits = require(path.join(modules, 'habit-store.cjs'))
const reports = require(path.join(modules, 'report-store.cjs'))
const origin = process.env.OPENFIT_WEB_ORIGIN
const ownerSub = process.env.OPENFIT_OWNER_SUB
const key = Buffer.from(process.env.STORAGE_KEY || '', 'hex')
const oauth = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: `${origin}/auth/google/callback` }
if (!origin || new URL(origin).protocol !== 'https:' || !ownerSub || !oauth.clientId || !oauth.clientSecret || key.length !== 32) throw new Error('Private web configuration is incomplete')
const dataDir = process.env.DATA_DIR || path.join(here, 'data')
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
const stateFile = path.join(dataDir, 'web-state.enc')
function readState() {
  if (!fs.existsSync(stateFile)) return { sessions: {}, health: null, links: {} }
  const b = fs.readFileSync(stateFile), decipher = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12))
  decipher.setAAD(Buffer.from('openfit-private-web-v1')); decipher.setAuthTag(b.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]))
}
let state = readState()
const config = { apiUrl: process.env.OPENFIT_API_URL || 'http://openfit-cloud:3100', token: state.gymToken || process.env.OPEN_GYM_TOKEN }
if (!config.token) throw new Error('Open Gym server pairing is required')
function persist() {
  state.gymToken = config.token
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('openfit-private-web-v1'))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state)), cipher.final()])
  fs.writeFileSync(stateFile + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 })
  fs.renameSync(stateFile + '.tmp', stateFile)
}
const pending = new Map(), drafts = new Map(), workers = new Map()
let mutationQueue = Promise.resolve(), healthQueue = Promise.resolve()
function json(res, code, value) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)) }
function redirect(res, location) { res.writeHead(302, { location, 'cache-control': 'no-store' }); res.end() }
function cookie(res, name, value, seconds) { res.setHeader('set-cookie', `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`) }
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
async function body(req, limit = 30 * 1024 * 1024) {
  let size = 0; const chunks = []
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail('Upload is too large.', 413); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString()) } catch { throw fail('Invalid JSON request.') }
}
function session(req) {
  const token = cookies(req)['__Host-openfit'], id = token && digest(token), value = id && state.sessions[id]
  return value && value.expires > Date.now() ? { id, ...value } : null
}
async function identity(token) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw fail('Google identity could not be verified.', 403)
  const user = await response.json()
  if (!ownerIdentity(user, ownerSub)) throw fail('This website is private to its owner.', 403)
  return user
}
async function readArchive() { const result = await cloud.readArchive(config); persist(); return result }
async function mutateArchive(change) {
  const operation = mutationQueue.then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await readArchive(), next = await change(structuredClone(remote.archive))
      todos.validateStore(next.todos); habits.validateStore(next.habits); reports.validateStore(next.reports)
      try { const saved = await cloud.writeArchive(config, next, remote.rev); persist(); return saved.archive }
      catch (error) { if (error.status !== 409 || attempt === 3) throw error }
    }
  })
  mutationQueue = operation.catch(() => {})
  return operation
}
function healthStatus() { return { isElectron: false, configured: true, connected: Boolean(state.health), provider: 'google-health', clientId: '', redirectUri: oauth.redirectUri, hasClientSecret: true, storageEncrypted: true, lastSyncAt: healthCache.latestDay(state.healthArchive)?.generatedAt || null } }
async function syncHealth(date) {
  if (!validDate(date) || date > new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) throw fail('Choose a valid date.')
  const job = healthQueue.then(async () => {
    if (!state.health) throw fail('Connect Google Health in Settings first.')
    if (state.health.expiresAt < Date.now() + 60000) {
      try { state.health = await google.refreshAccessToken(oauth, state.health); persist() }
      catch { state.health = null; persist(); throw fail('Google Health authorization expired. Reconnect in Settings.') }
    }
    const token = state.health.access_token
    const payload = await google.syncData(token, date)
    if (!state.health || state.health.access_token !== token) throw fail('Health connection changed during sync.')
    const stats = payload.requestStats
    const measurements = stats?.successfulKeys?.some(name => /Daily$|IntradayRaw$|sleepRaw|activitiesRaw|restingHeartRaw|hrvRaw|spo2Raw|breathingRaw/.test(name))
    if (!stats || stats.succeeded < Math.max(3, Math.ceil(stats.total * .2)) || !measurements) throw fail('Google Health could not refresh your data. Saved data has been kept.', 502)
    state.healthArchive = healthCache.storeDay(state.healthArchive, payload)
    persist()
    return payload
  })
  healthQueue = job.then(() => undefined, () => undefined)
  return job
}
let warmingHealthWeek = false
async function warmHealthWeek() {
  if (warmingHealthWeek || !state.health) return
  warmingHealthWeek = true
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    for (const date of healthCache.recentMissingDates(state.healthArchive, today)) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (!state.health) break
      if (healthCache.recentMissingDates(state.healthArchive, today).includes(date)) await syncHealth(date)
    }
  } catch { /* Retry missing days on the next foreground sync; keep saved data. */ }
  finally { warmingHealthWeek = false }
}
async function processPdf(bytes, sid, action = 'extract', page = 1, forceOcr = false) {
  if (workers.size) throw fail('Another PDF is processing. Try again shortly.', 409)
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(modules, 'reports-worker.cjs'), { workerData: { bytes, action, page, forceOcr }, resourceLimits: { maxOldGenerationSizeMb: 384 } })
    workers.set(sid, worker)
    const timer = setTimeout(() => { void worker.terminate() }, 180000)
    let finished = false
    const done = (error, result) => { if (finished) return; finished = true; clearTimeout(timer); workers.delete(sid); void worker.terminate(); error ? reject(error) : resolve(result) }
    worker.on('message', message => { if (message.error) done(fail(message.error)); else if (message.result) done(null, message.result) })
    worker.on('error', () => done(fail('PDF processing failed.')))
    worker.on('exit', () => done(fail('PDF processing stopped.')))
  })
}
function draftFor(id, sid) { const d = drafts.get(id); if (!d || d.sid !== sid || d.expires < Date.now()) throw fail('Reopen the report to continue.'); return d }
function publicDraft(d) { const { bytes, hash, sid, expires, pages, ...safe } = d; return safe }
async function makeDraft(bytes, fileName, sid, existing = null, result = null) {
  for (const [id, draft] of drafts) if (draft.sid === sid || draft.expires < Date.now()) drafts.delete(id)
  const extracted = result || await processPdf(bytes, sid)
  const d = { ...extracted, id: random(), sid, expires: Date.now() + 3600000, bytes, hash: digest(bytes), fileName, title: existing?.title || fileName.replace(/\.pdf$/i, ''), detectedDate: existing?.date || extracted.detectedDate, existingId: existing?.id || null }
  drafts.set(d.id, d); return publicDraft(d)
}
const shareFile = path.join(dataDir, 'report-share.json')
function createReportShare() {
  const token = random()
  fs.writeFileSync(shareFile + '.tmp', JSON.stringify({ tokenHash: digest(token), createdAt: new Date().toISOString() }), { mode: 0o600 })
  fs.renameSync(shareFile + '.tmp', shareFile)
  return { url: `${origin}/shared-reports#${token}` }
}
async function sharedReports(req, res) {
  if (req.method !== 'POST' || !sameOrigin(req, origin)) return json(res, 403, { error: 'Request origin was not accepted.' })
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '')
  const share = fs.existsSync(shareFile) ? JSON.parse(fs.readFileSync(shareFile, 'utf8')) : null
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !share || digest(token) !== share.tokenHash) return json(res, 403, { error: 'This report link is invalid or has been revoked.' })
  const input = await body(req, 4096)
  if (!['load', 'preview'].includes(input.action)) return json(res, 403, { error: 'Shared reports are read-only.' })
  const archive = (await readArchive()).archive.reports
  const active = archive.reports.filter(report => !report.archived)
  if (input.action === 'load') {
    // Rebuild defaults from visible records so archived-only markers are not exposed.
    const visible = { version: 1, reports: active }
    return json(res, 200, { ...visible, referenceDefaults: reports.referenceDefaults(visible) })
  }
  const report = active.find(report => report.id === input.reportId)
  if (!report || !Number.isInteger(input.page) || input.page < 1 || input.page > report.pageCount) return json(res, 404, { error: 'Report page not found.' })
  return json(res, 200, await processPdf(await cloud.getPdf(config, report.hash), 'shared-preview', 'preview', input.page))
}
async function rpc(method, args, auth) {
  if (method === 'reports.share') return createReportShare()
  if (method === 'reports.revokeShare') { fs.rmSync(shareFile, { force: true }); return { ok: true } }

  if (method === 'health.status') return healthStatus()
  if (method === 'health.bodyHistory') {
    const result = await cloud.request(config, '/v1/body-history')
    persist()
    return { history: result.history, configured: true, syncedAt: new Date().toISOString(), error: null }
  }
  if (method === 'health.cached') {
    if (args[0] !== undefined && !validDate(args[0])) throw fail('Invalid cache date.')
    return args[0] === undefined ? healthCache.latestDay(state.healthArchive) : healthCache.cachedDay(state.healthArchive, args[0])
  }
  if (method === 'health.archive') return healthCache.normalizeArchive(state.healthArchive)
  if (method === 'health.sync') { const result = await syncHealth(args[0]); void warmHealthWeek(); return result }
  if (method === 'health.disconnect') { state.health = null; delete state.healthArchive; persist(); return healthStatus() }
  if (method === 'cloud.status') { const s = await cloud.status(config); if (!s.connected) throw fail(s.error || 'Gym connection unavailable.', 502); return { configured: true, apiUrl: origin, user: s.user } }
  if (method === 'cloud.gym') return { ...await cloud.openGym(config), syncedAt: new Date().toISOString() }
  if (method === 'cloud.links') return state.links || {}
  if (method === 'cloud.link') {
    const input = args[0]
    if (!input || typeof input.gymId !== 'string' || input.gymId.length > 200 || !['auto', 'unlink', 'link'].includes(input.mode)) throw fail('Invalid workout link.')
    // Google Health record IDs remain browser-local; web bridge handles these.
    throw fail('Workout links are kept on this device.')
  }
  if (method === 'archive.get') return readArchive()
  if (method === 'pdf.get') { if (!/^[a-f0-9]{64}$/.test(args[0])) throw fail('Invalid report.'); return (await cloud.getPdf(config, args[0])).toString('base64') }
  if (method === 'todos.load' || method === 'habits.load' || method === 'reports.load') return (await readArchive()).archive[method.split('.')[0]]
  if (method === 'todos.mutate' || method === 'todos.batch') {
    const actions = method.endsWith('batch') ? args[0] : [args[0]]
    if (!Array.isArray(actions) || !actions.length || actions.length > 100) throw fail('Invalid task actions.')
    if (actions.some(a => a?.type === 'purge')) throw fail('Permanent deletion is available in the Mac app.')
    return (await mutateArchive(a => { for (const action of actions) a.todos = todos.mutate(a.todos, action); return a })).todos
  }
  if (method === 'todos.import') {
    const imported = todos.validateStore(args[0])
    return (await mutateArchive(a => { const ids = new Set(a.todos.tasks.map(t => t.id)); a.todos.tasks.push(...imported.tasks.filter(t => !ids.has(t.id))); return a })).todos
  }
  if (method === 'habits.mutate') return (await mutateArchive(a => { a.habits = habits.mutate(a.habits, args[0]); return a })).habits
  if (method === 'reports.choose') {
    const [fileName, encoded] = args
    if (typeof encoded !== 'string' || typeof fileName !== 'string') throw fail('Choose a PDF.')
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-') throw fail('Choose a PDF smaller than 20 MB.')
    const existing = (await readArchive()).archive.reports.reports.find(r => r.hash === digest(bytes))
    return makeDraft(bytes, path.basename(fileName).slice(0, 200), auth.id, existing)
  }
  if (method === 'reports.edit') {
    const report = (await readArchive()).archive.reports.reports.find(r => r.id === args[0])
    if (!report) throw fail('Report not found.', 404)
    return makeDraft(await cloud.getPdf(config, report.hash), report.fileName, auth.id, report, { pageCount: report.pageCount, detectedDate: report.date, observations: report.observations, pages: [], warnings: ['Review changes before saving.'] })
  }
  if (method === 'reports.ocr') { const d = draftFor(args[0], auth.id); Object.assign(d, await processPdf(d.bytes, auth.id, 'extract', 1, true)); return publicDraft(d) }
  if (method === 'reports.cancel') { await workers.get(auth.id)?.terminate(); return null }
  if (method === 'reports.discard') { const d = draftFor(args[0], auth.id); drafts.delete(d.id); return null }
  if (method === 'reports.save') {
    const d = draftFor(args[0], auth.id)
    // Validate before uploading. Re-run against the latest index on revision conflicts.
    reports.save((await readArchive()).archive.reports, d, args[1])
    await cloud.putPdf(config, d.hash, d.bytes)
    const saved = (await mutateArchive(a => { a.reports = reports.save(a.reports, d, args[1]); return a })).reports
    drafts.delete(d.id); return saved
  }
  if (method === 'reports.archive') return (await mutateArchive(a => { a.reports = reports.archive(a.reports, args[0], args[1]); return a })).reports
  if (method === 'reports.preview') {
    const input = args[0]; let bytes, pages
    if (input?.draftId) { const d = draftFor(input.draftId, auth.id); bytes = d.bytes; pages = d.pageCount }
    else { const r = (await readArchive()).archive.reports.reports.find(r => r.id === input?.reportId); if (!r) throw fail('Report not found.', 404); bytes = await cloud.getPdf(config, r.hash); pages = r.pageCount }
    if (!Number.isInteger(input.page) || input.page < 1 || input.page > pages) throw fail('Invalid page.')
    return processPdf(bytes, auth.id, 'preview', input.page)
  }
  throw fail('This operation is available in the Mac app.', 400)
}
async function handle(req, res) {
  const url = new URL(req.url, origin), auth = session(req)
  if (url.pathname === '/share-api') return sharedReports(req, res)
  if (url.pathname === '/shared-reports') res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true })
  if (req.method === 'GET' && url.pathname === '/web/session') return json(res, 200, { authenticated: Boolean(auth), name: auth?.name || null })
  if (req.method === 'GET' && ['/auth/google', '/auth/health'].includes(url.pathname)) {
    const health = url.pathname === '/auth/health'
    if (health && !auth) return redirect(res, '/auth/google')
    for (const [id, flow] of pending) if (flow.expires < Date.now()) pending.delete(id)
    if (pending.size > 100) throw fail('Please try again shortly.', 429)
    const nonce = random(), pkce = google.createPkce()
    pending.set(digest(nonce), { pkce, health, sid: auth?.id, expires: Date.now() + 600000 })
    cookie(res, '__Host-openfit-oauth', nonce, 600)
    const target = new URL(google.createAuthorizationUrl(oauth, nonce, pkce))
    if (!health) { target.searchParams.set('scope', 'openid email profile'); target.searchParams.set('prompt', 'select_account'); target.searchParams.delete('access_type'); target.searchParams.set('include_granted_scopes', 'false') }
    else target.searchParams.set('scope', [...google.scopes, 'email'].join(' '))
    return redirect(res, target.toString())
  }
  if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
    const nonce = url.searchParams.get('state'), browserNonce = cookies(req)['__Host-openfit-oauth']
    const flow = nonce && nonce === browserNonce && pending.get(digest(nonce))
    if (nonce) pending.delete(digest(nonce))
    cookie(res, '__Host-openfit-oauth', '', 0)
    if (!flow || flow.expires < Date.now() || !url.searchParams.get('code') || (flow.health && auth?.id !== flow.sid)) return redirect(res, '/?authError=failed')
    try {
      const token = await google.exchangeAuthorizationCode(oauth, url.searchParams.get('code'), flow.pkce.verifier)
      const user = await identity(token)
      if (flow.health) {
        const check = await fetch('https://health.googleapis.com/v4/users/me/identity', { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) })
        if (!check.ok) throw fail('Google Health is not linked.')
        state.health = { ...token, refresh_token: token.refresh_token || state.health?.refresh_token }; persist()
      } else {
        const id = random()
        for (const [sid, value] of Object.entries(state.sessions)) if (value.expires < Date.now()) delete state.sessions[sid]
        if (Object.keys(state.sessions).length >= 30) delete state.sessions[Object.keys(state.sessions)[0]]
        state.sessions[digest(id)] = { name: user.given_name || 'Owner', expires: Date.now() + 30 * 86400000 }
        persist(); cookie(res, '__Host-openfit', id, 30 * 86400)
      }
      return redirect(res, '/')
    } catch { return redirect(res, '/?authError=failed') }
  }
  if (url.pathname.startsWith('/web/')) {
    if (!auth) return json(res, 401, { error: 'Sign in to continue.' })
    if (req.method !== 'POST' || !sameOrigin(req, origin)) return json(res, 403, { error: 'Request origin was not accepted.' })
    if (url.pathname === '/web/logout') { delete state.sessions[auth.id]; persist(); cookie(res, '__Host-openfit', '', 0); return json(res, 200, { ok: true }) }
    if (url.pathname === '/web/rpc') { const input = await body(req); if (typeof input.method !== 'string' || !Array.isArray(input.args)) throw fail('Invalid request.'); return json(res, 200, await rpc(input.method, input.args, auth)) }
    return json(res, 404, { error: 'Not found.' })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' })
  const publicDir = path.resolve(here, 'public'), requested = path.resolve(publicDir, '.' + decodeURIComponent(url.pathname))
  if (!requested.startsWith(publicDir + path.sep) && requested !== publicDir) return json(res, 404, { error: 'Not found.' })
  const file = fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(publicDir, 'index.html')
  const ext = path.extname(file), mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.apk': 'application/vnd.android.package-archive' }[ext] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': mime, 'cache-control': ext === '.html' || ext === '.webmanifest' || path.basename(file) === 'sw.js' ? 'no-store' : 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" })
  if (req.method === 'HEAD') return res.end()
  if (file === path.join(publicDir, 'index.html')) {
    const html = fs.readFileSync(file, 'utf8').replace('</head>', '<meta name="openfit-mode" content="web"></head>')
    return res.end(html)
  }
  fs.createReadStream(file).pipe(res)
}
http.createServer((req, res) => { handle(req, res).catch(error => { if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'The request could not be completed. Please try again.' }); else res.destroy() }) }).listen(Number(process.env.PORT || 3200), '0.0.0.0')
