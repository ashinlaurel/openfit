// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrinkingView } from './DrinkingView'
import { emptyDrinking, type DrinkingStore } from '@/lib/drinking'
vi.mock('@/components/icons', () => ({ CloseIcon: () => null }))

let host: HTMLDivElement, root: Root, saved: DrinkingStore
const date = '2026-10-25'
const mount = async () => { await act(async () => root.render(<DrinkingView />)) }
async function logBeer() {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === 'Log a drink')!
  await act(async () => button.click())
  await act(async () => document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T06:00:00Z`))
  localStorage.clear()
  localStorage.setItem('openfit:drinking-demo:v1', JSON.stringify({ entries: [{ name: 'Fictional lager', ml: 500 }] }))
  saved = emptyDrinking(date)
  window.drinking = { load: vi.fn(async () => structuredClone(saved)), save: vi.fn(async next => { saved = structuredClone(next); return saved }) }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove(); localStorage.clear(); delete window.drinking; vi.useRealTimers()
})

describe('personal drinking log', () => {
  it('ignores demo storage, saves an actual entry, and restores it after reopening', async () => {
    await mount()
    expect(host.textContent).toContain('None logged')
    expect(host.textContent).not.toContain('Fictional lager')
    expect(host.textContent).not.toContain('dummy data')
    await logBeer()
    expect(saved.entries).toHaveLength(1)
    expect(saved.entries[0]).toMatchObject({ name: 'Beer', ml: 330, abv: 5, date })
    expect(host.querySelector('.drink-entry-list')?.textContent).toContain('Beer')
    await act(async () => root.unmount())
    root = createRoot(host)
    await mount()
    expect(host.querySelector('.drink-entry-list')?.textContent).toContain('Beer')
  })
  it('keeps an unsaved drink in its dialog and reports a failed write', async () => {
    vi.mocked(window.drinking!.save).mockRejectedValue(new Error('Storage unavailable'))
    await mount(); await logBeer()
    expect(saved.entries).toHaveLength(0)
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Storage unavailable')
    expect(host.querySelector('.drink-entry-list')).toBeNull()
  })
})
