import { describe, expect, it } from 'vitest'
import type { ActivityItem, DashboardData } from '../types'
import { createDemoData } from '../data/demo'
import { collectWorkouts, paceLabel, workoutClock, workoutHeartSeries, workoutMinutes } from './workouts'
const item=(patch:Partial<ActivityItem>={}):ActivityItem=>({id:'workout-1',name:'Walk',date:'2026-06-22',time:'09:00',durationMinutes:30,calories:null,distanceKm:null,averageHeartRate:null,zoneMinutes:null,steps:null,averagePaceSecondsPerMeter:null,heartZoneMinutes:null,...patch})
const day=(patch:Partial<DashboardData>={}):DashboardData=>({...createDemoData('2026-06-22'),source:'google-health',generatedAt:'2026-06-22T12:00:00Z',activities:[],workoutCoverage:null,...patch})
describe('Workout analysis',()=>{
  it('preserves explicit zero active duration and distinguishes missing duration',()=>{
    expect(workoutMinutes(item({activeDurationMinutes:0,elapsedDurationMinutes:30}))).toBe(0)
    expect(workoutMinutes(item({activeDurationMinutes:null,elapsedDurationMinutes:34}))).toBe(34)
    expect(workoutMinutes(item({activeDurationMinutes:null,elapsedDurationMinutes:null}))).toBeNull()
    expect(workoutMinutes(item())).toBe(30)
    expect(workoutMinutes(item({durationMinutes:0}))).toBeNull()
  })
  it('uses the profile timezone for instants, and preserves provider local clock values',()=>{
    expect(workoutClock('2026-06-22T23:30:00Z','Asia/Kolkata')).toEqual({date:'2026-06-23',time:'05:00'})
    expect(workoutClock('2026-06-22T23:30:00','Asia/Kolkata')).toEqual({date:'2026-06-22',time:'23:30'})
    expect(workoutClock('not a timestamp','UTC')).toEqual({date:'',time:''})
    expect(workoutClock('2026-06-22T23:30:00Z','invalid')).toEqual({date:'2026-06-22',time:'23:30'})
  })
  it('matches exact session timestamps, averages within minute bins and preserves recording gaps',()=>{
    const workout=item({startTime:'2026-06-22T09:00:00+02:00',endTime:'2026-06-22T09:05:00+02:00'})
    const series=workoutHeartSeries(workout,[
      {timestamp:'2026-06-22T06:59:59Z',value:200},
      {timestamp:'2026-06-22T07:00:00Z',value:100},
      {timestamp:'2026-06-22T07:00:30Z',value:120},
      {timestamp:'2026-06-22T07:03:00Z',value:130},
      {timestamp:'2026-06-22T07:03:00Z',value:130},
      {timestamp:'2026-06-22T07:04:00Z',value:0},
      {timestamp:'2026-06-22T07:05:00Z',value:220},
    ])!
    expect(series.values).toEqual([110,null,null,130,null])
    expect(series.observedBins).toBe(2)
    expect(series.sampleCount).toBe(3)
    expect(series.min).toBe(100)
    expect(series.max).toBe(130)
    expect(workoutHeartSeries(item(),[])).toBeNull()
  })
  it('handles midnight and DST changes using absolute session boundaries',()=>{
    const series=workoutHeartSeries(item({startTime:'2026-11-01T01:30:00-04:00',endTime:'2026-11-01T01:30:00-05:00'}),[
      {timestamp:'2026-11-01T05:30:00Z',value:100},{timestamp:'2026-11-01T06:29:00Z',value:110},
    ])!
    expect(series.totalBins).toBe(60)
    expect(series.values[59]).toBe(110)
  })
  it('lets a complete newer snapshot remove stale sessions without treating unknown days as rest',()=>{
    const old=day({generatedAt:'2026-06-22T08:00:00Z',activities:[item()],workoutCoverage:{startDate:'2026-06-22',endDate:'2026-06-22'}})
    const newest=day({generatedAt:'2026-06-22T12:00:00Z',activities:[],workoutCoverage:{startDate:'2026-06-22',endDate:'2026-06-22'}})
    expect(collectWorkouts([old,newest],'2026-06-22').activities).toEqual([])
    expect(collectWorkouts([old,newest],'2026-06-22').coveredDates.size).toBe(1)
    const unknown=collectWorkouts([day({activities:[item()]})],'2026-06-22')
    expect(unknown.activities).toHaveLength(1)
    expect(unknown.coveredDates.size).toBe(0)
  })
  it('deduplicates overlapping cached workout windows and excludes future and out-of-range records',()=>{
    const result=collectWorkouts([day({activities:[item(),item({id:'old',date:'2026-01-01'}),item({id:'future',date:'2026-06-23'})]}),day({activities:[item()]})],'2026-06-22')
    expect(result.activities.map(row=>row.id)).toEqual(['workout-1'])
    expect(paceLabel(359.8)).toBe('6:00')
  })
})
