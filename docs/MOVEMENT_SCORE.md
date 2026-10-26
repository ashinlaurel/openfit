# OpenFit movement score v1

A daily product estimate from 0–100, not a validated clinical score, Google score, fitness test, or prediction of health outcomes. Today is in progress; readings reflect the last sync. Missing inputs are never converted to zero. Historical values use the same formula and disclose their available input weight.

## Formula

Each component is capped at 100% of its target:

- Volume, 45 points: the largest of steps / step target, distance / distance target, and active calories / 500. Defaults are 8,000 steps and 6 km when provider goals are absent. These are alternative signals, not additive credits, so walking does not receive three volume rewards and cycling can contribute through energy/distance.
- Intensity, 30 points: (moderate minutes + 2 × vigorous minutes) / target. Both intensity totals must be measured; otherwise use recorded active zone minutes as an alternate intensity signal. The default target is 30, or the provider's active-minute goal. Do not sum the two sources.
- Light activity, 15 points: light minutes / 120.
- Daily spread, 10 points: number of hours with at least 250 recorded steps / 8. An hour containing one step does not establish meaningful hourly activity. Missing hours are unknown, not measured zero; this component is present only when hourly records exist.

Coverage is the sum of the weights of available components. With coverage below 60, show no numeric estimate. Otherwise base = 100 × earned points / coverage. Display partial input coverage whenever it is below 100. Coverage is the availability of score inputs, NOT percentage of the day worn or monitored. Scores with different coverage are less directly comparable.

Subtract a long-inactivity penalty: clamp((longest recorded inactive interval in minutes − 60) / 12, 0, 10). Intervals are clipped to the selected day and snapshot time and merged so overlaps/adjacency cannot double count. Missing inactive intervals mean no deduction can be established; they are never evidence of zero inactivity. This optional penalty is disclosed in the compact breakdown and does not add points for missing data.

Round once; clamp the final estimate to 0–100. Zero is valid when explicitly recorded. Negative, nonfinite and absent readings are unavailable. Daytime scores use full-day targets and can rise as activity accumulates; do not extrapolate an unfinished day.

## Deliberate exclusions

Total calories include basal expenditure and are not movement credit. Floors depend on hardware. Workout totals overlap with daily totals. Heart rate, age, weight, VO2max and sedentary daily totals do not independently add points. Intraday distance/zone readings support visualization and are not added on top of daily totals.

All point weights, daily targets, hourly thresholds, and inactivity penalties are OpenFit engineering choices. WHO guidance informs the distinction between light and moderate/vigorous activity and the moderate-equivalent convention; it does not validate this daily formula. WHO recommends adult aerobic activity over a WEEK (150–300 moderate minutes or equivalent), not an obligation to hit this product's daily targets.

Sources:
- https://www.who.int/europe/news-room/fact-sheets/item/physical-activity
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
