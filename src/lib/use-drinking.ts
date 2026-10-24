import { useEffect, useRef, useState } from 'react'
import { localIso } from '@/data/demo'
import { webMode } from './web-bridge'
import { DRINKING_STORAGE_KEY, emptyDrinking, readDrinking, validateDrinking, type DrinkingStore } from './drinking'

export function useDrinking() {
  const [store, setStore] = useState(() => emptyDrinking(localIso()))
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const locked = useRef(false)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (window.fitbit && !webMode && !window.drinking) throw new Error('Restart OpenFit to open your personal drinking log.')
        const next = window.drinking ? await window.drinking.load() : readDrinking(localIso())
        validateDrinking(next, localIso())
        if (!window.drinking) localStorage.setItem(DRINKING_STORAGE_KEY, JSON.stringify(next))
        if (active) { setStore(next); setReady(true) }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : 'Unable to open your drinking log.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [])
  const update = async (next: DrinkingStore) => {
    if (!ready || locked.current) return false
    locked.current = true; setBusy(true)
    try {
      validateDrinking(next, localIso())
      if (window.drinking) next = await window.drinking.save(next)
      else localStorage.setItem(DRINKING_STORAGE_KEY, JSON.stringify(next))
      setStore(next); setError(''); return true
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save your drink.'); return false }
    finally { locked.current = false; setBusy(false) }
  }
  return { store, loading, busy, error, ready, update }
}
