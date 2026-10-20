import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { dayProgress, habitStats, isScheduled, shiftDay } from '../src/lib/habits'
const require=createRequire(import.meta.url)
const {emptyStore,mutate}=require('./habit-store.cjs')
const habit={title:'Read',note:'Ten pages',color:'mint',icon:'book',days:[1,2,3,4,5]}
function setup(date='2026-10-12'){return mutate(emptyStore(),{type:'create',habit},date)}

describe('habit schedules, persistence actions and streaks',()=>{
  it('skips rest days, keeps today open, and breaks a streak after a missed scheduled day',()=>{
    let store=setup('2026-10-16') // Friday
    const id=store.habits[0].id
    store=mutate(store,{type:'checkin',id,date:'2026-10-16'},'2026-10-16')
    expect(habitStats(store.habits[0],'2026-10-19').current).toBe(1) // Monday still open
    expect(habitStats(store.habits[0],'2026-10-20').current).toBe(0)
    store=mutate(store,{type:'checkin',id,date:'2026-10-19'},'2026-10-19')
    expect(habitStats(store.habits[0],'2026-10-19')).toMatchObject({current:2,best:2,rate:100})
    expect(isScheduled(store.habits[0],'2026-10-18')).toBe(false)
  })
  it('reverses check-ins without double counting and rejects future, pre-creation and off-schedule dates',()=>{
    let store=setup(),id=store.habits[0].id
    store=mutate(store,{type:'checkin',id,date:'2026-10-12'},'2026-10-19')
    expect(dayProgress(store.habits,'2026-10-12')).toEqual({due:1,done:1,rate:100})
    store=mutate(store,{type:'checkin',id,date:'2026-10-12'},'2026-10-19')
    expect(habitStats(store.habits[0],'2026-10-19').total).toBe(0)
    for(const date of ['2026-10-20','2026-10-09','2026-10-18','2026-02-30'])expect(()=>mutate(store,{type:'checkin',id,date},'2026-10-19')).toThrow()
  })
  it('preserves historical schedules when editing and pausing, and counts archived check-ins in history',()=>{
    let store=setup(),id=store.habits[0].id
    store=mutate(store,{type:'checkin',id,date:'2026-10-12'},'2026-10-12')
    store=mutate(store,{type:'update',id,habit:{...habit,days:[0,6]}},'2026-10-13')
    expect(isScheduled(store.habits[0],'2026-10-12')).toBe(true)
    expect(isScheduled(store.habits[0],'2026-10-14')).toBe(false)
    store=mutate(store,{type:'archive',id},'2026-10-16')
    expect(isScheduled(store.habits[0],'2026-10-17')).toBe(false)
    expect(dayProgress(store.habits,'2026-10-12').done).toBe(1)
    store=mutate(store,{type:'restore',id},'2026-10-19')
    expect(isScheduled(store.habits[0],'2026-10-18')).toBe(false)
    expect(isScheduled(store.habits[0],'2026-10-24')).toBe(true)
  })
  it('preserves a completed day when archiving on the same day',()=>{
    let store=setup(),id=store.habits[0].id
    store=mutate(store,{type:'checkin',id,date:'2026-10-12'},'2026-10-12')
    store=mutate(store,{type:'archive',id},'2026-10-12')
    expect(dayProgress(store.habits,'2026-10-12')).toEqual({due:1,done:1,rate:100})
    expect(habitStats(store.habits[0],'2026-10-13').best).toBe(1)
  })
  it('uses calendar arithmetic through month boundaries and validates schedules',()=>{
    expect(shiftDay('2026-03-01',-1)).toBe('2026-02-28')
    expect(shiftDay('2024-03-01',-1)).toBe('2024-02-29')
    expect(()=>mutate(emptyStore(),{type:'create',habit:{...habit,days:[]}})).toThrow()
    expect(()=>mutate(emptyStore(),{type:'create',habit:{...habit,color:'evil'}})).toThrow()
  })
})
