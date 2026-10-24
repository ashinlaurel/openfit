import { useEffect, useMemo, useState } from 'react'
import type { DashboardData } from '@/types'
import { normalizeFitbitData } from '@/data/normalize'
import { collectWorkouts } from './workouts'
import { offsetDate } from './research-insights'
export function useWorkoutHistory(data:DashboardData,includeAdjacentDays=false) {
  const key=`${data.source}:${data.selectedDate}:${data.generatedAt}:${includeAdjacentDays}`
  const [history,setHistory]=useState<{key:string;days:DashboardData[];error:boolean}|null>(null)
  useEffect(()=>{
    let cancelled=false
    if(data.source==='demo'||!window.fitbit) {setHistory({key,days:[],error:false});return}
    void window.fitbit.getCachedArchive().then(archive=>{
      const first=offsetDate(data.selectedDate,-28)
      const days=Object.values(archive.days).filter(day=>day.date>=first && day.date<=offsetDate(data.selectedDate,1)).map(normalizeFitbitData)
      if(!cancelled)setHistory({key,days,error:false})
    }).catch(()=>{if(!cancelled)setHistory({key,days:[],error:true})})
    return()=>{cancelled=true}
  },[key,data.source,data.selectedDate])
  const ready=history?.key===key
  // Gym matching needs a one-day margin: two recordings of a midnight session can
  // start on different calendar dates. The visible gym period remains 28 days.
  const result=useMemo(()=>collectWorkouts([data,...(ready?history.days.filter(day=>day.selectedDate!==data.selectedDate):[])],includeAdjacentDays?offsetDate(data.selectedDate,1):data.selectedDate,includeAdjacentDays?30:28),[data,ready,history,includeAdjacentDays])
  return {...result,loading:!ready,error:ready&&history.error,firstDate:offsetDate(data.selectedDate,-27)}
}
