// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import GymSessionDetails from './GymSessionDetails'
import { normalizeGymProfile } from '@/lib/gym-sync'

it('renders interactive anatomy and filters exercise details using mouse and keyboard', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const workout = normalizeGymProfile({ workouts: [{ name: 'Test', entries: [
    { id: 'custom-press', n: 'Custom press', muscleSnapshot: { primaries: ['chest'], secondaries: ['triceps'] }, sets: [{ w: 20, r: 10, done: true, rir: 0 }] },
    { id: 'custom-curl', n: 'Custom curl', muscleSnapshot: { primaries: ['biceps'] }, sets: [{ w: 10, r: 8, done: true }] },
  ] }] }).workouts[0]
  const host = document.createElement('div'), root = createRoot(host)
  document.body.append(host)
  try {
    await act(async () => root.render(<GymSessionDetails workout={workout} unit="kg" timezone="UTC"/>))
    expect(host.querySelectorAll('svg[role="group"]')).toHaveLength(2)
    expect(host.textContent).toContain('RIR 0')
    const chest = host.querySelector('g[role="button"][aria-label^="Chest"]')!
    await act(async () => chest.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.querySelectorAll('.gym-exercise-detail')).toHaveLength(1)
    expect(host.querySelector('.gym-exercise-detail')!.textContent).toContain('Custom press')
    await act(async () => chest.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(host.querySelectorAll('.gym-exercise-detail')).toHaveLength(2)
    const outline = host.querySelector('select')!
    await act(async () => { outline.value = 'female'; outline.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(host.querySelector('svg[role="group"]')!.getAttribute('viewBox')).toBe('0 0 650 1450')
  } finally { await act(async () => root.unmount()); host.remove() }
})
