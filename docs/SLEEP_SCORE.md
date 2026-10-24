# OpenFit sleep score v1

`openfit-sleep-v1` is an experimental, deterministic 0–100 description of the
main recorded sleep period for adult self-comparison. It is not Google's/Fitbit's
sleep score, a validated clinical instrument, a probability of good health, or a
diagnosis. Provider scores remain separate and are never overwritten. No attempt
was made to fit this score to the user's reported Fitbit score of 72.

## Evidence and its limits

- Watson et al. (2015), AASM/SRS consensus, recommends regularly obtaining at
  least seven hours for adults aged 18–60. Its methodology discusses 7–9 hours
  and situations where more than nine hours can be appropriate.
  https://pubmed.ncbi.nlm.nih.gov/26039963/
  https://pubmed.ncbi.nlm.nih.gov/26235159/
- Ohayon et al. (2017), National Sleep Foundation consensus, supports sleep
  continuity measures as dimensions of sleep quality; ≥85% efficiency was an
  agreed indicator of good quality. It does not validate our points or weights.
  https://pubmed.ncbi.nlm.nih.gov/28346153/
- Chinoy et al. (2021) compared seven consumer devices against polysomnography
  and found inconsistent sleep-stage performance. This is evidence for caution,
  not a validation or accuracy estimate for the user's current device.
  https://pubmed.ncbi.nlm.nih.gov/33378539/
- Ohayon et al. (2004) shows age-related changes in sleep architecture, another
  reason not to impose a universal optimal REM/deep/light mix.
  https://pubmed.ncbi.nlm.nih.gov/15586779/

All weights, interpolation anchors, the eight-hour saturation point, rounding,
and validation tolerances below are **OpenFit engineering choices**. The papers
inform the dimensions and broad references; they do not supply this algorithm.
The score has not been calibrated against next-day functioning or clinical
outcomes. Adult defaults are not appropriate pediatric recommendations and are
not individualized sleep needs. Do not infer that an eight-hour night must be
better than seven for a particular person.

## Calculation

1. Require finite sleep duration greater than zero and no more than 1,440 minutes.
2. Prefer unrounded `100 × minutesAsleep / timeInBed`. The adapter's `timeInBed`
   is Google's recorded sleep-period length, which can omit unrecorded time awake
   before or after sleep; this ratio can therefore overestimate true in-bed
   efficiency. If that period is absent, accept finite reported efficiency in
   `(0,100]`. If a period exists but contradicts duration, return no score rather
   than hiding the contradiction with reported efficiency.
3. Linearly interpolate each component through these anchors, saturating above
   the last anchor:

| Duration (minutes) | Component score |
| --- | --- |
| 0 | 0 |
| 240 | 25 |
| 360 | 60 |
| 420 | 85 |
| 480 | 100 |

| Efficiency (%) | Component score |
| --- | --- |
| 0 | 0 |
| 50 | 0 |
| 75 | 60 |
| 85 | 90 |
| 95 | 100 |
| 100 | 100 |

4. `score = round(0.60 × durationComponent + 0.40 × continuityComponent)`.
   Round once at the end. Both components are required; no missing-data weight
   redistribution, no fabricated zeros, and no confidence percentage.

No extra reward or automatic penalty is applied to longer durations beyond
eight hours. This does not establish that long sleep is healthy. A 100 only
means these two chosen reference values were reached. A four-hour night with
perfect measured efficiency scores 55, so efficiency cannot erase short sleep.

For the previously inspected Oct 24 record (430 asleep / 444 recorded minutes),
the duration component is 87.5 and continuity is 100. The result is **93**.
This intentionally does not reproduce Google's 72, which uses a different model.

## Stages and omitted inputs

Light, deep and REM durations are shown as context, with percentages when there
is exactly one finite nonnegative value per stage and their sum matches sleep
duration within max(5 minutes, 2%). Missing or inconsistent stage summaries
produce no stage percentages. All-light summaries are also excluded because
legacy undifferentiated ASLEEP records can be mapped to light by the adapter.
They do not affect the duration/continuity score.
No universal stage quota is used and light sleep is not treated as inferior.

Sleep-onset latency and after-waking zeros are excluded: Google's automatically
detected logs can default to zero without measuring the user's intention to
sleep. Awake time already affects efficiency; adding another weighted awake-time
component would double count it. Stage counts do not reliably identify the
consensus measure of awakenings lasting over five minutes. HRV, oxygen,
temperature, naps, regularity and subjective refreshment are not included in v1.
https://developers.google.com/health/data-types/sleep#sleep-onset-latency

## Provenance and comparisons

Implementation: `src/lib/sleep-score.ts`. The result includes a version, input
source, component contributions, and an unavailable reason. UI and assistant
context explicitly label it as an OpenFit estimate. Daily, weekly and historical
charts use the same version and ratio whenever the recorded period is available.
Older history may have only rounded reported efficiency, so small differences
are possible; missing nights remain gaps. Existing encrypted archives are read
and scored locally without rewriting provider records or requiring a new sync.

Tests cover the Oct 24 example, missing/contradictory data, monotonicity, bounds,
short-night behavior, missing stages and the efficiency fallback. These are
software checks and do not constitute clinical validation. A future version
must change the method identifier and clearly distinguish historical series
calculated with different formulas.
