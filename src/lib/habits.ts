import type { Habit } from '../types'
export function shiftDay(date: string, offset: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10)
}
export function isScheduled(habit: Habit, date: string) {
  if (date < habit.createdDate) return false
  // Preserve a completed day even if its schedule is edited or archived later that day.
  if (habit.checkins[date]) return true
  const schedule=habit.schedules.filter(s=>s.from<=date).sort((a,b)=>a.from.localeCompare(b.from)).at(-1)
  return Boolean(schedule?.days.includes(new Date(`${date}T12:00:00Z`).getUTCDay()))
}
export function habitStats(habit: Habit, today: string) {
  let current=0, best=0, run=0, due=0, done=0
  for (let date=habit.createdDate; date<=today; date=shiftDay(date,1)) {
    if (!isScheduled(habit,date)) continue
    const checked=Boolean(habit.checkins[date])
    if (date>=shiftDay(today,-27)) { due++; if (checked) done++ }
    if (checked) { run++; best=Math.max(best,run) }
    else if (date!==today) run=0
  }
  current=run
  return { current,best,due,done,rate:due ? Math.round(done/due*100):null,total:Object.keys(habit.checkins).filter(d=>d<=today).length }
}
export function dayProgress(habits: Habit[], date: string) {
  const due=habits.filter(h=>isScheduled(h,date))
  const done=due.filter(h=>h.checkins[date]).length
  return { due:due.length,done,rate:due.length ? Math.round(done/due.length*100):0 }
}
