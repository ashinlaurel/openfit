import { useCallback, useEffect, useRef, useState } from 'react'
import type { CloudBridge, CloudStatus } from '@/types'
import { normalizeGymProfile, type WorkoutLinks, type WorkoutLinkInput } from './gym-sync'

type Snapshot = Awaited<ReturnType<CloudBridge['getOpenGym']>>
export function useGymProfile(status: CloudStatus, refreshKey: number) {
  const key = JSON.stringify([status.configured, status.apiUrl, status.user?.id])
  const [saved, setSaved] = useState<{ key: string; snapshot: Snapshot; links: WorkoutLinks } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const linkVersion = useRef(0)
  const currentKey = useRef(key)
  currentKey.current = key
  useEffect(() => {
    let active = true, pending = false
    if (!status.configured) { setLoading(false); setError(''); return }
    setLoading(true)
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true; setRefreshing(true)
      const version = linkVersion.current
      try {
        if (!window.cloud?.getOpenGym || !window.cloud.getWorkoutLinks) throw new Error('Restart OpenFit to enable the updated Open Gym connection.')
        const [snapshot, links] = await Promise.all([window.cloud.getOpenGym(), window.cloud.getWorkoutLinks()])
        if (active) {
          setSaved(previous => ({ key, snapshot, links: version === linkVersion.current && !savingRef.current ? links : previous?.key === key ? previous.links : links }))
          setError('')
        }
      } catch (value) {
        if (active) setError(value instanceof Error ? value.message : 'Could not refresh Open Gym.')
      } finally { pending = false; if (active) { setLoading(false); setRefreshing(false) } }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30000)
    const resume = () => void refresh()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      active = false; window.clearInterval(timer)
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [key, status.configured, refreshKey])
  const saveLink = useCallback(async (input: WorkoutLinkInput) => {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    linkVersion.current += 1
    try {
      if (!window.cloud?.saveWorkoutLink) throw new Error('Restart OpenFit to save workout links.')
      const links = await window.cloud.saveWorkoutLink(input)
      if (currentKey.current === key) { setSaved(previous => previous?.key === key ? { ...previous, links } : previous); setError('') }
    } catch (value) { if (currentKey.current === key) setError(value instanceof Error ? value.message : 'Could not save this link.') }
    finally { savingRef.current = false; setSaving(false) }
  }, [key])
  const current = saved?.key === key ? saved : null
  return { profile: normalizeGymProfile(current?.snapshot.state, current?.snapshot.exerciseNames), snapshot: current?.snapshot || null, links: current?.links || {}, loading, refreshing, error, saving, saveLink }
}
