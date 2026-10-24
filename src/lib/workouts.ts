import { APP_TIME_ZONE } from './timezone'
import type { ActivityItem, DashboardData } from '../types'
import { offsetDate } from './research-insights'

export const knownNumber = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value) && value >= 0
export function workoutClock(value: string, timezone: string | null) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) return { date:value.slice(0,10), time:value.slice(11,16) }
  const instant=Date.parse(value)
  if (!Number.isFinite(instant)) return {date:'',time:''}
  let formatter: Intl.DateTimeFormat
  try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone || APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}) }
  catch { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}) }
  const parts=formatter.formatToParts(instant), get=(name:string)=>parts.find(part=>part.type===name)?.value || ''
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`}
}
export function workoutMinutes(item:ActivityItem):number|null {
  if (knownNumber(item.activeDurationMinutes)) return item.activeDurationMinutes
  if (knownNumber(item.elapsedDurationMinutes)) return item.elapsedDurationMinutes
  if (item.activeDurationMinutes !== undefined || item.elapsedDurationMinutes !== undefined) return null
  return knownNumber(item.durationMinutes) && item.durationMinutes > 0 ? item.durationMinutes : null
}
export function workoutGroup(item:ActivityItem) { return item.exerciseType || item.name.trim().toLowerCase() }
export function paceLabel(secondsPerKm:number) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm<=0) return '—'
  const seconds=Math.round(secondsPerKm)
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`
}
export type WorkoutMetric = 'duration'|'distance'|'pace'|'heart'
export function workoutMetric(item:ActivityItem, metric:WorkoutMetric):number|null {
  if(metric==='duration') return workoutMinutes(item)
  if(metric==='distance') return knownNumber(item.distanceKm)?item.distanceKm:null
  if(metric==='heart') return knownNumber(item.averageHeartRate)&&item.averageHeartRate>0?item.averageHeartRate:null
  return knownNumber(item.averagePaceSecondsPerMeter)&&item.averagePaceSecondsPerMeter>0?item.averagePaceSecondsPerMeter*1000:null
}
export function collectWorkouts(days:DashboardData[],endDate:string,rangeDays=28) {
  const first=offsetDate(endDate,1-rangeDays), coveredDates=new Set<string>(), items=new Map<string,ActivityItem>(), samples=new Map<string,{timestamp:string;value:number}>()
  // A complete, newer exercise response supersedes older snapshots, including deleted sessions.
  const snapshots=[...days].sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))
  for(const day of snapshots) {
    for(const item of day.activities) {
      if(item.date<first || item.date>endDate || coveredDates.has(item.date) || items.has(item.id)) continue
      items.set(item.id,item)
    }
    const range=day.workoutCoverage
    if(range && /^\d{4}-\d{2}-\d{2}$/.test(range.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate)) {
      for(let i=0;i<rangeDays;i++) { const date=offsetDate(endDate,-i); if(date>=range.startDate && date<=range.endDate)coveredDates.add(date) }
    }
    for(const sample of day.health.heartRateSamples || []) if(!samples.has(sample.timestamp)) samples.set(sample.timestamp,sample)
  }
  return { activities:[...items.values()].sort((a,b)=>`${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)), coveredDates, samples:[...samples.values()] }
}
export function workoutHeartSeries(item:Pick<ActivityItem, 'startTime' | 'endTime'>,samples:Array<{timestamp:string;value:number}>) {
  const absolute=(value:string|null|undefined)=>value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?Date.parse(value):NaN
  const start=absolute(item.startTime), end=absolute(item.endTime)
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>7*86400000)return null
  const duration=(end-start)/60000, bucketMinutes=Math.max(1,Math.ceil(duration/240)), count=Math.ceil(duration/bucketMinutes)
  const bins=Array.from({length:count},()=>({sum:0,count:0}))
  const raw:number[]=[]
  const seen=new Set<string>()
  for(const sample of samples) {
    const time=absolute(sample.timestamp)
    if(!Number.isFinite(time)||time<start||time>=end||!Number.isFinite(sample.value)||sample.value<=0||seen.has(sample.timestamp))continue
    seen.add(sample.timestamp)
    const bin=bins[Math.floor((time-start)/60000/bucketMinutes)]
    if(!bin)continue
    bin.sum+=sample.value;bin.count++;raw.push(sample.value)
  }
  if(raw.length<2)return null
  return {values:bins.map(bin=>bin.count?Math.round(bin.sum/bin.count):null),xValues:bins.map((_,i)=>i*bucketMinutes),labels:bins.map((_,i)=>`${i*bucketMinutes} min`),observedBins:bins.filter(bin=>bin.count).length,totalBins:count,bucketMinutes,min:raw.reduce((a,b)=>Math.min(a,b),Infinity),max:raw.reduce((a,b)=>Math.max(a,b),-Infinity),sampleCount:raw.length}
}
