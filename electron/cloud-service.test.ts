import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const cloud = require('./cloud-service.cjs')
let child: ChildProcess, apiUrl: string
const dataDir = mkdtempSync(path.join(tmpdir(), 'openfit-cloud-test-'))
const gym = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === '/api/pair/redeem') return res.end(JSON.stringify({ token: 'test-device-token' }))
  if (req.headers.authorization !== 'Bearer test-device-token') { res.statusCode = 401; return res.end('{"error":"unauthorized"}') }
  if (req.url === '/api/me') return res.end(JSON.stringify({ user: { id: 'test-owner', name: 'Test owner' } }))
  if (req.url === '/api/data') return res.end(JSON.stringify({ state: { workouts: [{ id: 'g1', entries: [{ id: '0025' }, { id: 'unknown-custom' }] }] }, rev: 7 }))
  res.statusCode = 404; res.end('{}')
})
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => { gym.once('error', reject); gym.listen(0, '127.0.0.1', resolve) })
  const address = gym.address()
  if (!address || typeof address === 'string') throw new Error('Test upstream did not start.')
  child = spawn(process.execPath, [path.resolve('cloud/server.mjs')], {
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, OPEN_GYM_API_URL: `http://127.0.0.1:${address.port}`, STORAGE_KEY: randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  apiUrl = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test API startup timed out.')), 5000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Test API exited with ${code}.`)) })
    child.stdout?.on('data', bytes => {
      const match = bytes.toString().match(/listening on (\d+)/)
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`) }
    })
  })
}, 10000)
afterAll(async () => {
  if (child && child.exitCode === null) {
    await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGTERM') })
  }
  await new Promise<void>(resolve => gym.close(() => resolve()))
  rmSync(dataDir, { recursive: true, force: true })
})
describe('OpenFit cloud device connection', () => {
  it('pairs and reads the original profile with display names supplied separately', async () => {
    const config = await cloud.pair(apiUrl, 'PAIRTEST')
    const result = await cloud.openGym(config)
    expect(config.user.id).toBe('test-owner')
    expect(result.rev).toBe(7)
    expect(result.state.workouts[0].entries[0]).toEqual({ id: '0025' })
    expect(result.exerciseNames['0025']).toBe('barbell bench press')
    expect(Object.keys(result.exerciseNames)).toEqual(['0025'])
  })
  it('requires authorization for workout reads and refuses health payloads as archives', async () => {
    expect((await fetch(`${apiUrl}/v1/open-gym`)).status).toBe(401)
    const result = await fetch(`${apiUrl}/v1/archive`, { method: 'PUT', headers: { authorization: 'Bearer test-device-token', 'content-type': 'application/json' }, body: JSON.stringify({ baseRev: 0, archive: { version: 1, source: 'google-health', activities: [] } }) })
    expect(result.status).toBe(400)
  })
})
