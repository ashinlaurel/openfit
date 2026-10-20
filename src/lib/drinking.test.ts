import { describe,it,expect } from 'vitest'
import { alcoholUnits,alcoholGrams,weekStart,seedDrinking,sumUnits,validDrink,isAlcoholFree,completedDryStreak } from './drinking'
describe('drinking calculations and demo integrity',()=>{
 it('uses ABV percent, not a fraction, and totals each pour',()=>{
  expect(alcoholUnits(500,5)).toBe(2.5)
  expect(alcoholUnits(30,40)).toBe(1.2)
  expect(alcoholGrams(500,5)).toBeCloseTo(19.725)
  expect(alcoholUnits(330,0)).toBe(0)
 })
 it('starts a calendar week on Monday across month and year boundaries',()=>{
  expect(weekStart('2026-10-19')).toBe('2026-10-19')
  expect(weekStart('2026-10-25')).toBe('2026-10-19')
  expect(weekStart('2026-01-01')).toBe('2025-12-29')
 })
 it('defaults missing entries to alcohol-free and keeps future days separate',()=>{
  const demo=seedDrinking('2026-10-19')
  expect(isAlcoholFree(demo.entries,'2026-10-19','2026-10-19')).toBe(true)
  expect(isAlcoholFree(demo.entries,'2026-10-20','2026-10-19')).toBe(false)
  expect(demo.entries.some(e=>demo.dryDays.includes(e.date))).toBe(false)
  expect(demo.entries.every(e=>validDrink(e,'2026-10-19'))).toBe(true)
  expect(sumUnits(demo.entries)).toBeGreaterThan(0)
 })
 it('updates dry streaks when entries are added, edited or deleted, bounded by tracking start',()=>{
  const entry={id:'one',name:'Test',date:'2026-10-17',ml:330,abv:5,note:''}
  expect(completedDryStreak([], '2026-10-15','2026-10-19')).toBe(4)
  expect(completedDryStreak([entry], '2026-10-15','2026-10-19')).toBe(1)
  expect(isAlcoholFree([entry],entry.date,'2026-10-19')).toBe(false)
  expect(isAlcoholFree([{...entry,abv:0}],entry.date,'2026-10-19')).toBe(true)
  expect(completedDryStreak([{...entry,date:'2026-10-19'}], '2026-10-15','2026-10-19')).toBe(4)
 })
 it('rejects invalid dates, strengths and volumes while allowing zero ABV',()=>{
  const drink={id:'test',name:'Test',date:'2026-10-19',ml:330,abv:0,note:''}
  expect(validDrink(drink,'2026-10-19')).toBe(true)
  for(const patch of [{date:'2026-02-30'},{date:'2026-10-20'},{abv:101},{abv:-1},{ml:0},{ml:Infinity}])expect(validDrink({...drink,...patch},'2026-10-19')).toBe(false)
 })
})
