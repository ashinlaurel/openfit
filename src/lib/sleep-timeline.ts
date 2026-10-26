import type { SleepStageSegment } from '@/types'

// Use the same timestamped stages as the Night timeline. Unknown gaps and
// overlapping intervals cannot be interpreted as either sleep or wakefulness.
export function analyzeSleepTimeline(segments: SleepStageSegment[] = []) {
  if (!segments.length) return null
  const rows = segments.map(segment => ({
    type: segment.type, start: Date.parse(segment.startTime), end: Date.parse(segment.endTime),
  })).sort((a, b) => a.start - b.start)
  if (rows.some(row => !['light', 'deep', 'rem', 'wake'].includes(row.type)
    || !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end <= row.start)) return null
  if (rows.at(-1)!.end - rows[0].start > 1440 * 60000) return null
  for (let i = 1; i < rows.length; i++) {
    if (Math.abs(rows[i].start - rows[i - 1].end) > 1000 || rows[i].start < rows[i - 1].end) return null
  }
  const blocks: typeof rows = []
  for (const row of rows) {
    const previous = blocks.at(-1)
    if (previous?.type === row.type) previous.end = row.end
    else blocks.push({ ...row })
  }
  const totals = { light: 0, deep: 0, rem: 0, wake: 0 }
  blocks.forEach(row => { totals[row.type] += (row.end - row.start) / 60000 })
  const asleepMinutes = totals.light + totals.deep + totals.rem
  // All-light records may be legacy, undifferentiated ASLEEP data.
  if (!asleepMinutes || totals.deep + totals.rem === 0) return null
  const firstSleep = blocks.findIndex(row => row.type !== 'wake')
  let lastSleep = blocks.length - 1
  while (blocks[lastSleep].type === 'wake') lastSleep--
  const internal = blocks.slice(firstSleep, lastSleep + 1)
  const wakes = internal.filter(row => row.type === 'wake').map(row => (row.end - row.start) / 60000)
  let longestSleepMinutes = 0, currentSleepMinutes = 0
  for (const row of internal) {
    if (row.type === 'wake') currentSleepMinutes = 0
    else {
      currentSleepMinutes += (row.end - row.start) / 60000
      longestSleepMinutes = Math.max(longestSleepMinutes, currentSleepMinutes)
    }
  }
  return {
    totals, asleepMinutes,
    awakeMinutes: wakes.reduce((sum, minutes) => sum + minutes, 0),
    awakeEpisodes: wakes.length,
    sustainedAwakenings: wakes.filter(minutes => minutes >= 5).length,
    longestAwakeMinutes: Math.max(0, ...wakes), longestSleepMinutes,
  }
}
