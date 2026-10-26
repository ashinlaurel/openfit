# OpenFit sleep timeline estimate v4

`openfit-sleep-v4` uses the timestamped stages plotted in Night timeline.
It is an experimental adult estimate, not a validated clinical instrument or a
provider score. Research informs indicators; point values are OpenFit design
choices. There is no date-specific correction.

## Timeline inputs

Sort segments by timestamp; require known stages, positive finite intervals,
no overlaps, no gaps greater than one second and a span no longer than 24 hours.
Require some deep or REM sleep to exclude legacy undifferentiated all-light
records. A finite reported sleep total must agree within max(5 minutes, 2%).
Missing or inconsistent timelines produce no estimate. Historical normalization
preserves timelines so the same method applies to daily and historical nights.

Merge adjacent identical stages. Sum light + deep + REM for time asleep. Only
wake blocks between the first and last sleeping segment count as fragmentation;
leading/trailing wake periods are excluded. Sustained awakenings last ≥5 minutes.
Normal transitions between sleeping stages are not awakenings. Display longest
awake spell and longest uninterrupted sleep block alongside these counts.

## Formula

Linearly interpolate duration minutes → base points:
0 → 0; 240 → 25; 360 → 60; 420 → 75; 480 → 100. Saturate above 480.

Linearly interpolate internal awake minutes → deduction:
0–20 → 0; 40 → 10; 60 → 20; 120 → 40. Saturate above 120.

Linearly interpolate sustained awakenings → deduction:
0–1 → 0; 2 → 5; 3 → 10; 4 → 20; 6 → 30. Saturate above 6.

Subtract the larger wake deduction, avoiding additive penalties for the same
wakefulness. Adult stage indicators subtract 10 points each for deep sleep ≤5%
of asleep time and REM ≥41%. Do not penalize light sleep alone or reward more
REM/deep indefinitely. These adult indicators are not individualized for age,
particularly older adults.

Final score = round(max(0, duration base − wake deduction − stage deductions)).
All deductions are displayed. Efficiency and time in bed are completely excluded.

## Research and limits

Ohayon et al. (2017) supports sustained awakenings and wake-after-sleep-onset as
quality indicators, and identifies low deep sleep and high REM adult indicators.
Consensus on many stage measures was limited. It does not validate these points.
https://doi.org/10.1016/j.sleh.2016.11.006

Duration context: https://pubmed.ncbi.nlm.nih.gov/26039963/
Wearable staging limits: https://pubmed.ncbi.nlm.nih.gov/33378539/

Non-REM heart rate, nightly HRV, deep-sleep HRV, HRV entropy, oxygen and breathing
are displayed separately. No absolute heart-rate/HRV threshold is assumed
without a personal baseline. Missing measurements say “Not recorded.”
The estimate cannot establish how refreshed someone should feel or explain every
bad night. Provider scores are never overwritten.

## Versions and verification

V1 combined duration/efficiency. V2 gated efficiency by duration. V3 removed
efficiency. V4 adds timeline-derived fragmentation and adult stage flags.
Historical nights without usable timelines remain gaps, not duration-only scores
mixed into the current series. Existing records are read without rewriting them.

Tests cover timeline totals, fragmentation, merged awake segments, leading and
trailing wake exclusion, stage transitions, invalid inputs, efficiency invariance,
historical consistency, overnight metrics and cache-first date navigation.
