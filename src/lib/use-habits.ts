import { useCallback, useEffect, useRef, useState } from 'react'
import type { HabitAction, HabitArchive } from '@/types'
export function useHabits() {
  const [store,setStore]=useState<HabitArchive>({version:1,habits:[]})
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const locked=useRef(false)
  const reload=useCallback(async()=>{
    setLoading(true)
    try { if (!window.habits) throw new Error('Restart OpenFit to enable encrypted habit storage. Browser previews do not save habits.'); setStore(await window.habits.load()); setError('') }
    catch(e) { setError(e instanceof Error ? e.message:'Could not load habits.') }
    finally { setLoading(false) }
  },[])
  useEffect(()=>{void reload()},[reload])
  const perform=useCallback(async(action:HabitAction|'export'|'recover')=>{
    if(locked.current)return false
    locked.current=true;setBusy(true)
    try {
      if(!window.habits)throw new Error('Encrypted habit storage requires the updated desktop app.')
      if(action==='export')await window.habits.export()
      else setStore(action==='recover' ? await window.habits.recover():await window.habits.mutate(action))
      setError('');return true
    }catch(e){setError(e instanceof Error?e.message:'Habit operation failed.');return false}
    finally{locked.current=false;setBusy(false)}
  },[])
  return {store,loading,busy,error,reload,perform}
}
