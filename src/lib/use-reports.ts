import { useCallback,useEffect,useRef,useState } from 'react'
import type { ReportArchive,ReportDraft,ReportProgress,ReportSaveInput } from '@/types'
export function useReports(){
  const [store,setStore]=useState<ReportArchive>({version:1,reports:[]})
  const [draft,setDraft]=useState<ReportDraft|null>(null)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState<ReportProgress|null>(null)
  const locked=useRef(false)
  const load=useCallback(async()=>{setLoading(true);try{if(!window.reports)throw new Error('Restart the desktop app to enable medical report storage.');setStore(await window.reports.load());setError('')}catch(error){setError(error instanceof Error?error.message:'Unable to open reports.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load();return window.reports?.onProgress(setProgress)},[load])
  const run=useCallback(async<T,>(operation:()=>Promise<T>):Promise<T|null>=>{
    if(locked.current)return null
    locked.current=true;setBusy(true);setError('');setProgress(null)
    try{return await operation()}catch(error){setError(error instanceof Error?error.message:'Report operation failed.');return null}finally{locked.current=false;setBusy(false);setProgress(null)}
  },[])
  const bridge=()=>{if(!window.reports)throw new Error('Medical report storage requires the desktop app.');return window.reports}
  const choose=useCallback(()=>run(async()=>{const next=await bridge().choose();if(next)setDraft(next);return next}),[run])
  const edit=useCallback((id:string)=>run(async()=>{const next=await bridge().edit(id);setDraft(next);return next}),[run])
  const extract=useCallback((kind:'ocr'|'assist',id:string)=>run(async()=>{const next=await bridge()[kind](id);setDraft(next);return next}),[run])
  const save=useCallback((id:string,input:ReportSaveInput)=>run(async()=>{setStore(await bridge().save(id,input));setDraft(null);return true}),[run])
  const archive=useCallback((id:string,archived:boolean)=>run(async()=>{setStore(await bridge().archive(id,archived));return true}),[run])
  const perform=useCallback((kind:'export'|'recover')=>run(async()=>{if(kind==='recover')setStore(await bridge().recover());else await bridge().export();return true}),[run])
  const discard=useCallback(async()=>{if(!draft||locked.current)return;try{await bridge().discard(draft.id);setDraft(null);setError('')}catch(error){setError(error instanceof Error?error.message:'Could not close the draft.')}},[draft])
  return {store,draft,loading,busy,error,progress,choose,edit,extract,save,archive,perform,discard,reload:load,cancel:()=>window.reports?.cancel()}
}
