import type { WorkoutLinks } from './gym-sync'
import type { RawFitbitPayload, RawHealthArchive, TodoArchive } from '@/types'
import { localIso } from '@/data/demo'
const hostedWebMode = document.querySelector('meta[name="openfit-mode"]')?.getAttribute('content') === 'web'
export const webMode = !window.fitbit && (import.meta.env.VITE_OPENFIT_WEB === 'true' || hostedWebMode)
export const sharedReportsMode = webMode && location.pathname === '/shared-reports'
const noop = () => () => {}
const unavailable = async (): Promise<never> => { throw new Error('This feature is available in the Mac app.') }
let archive: RawHealthArchive = { version: 2, lastDate: null, days: {} }
export function emptyWebHealth(date = localIso()): RawFitbitPayload { return { source: 'google-health', date, generatedAt: new Date().toISOString(), endpoints: {}, errors: [], rateLimit: { limit: null, remaining: null, resetSeconds: null } } }
export async function webRpc<T>(method: string, ...args: unknown[]): Promise<T> {
  const response = await fetch('/web/rpc', { method: 'POST', headers: { 'content-type': 'application/json', 'x-openfit-request': '1' }, body: JSON.stringify({ method, args }) })
  if (response.status === 401) { location.assign('/'); throw new Error('Please sign in again.') }
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Request failed.')
  return value as T
}
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function choose(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept
    input.onchange = () => { resolve(input.files?.[0] || null); input.remove() }
    input.oncancel = () => { resolve(null); input.remove() }
    input.click()
  })
}
async function base64(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a PDF smaller than 20 MB.')
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the file.')); reader.readAsDataURL(file) })
}
const syncListeners = new Set<(value: {ok:boolean}) => void>()
function notify() { for (const callback of syncListeners) callback({ ok: true }) }
async function mutation<T>(method: string, ...args: unknown[]): Promise<T> { const result = await webRpc<T>(method, ...args); notify(); return result }
export function installWebBridge() {
  if (!webMode) return
  if (sharedReportsMode) {
    const token = location.hash.slice(1)
    const shared = async <T,>(input: unknown): Promise<T> => {
      const response = await fetch('/share-api', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', 'x-openfit-request': '1', authorization: `Bearer ${token}` }, body: JSON.stringify(input) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || 'Could not open shared reports.')
      return value
    }
    window.reports = {
      load: () => shared({ action: 'load' }), preview: input => shared({ action: 'preview', reportId: input.reportId, page: input.page }),
      choose: unavailable, edit: unavailable, ocr: unavailable, assist: unavailable, cancel: unavailable, discard: unavailable, save: unavailable, archive: unavailable, export: unavailable, recover: unavailable, onProgress: noop,
    }
    return
  }
  if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  let links: WorkoutLinks = {}
  try { links = JSON.parse(sessionStorage.getItem('openfit-workout-links') || '{}') } catch { /* empty */ }
  window.fitbit = {
    getStatus: () => webRpc('health.status'), saveConfig: unavailable,
    getBodyHistory: () => webRpc('health.bodyHistory'),
    connect: async () => { location.assign('/auth/health'); return { ok: true } },
    disconnect: async () => { archive = { version: 2, lastDate: null, days: {} }; return webRpc('health.disconnect') },
    sync: async date => { const day = await webRpc<RawFitbitPayload>('health.sync', date); archive.days[date] = day; archive.lastDate = date; return day },
    getCachedData: date => date === undefined ? webRpc<RawFitbitPayload | null>('health.cached') : webRpc<RawFitbitPayload | null>('health.cached', date),
    getCachedArchive: async () => { archive = await webRpc<RawHealthArchive>('health.archive'); return archive },
    exportData: async () => { download('openfit-health.json', archive); return { canceled: false } },
    openExternal: async url => { if (new URL(url).protocol !== 'https:') throw new Error('HTTPS links only.'); window.open(url, '_blank', 'noopener,noreferrer') },
    onAuthComplete: noop, onSyncProgress: noop,
  }
  window.cloud = {
    getStatus: () => webRpc('cloud.status'), pair: unavailable, disconnect: unavailable,
    getOpenGym: () => webRpc('cloud.gym'), getWorkoutLinks: async () => links,
    saveWorkoutLink: async input => { if (input.mode === 'auto') delete links[input.gymId]; else links[input.gymId] = input.mode === 'unlink' ? null : input.healthId!; sessionStorage.setItem('openfit-workout-links', JSON.stringify(links)); return { ...links } },
    getArchive: () => webRpc('archive.get'), saveArchive: unavailable,
    getPdf: hash => webRpc('pdf.get', hash), savePdf: unavailable, deletePdf: unavailable,
    onSync: callback => { syncListeners.add(callback); return () => { syncListeners.delete(callback) } },
  }
  window.todos = {
    load: () => webRpc('todos.load'), mutate: action => mutation('todos.mutate', action), batch: actions => mutation('todos.batch', actions), recover: unavailable,
    export: async () => download('openfit-todos.json', await webRpc('todos.load')),
    import: async () => { const file = await choose('.json'); return file ? mutation<TodoArchive>('todos.import', JSON.parse(await file.text())) : webRpc<TodoArchive>('todos.load') },
  }
  window.habits = { load: () => webRpc('habits.load'), mutate: action => mutation('habits.mutate', action), recover: unavailable, export: async () => download('openfit-habits.json', await webRpc('habits.load')) }
  window.reports = {
    load: () => webRpc('reports.load'), choose: async () => { const file = await choose('.pdf'); return file ? webRpc('reports.choose', file.name, await base64(file)) : null },
    edit: id => webRpc('reports.edit', id), ocr: id => webRpc('reports.ocr', id), assist: unavailable,
    cancel: () => webRpc('reports.cancel'), discard: id => webRpc('reports.discard', id), save: (id, input) => mutation('reports.save', id, input), archive: (id, archived) => mutation('reports.archive', id, archived), preview: input => webRpc('reports.preview', input),
    export: async () => download('openfit-reports.json', await webRpc('reports.load')), recover: unavailable, onProgress: noop,
  }
  window.addEventListener('focus', notify)
}
