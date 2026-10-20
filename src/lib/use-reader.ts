import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReaderAction, ReaderArchive } from '@/types'
export type ReaderOperation = { type: 'save' | 'subscribe'; url: string } | { type: 'refresh'; id?: string } | { type: 'fetch'; id: string } | { type: 'mutate'; action: ReaderAction } | { type: 'export' | 'recover' }
export function useReader() {
  const [store, setStore] = useState<ReaderArchive>({version:1, articles:[], feeds:[]})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(0)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      if (!window.reader) throw new Error('Reader requires the desktop app. Restart OpenFit after updating to enable it.')
      setStore(await window.reader.load()); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your reading library.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  const perform = useCallback(async (operation: ReaderOperation): Promise<{ articleId?: string } | null> => {
    pending.current++; setBusy(true)
    try {
      const bridge = window.reader
      if (!bridge) throw new Error('Reader storage is unavailable. Restart the desktop app.')
      let next: ReaderArchive | undefined
      let articleId: string | undefined
      if (operation.type === 'save') { const result = await bridge.save(operation.url); next = result.store; articleId = result.articleId }
      else if (operation.type === 'subscribe') next = await bridge.subscribe(operation.url)
      else if (operation.type === 'refresh') next = await bridge.refresh(operation.id)
      else if (operation.type === 'fetch') next = await bridge.fetchArticle(operation.id)
      else if (operation.type === 'mutate') next = await bridge.mutate(operation.action)
      else if (operation.type === 'recover') next = await bridge.recover()
      else await bridge.export()
      if (next) setStore(next)
      setError(''); return { articleId }
    } catch(e) { setError(e instanceof Error ? e.message : 'Reader operation failed.'); return null }
    finally { pending.current--; setBusy(pending.current > 0) }
  }, [])
  return { store, loading, busy, error, reload, perform }
}
