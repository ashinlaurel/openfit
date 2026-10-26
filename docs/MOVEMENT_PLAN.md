# Movement page implementation plan

Keep the page compact: short labels, readable graphs, no explanatory accordions.

1. [x] Fix Google rollup limits by splitting restricted types into requests of at most 14 days. Preserve 30-day history and identify failed sources.
2. [x] Add timestamped activity level, active energy, distance and zone-minute data using existing read permissions. Preserve missing values and interval boundaries.
3. [x] Implement a versioned OpenFit movement estimate (0–100), meaningful missing-data coverage, and a concise breakdown. Document the formula and its limits here and in MOVEMENT_SCORE.md.
4. [x] Replace the fragmented header with a prominent score and compact metric tiles. Use one hourly step graph and an accurate intensity timeline; remove the duplicate heatmap.
5. [x] Simplify workday movement: compact metrics, taller inactive-period graph, accurate inactive labels, future shading, keyboard/hover access.
6. [x] Add shared 7/14/30-day history controls, a labeled weekly inactivity time axis, selected-day highlighting, and consistent activity colors.
7. [x] Verify adapters, scoring edge cases, missing/zero/future data, interactions, production build, and the live UI. Keep only one Electron instance.

## Score design

An experimental product estimate, not a clinical or Google score. Score movement volume (45%), moderate-equivalent activity (30%), light activity (15%), and distribution across the day (10%). Use overlapping volume signals as alternatives, not additive rewards. Normalize only available components; require at least 60% input weight for a numeric score. Show input coverage and an in-progress label for today. Apply a bounded penalty for recorded long inactive spells; missing inactive records never count as proof of uninterrupted movement. Do not score total calories, body weight, or device-dependent floors. Keep the exact engineering targets and rationale in MOVEMENT_SCORE.md. Use the same formula for the header and historical estimates.

## References

- https://developers.google.com/health/data-types#query_constraints
- https://developers.google.com/health/filters
- https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints
- https://www.who.int/europe/news-room/fact-sheets/item/physical-activity

## Completion and validation

Completed 2026-10-25. All 186 tests passed across 39 test files; type checking, Electron syntax checks, and the production build passed. Live Google sync reported 39/39 successful sources after the rollup fix. Verified the live Movement header, selected-day score/history agreement, timestamped intensity and readable chart labels. Exactly one Electron instance remained running after the adapter restart. Existing production bundle-size warnings remain.

The page has no explanatory accordions. The detailed score specification lives in MOVEMENT_SCORE.md. Score history with incomplete inputs is labeled; the selected day always uses the exact header inputs.
