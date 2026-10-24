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
        <header><span>{part.label} <small>{part.weight}% weight</small></span><strong>{formatDecimal(part.score * part.weight / 100, 1)} / {part.weight}</strong></header>
        <progress max={part.weight} value={part.score * part.weight / 100} aria-label={`${part.label} contribution`} />
        <small>{part.unit === 'min' ? compactMinutes(part.observed) : `${formatDecimal(part.observed, 1)}% asleep during the recorded period`}</small>
      </div>)}
    </div>}
    {result.stageContext.length > 0 && <div className="sleep-score-stages">{result.stageContext.map(stage => <span key={stage.key}><strong>{stage.key === 'rem' ? 'REM' : stage.key === 'deep' ? 'Deep' : 'Light'}</strong> {compactMinutes(stage.minutes)} · {Math.round(stage.percent)}%</span>)}</div>}
    <p>Light, deep and REM describe your night; they do not add or remove points. Wearable stage estimates vary in accuracy, and stage proportions vary with age. Missing stages are never treated as zero-quality sleep.</p>
    <p>Duration contributes up to 60 points, reaching its maximum at 8 hours. Continuity contributes up to 40, reaching its maximum at 95% efficiency. Longer sleep earns no extra points and is not automatically penalized. Sleep-onset zeros, HRV and stage counts are excluded.</p>
    <details className="sleep-score-formula"><summary>Exact formula · v1</summary><p>Interpolate linearly between duration anchors (minutes → component score): 0 → 0, 240 → 25, 360 → 60, 420 → 85, 480 → 100. Continuity anchors (% asleep → component score): 0 → 0, 50 → 0, 75 → 60, 85 → 90, 95 → 100, 100 → 100. Final score = round(0.6 × duration + 0.4 × continuity). Both inputs are required; missing or contradictory data produces no score.</p><p>V1 describes the main recorded sleep period. It does not assess naps, daytime alertness, how refreshed you feel, or medical conditions. A score of 100 means the selected reference values were reached, not perfect sleep.</p></details>
    <nav aria-label="Sleep score research">{SLEEP_SCORE_SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" onClick={event => { if (window.fitbit) { event.preventDefault(); void window.fitbit.openExternal(source.url) } }}>{source.label} ↗</a>)}</nav>
  </details>
}
