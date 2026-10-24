import { useCallback, useEffect, useRef, useState } from 'react'
import type { TodoAction, TodoArchive } from '@/types'

export function useTodos() {
  const [store, setStore] = useState<TodoArchive>({ version: 1, tasks: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      if (!window.todos) throw new Error('Restart the desktop app to enable encrypted task storage. Tasks are not saved in the browser preview.')
      setStore(await window.todos.load()); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load tasks.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void reload()
    return window.cloud?.onSync(result => { if (result.ok) void reload() })
  }, [reload])
  const perform = useCallback(async (actions: TodoAction[] | 'import' | 'export' | 'recover') => {
    if (lock.current) return false
    lock.current = true; setBusy(true)
    try {
      const bridge = window.todos
      if (!bridge) throw new Error('Task storage requires the updated desktop app. Restart it to enable tasks.')
      if (Array.isArray(actions)) {
        if (actions.length === 1) setStore(await bridge.mutate(actions[0]))
        else setStore(await bridge.batch(actions))
      } else if (actions === 'export') await bridge.export()
      else setStore(await bridge[actions]())
      setError(''); return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Task operation failed.'); return false }
    finally { lock.current = false; setBusy(false) }
  }, [])
  return { store, loading, error, busy, perform, reload }
}
