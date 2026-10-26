import type { DashboardData } from '@/types'
import { calculateSleepScore, SLEEP_SCORE_SOURCES } from '@/lib/sleep-score'
import { compactMinutes, formatDecimal } from '@/lib/format'

export function SleepScoreDetails({ sleep }: { sleep: DashboardData['sleep'] }) {
  const result = calculateSleepScore(sleep)
  return <details className="sleep-score-method">
    <summary>How your OpenFit score works</summary>
    <p>An experimental adult sleep estimate for comparing nights. Research informs the inputs; OpenFit chooses the weights and scoring curves. This is not a validated clinical score or Google’s sleep score.</p>
    {result.value === null ? <p>{result.reason}</p> : <div className="sleep-score-components">
      {result.components.map(part => <div key={part.key}>
        <header><span>{part.label} <small>before timeline deductions</small></span><strong>{formatDecimal(part.score * part.weight / 100, 1)} / {part.weight}</strong></header>
        <progress max={part.weight} value={part.score * part.weight / 100} aria-label={`${part.label} contribution`} />
        <small>{compactMinutes(part.observed)}</small>
      </div>)}
    </div>}
    {result.stageContext.length > 0 && <div className="sleep-score-stages">{result.stageContext.map(stage => <span key={stage.key}><strong>{stage.key === 'rem' ? 'REM' : stage.key === 'deep' ? 'Deep' : 'Light'}</strong> {compactMinutes(stage.minutes)} · {Math.round(stage.percent)}%</span>)}</div>}
    {result.value !== null && <p>Timeline deductions: {formatDecimal(result.fragmentationPenalty, 1)} for wakefulness and {formatDecimal(result.stagePenalty, 1)} for stage indicators. Final estimate: {result.value} / 100.</p>}
    <p>The same timestamped stages shown in Night timeline determine time asleep, awake spells, and deep/light/REM proportions. Normal stage transitions are not counted as awakenings. Only awake spells between sleep blocks count toward fragmentation; adjacent awake segments are merged.</p>
    <p>Efficiency and time in bed are excluded. Light sleep is not penalized by itself. Adult stage indicators flag deep sleep at or below 5% and REM at or above 41%; more deep or REM does not automatically earn more points. Heart rate and HRV are shown separately and do not change the score.</p>
    <details className="sleep-score-formula"><summary>Exact formula · v4</summary><p>Duration base: interpolate minutes → points: 0 → 0, 240 → 25, 360 → 60, 420 → 75, 480 → 100. Internal awake minutes → deduction: 0–20 → 0, 40 → 10, 60 → 20, 120 → 40. Awakenings lasting at least 5 minutes → deduction: 0–1 → 0, 2 → 5, 3 → 10, 4 → 20, 6 → 30. Subtract the larger wake deduction, plus 10 for each flagged stage indicator. Round once and clamp to 0–100. Missing, overlapping, incomplete or inconsistent timelines produce no score.</p><p>Research informs the indicators; point deductions are OpenFit design choices, not a validated clinical formula. This cannot establish how refreshed you should feel. Stage indicators use adult references and are not individualized for age.</p></details>
    <nav aria-label="Sleep score research">{SLEEP_SCORE_SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" onClick={event => { if (window.fitbit) { event.preventDefault(); void window.fitbit.openExternal(source.url) } }}>{source.label} ↗</a>)}</nav>
  </details>
}
