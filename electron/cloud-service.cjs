'use strict'

function baseUrl(value) {
  let url
  try { url = new URL(String(value || '').trim()) } catch { throw new Error('Enter the OpenFit cloud API address.') }
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol !== 'https:' && !loopback) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use an HTTPS cloud address. HTTP is allowed only on this computer for development.')
  }
  return url.origin
}

async function request(config, route, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) }
  if (config?.token) headers.authorization = `Bearer ${config.token}`
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json'
  let response
  try {
    response = await fetch(`${config.apiUrl}${route}`, { ...options, headers, signal: AbortSignal.timeout(30000) })
  } catch {
    throw new Error('OpenFit cloud could not be reached. Your local copy is still available.')
  }
  const refreshed = response.headers.get('x-open-gym-token')
  if (refreshed) config.token = refreshed
  if (response.status === 204) return null
  const text = await response.text()
  let value = null
  try { value = text ? JSON.parse(text) : null } catch { /* include a stable error below */ }
  if (!response.ok) throw Object.assign(new Error(value?.error || `OpenFit cloud returned ${response.status}.`), { status: response.status })
  return value
}

async function pdfRequest(config, route, options = {}) {
  const headers = { ...(options.headers || {}), authorization: `Bearer ${config.token}` }
  let response
  try { response = await fetch(`${config.apiUrl}${route}`, { ...options, headers, signal: AbortSignal.timeout(30000) }) }
  catch { throw new Error('OpenFit cloud could not be reached. Your local copy is still available.') }
  const refreshed = response.headers.get('x-open-gym-token')
  if (refreshed) config.token = refreshed
  if (!response.ok) {
    let error = null
    try { error = await response.json() } catch { /* stable fallback below */ }
    throw new Error(error?.error || `OpenFit cloud returned ${response.status}.`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function pair(apiAddress, code) {
  const apiUrl = baseUrl(apiAddress)
  const result = await request({ apiUrl }, '/v1/pair', { method: 'POST', body: JSON.stringify({ code: String(code || '').trim().toUpperCase() }) })
  if (typeof result?.token !== 'string' || !result.token) throw new Error('The cloud API returned an invalid Open Gym session.')
  const status = await request({ apiUrl, token: result.token }, '/v1/me')
  return { apiUrl, token: status?.token || result.token, user: status?.user || result.user || null }
}

async function status(config) {
  if (!config?.apiUrl || !config?.token) return { connected: false, apiUrl: config?.apiUrl || '', user: null }
  try {
    const result = await request(config, '/v1/me')
    const next = result?.token ? { ...config, token: result.token } : config
    return { connected: true, apiUrl: config.apiUrl, user: result?.user || config.user || null, config: next }
  } catch (error) {
    return { connected: false, apiUrl: config.apiUrl, user: config.user || null, error: error.message }
  }
}

module.exports = {
  baseUrl,
  request,
  pair,
  status,
  openGym: config => request(config, '/v1/open-gym'),
  writeBodyHistory: (config, history) => request(config, '/v1/body-history', { method: 'PUT', body: JSON.stringify({ history }) }),
  writeHealthSnapshot: (config, snapshot) => request(config, '/v1/health-history', { method: 'PUT', body: JSON.stringify({ snapshot }) }),
  getHealthHistorySummary: config => request(config, '/v1/health-history'),
  getHealthSnapshot: (config, date) => request(config, `/v1/health-history?date=${encodeURIComponent(date)}`),
  readArchive: config => request(config, '/v1/archive'),
  writeArchive: (config, archive, baseRev) => request(config, '/v1/archive', { method: 'PUT', body: JSON.stringify({ archive, baseRev }) }),
  getPdf: (config, hash) => pdfRequest(config, `/v1/reports/${hash}`),
  hasPdf: async (config, hash) => {
    const response = await fetch(`${config.apiUrl}/v1/reports/${hash}`, { method: 'HEAD', headers: { authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(30000) })
    const refreshed = response.headers.get('x-open-gym-token')
    if (refreshed) config.token = refreshed
    if (response.status === 404) return false
    if (!response.ok) throw new Error(`OpenFit cloud returned ${response.status}.`)
    return true
  },
  putPdf: (config, hash, bytes) => request(config, `/v1/reports/${hash}`, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: bytes }),
  deletePdf: (config, hash) => request(config, `/v1/reports/${hash}`, { method: 'DELETE' }),
}
