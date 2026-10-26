# Trends and daily VM aggregation

Status: implementation plan. No jobs, server credentials, VM changes, or Trends page have been deployed by creating this file.

## Outcome

Add **Trends** to the sidebar. Show compact, graph-led views of all-time, weekly, and monthly averages for every supported numeric metric. Keep durable daily history and precomputed aggregates on our existing VM, with a cached desktop copy. Viewing historical trends must not call Google Health.

Google remains the source of NEW tracker readings. Owning the archive removes the need to repeatedly ask Google for old readings or averages; it cannot produce fresh readings while Google or the tracker is unavailable.

All-time means **all recorded history successfully imported**, with the actual start date shown. It does not mean the user's entire lifetime. Historical backfill is an explicit part of this project.

## Current implementation and gaps

- `electron/google-health-service.cjs` fetches Google Health records, with pagination and restricted rollups split into 14-day requests. Recent history is currently 30 days.
- `electron/health-cache.cjs` stores encrypted desktop snapshots by selected date.
- `electron/main.cjs` and `electron/cloud-service.cjs` synchronize the non-health archive.
- `cloud/server.mjs` encrypts per-user files with AES-256-GCM and atomic writes; `/v1/archive` accepts todos, habits, and reports only. Keep that contract intact.
- `cloud/opengym-compose.yaml` runs the existing VM services with persistent data volumes. `cloud/Dockerfile` currently copies only the cloud server and exercise-name data.
- Google tokens currently live in Electron's OS-protected credential storage. A VM cron job cannot read that keychain. Always-on ingestion needs a separate, explicitly connected server-side Google account.
- Sleep and movement estimates have versioned formulas. Server and desktop must share those implementations rather than inventing another scoring formula.

## Architecture

Use three distinct layers:

1. **Import:** fetch new or revised readings from Google; also import existing desktop history through an authenticated health endpoint.
2. **Daily facts:** persist one canonical record per user, local date, and metric, with actual observation dates, units, provenance, revision, and completeness. Retain the compact intervals/inputs needed to reproduce scores and configurable work-hour metrics.
3. **Aggregates:** derive all-time, calendar-week, calendar-month, and rolling summaries from our daily facts. These calculations run without a Google request or Google token.

Initial storage should follow the existing encrypted per-user file approach: separate versioned `health/days/YYYY-MM-DD.enc`, `health/aggregates.enc`, `health/sync-state.enc`, and `health/google-token.enc`. Do not rewrite a growing lifetime archive on every daily update. Use the existing tenant-bound authenticated encryption and serialized/atomic writes. Keep the storage interface separable so a database can replace the files later if needed.

Serve compact aggregate responses for the Trends overview; fetch daily series only when opening a metric. Keep the last response encrypted on the desktop for offline viewing.

## Metric inventory

### Movement — daily totals and daily estimates

Compute recorded-day averages for:

- Steps and distance (km).
- Active energy and total energy (kcal), kept separate.
- Light, moderate, vigorous, and combined active minutes.
- Moderate-equivalent minutes: moderate + 2 × vigorous, only when both inputs exist.
- Active zone minutes, kept separate from actual elapsed activity time.
- Floors, when recorded by supported hardware.
- Total recorded inactive minutes.
- Meaningful moving hours using the current movement-score definition.
- Longest recorded inactive interval and long-interval counts.
- OpenFit movement estimate, grouped by formula version and input coverage.

For work-hour inactivity, longest stretch, and stretch counts, calculate the same metrics under a versioned work-hour configuration. Changing the selected hours or threshold must recompute the corresponding historical comparison rather than mixing incompatible settings. Preserve normalized interval boundaries; daily totals alone are insufficient.

Weekly/monthly panels show **average per recorded day** plus a period total for additive metrics. Weekly moderate-equivalent activity can have a compact total tile. Do not add workout totals to daily movement totals: they overlap.

### Sleep — daily and per-night measurements

- Main-sleep duration, recorded period, total awake minutes, and nightly efficiency.
- Deep/light/REM durations, and their nightly proportions; keep the percentage denominator explicit in the metric definition.
- Awake time between sleep blocks, sustained-awakening counts, longest awake spell, and longest uninterrupted sleep block.
- Nap count/duration and total daily sleep, distinct from main sleep. Reconcile duplicate/overlapping sessions before producing a daily combined total.
- Bedtime, wake time, and sleep midpoint, with clock-aware averaging around midnight. For example, 11:50 PM and 12:10 AM average to midnight. Ambiguous clock distributions should not produce a misleading average.
- Sleep-onset latency and time after final waking only when actually measured, never from automatic default zeros.
- OpenFit sleep estimate, by formula version; provider score only if actually supplied, in a separate series.

Define nightly efficiency's primary average as the mean of observed nightly efficiencies. If exposing pooled efficiency (sum of asleep minutes / sum of recorded-period minutes), label it separately. Do not silently interchange the two.

### Heart and overnight signals

- Daily resting heart rate and non-REM sleeping heart rate (bpm).
- Nightly HRV and deep-sleep RMSSD (ms), kept as distinct metrics.
- HRV entropy, when reported.
- Nightly breathing rate and deep/light/REM breathing summaries, with session association retained.
- Nightly average oxygen saturation (%).
- Nightly temperature deviation from the provider baseline (°C); retain the accompanying baseline and nightly value as separate fields when supplied.
- Core temperature, when actually measured.
- Numeric VO2 max/cardio-fitness estimates when supplied as numbers. Preserve ranges as ranges rather than treating their upper bound as a point estimate.
- Daily time-weighted heart-rate summaries may be added when timestamped coverage is sufficient; do not average whichever instantaneous heart-rate value was visible when the app opened.

The default long-term HRV/SpO₂/breathing view gives each observed daily summary equal weight. A night with more valid samples must not automatically outweigh another night. Google oxygen confidence bounds are not min/max values and cannot be averaged into a new confidence interval.

### Body and nutrition

- Weight, body fat, BMI, hydration, and food energy when recorded.
- Keep actual measurement/log dates. The latest known weight shown on a dashboard must not be copied into every subsequent day's average.
- Multiple body measurements on one date need a documented daily selection rule; retain their observation timestamps and counts. Use the last valid measurement for the initial daily body series.
- For hydration/food logs, aggregate deduplicated entries into daily totals before averaging days. No entries alone do not establish an explicit zero intake.
- Glucose needs a separate observation-based view with units and context; do not mix fasting and post-meal readings into an unlabeled general baseline.

### Workouts and gym — second delivery phase

- Session count, active duration, elapsed duration, distance, energy, and session heart-rate summaries, separated by sport.
- Per-session averages and per-recorded-day totals are different metrics and must have different labels.
- Pace/speed comparisons use compatible sports and distance/time weighting, not a mean of session pace values. Exclude missing distance and invalid durations.
- Strength training: workout frequency, recorded sets/reps, training volume, and exercise-specific working weights when the Open Gym records contain the necessary inputs. Do not combine unrelated exercise weights into one average.
- Only derive training volume from complete supported sets, preserving units and exercise identity.

### Other OpenFit records — optional follow-up

- Habits: completion rates with scheduled opportunities as the denominator.
- Todos: counts completed per day/week/month, not averages of task IDs or statuses.
- Drinking: standardized units per logged day, period totals, and confirmed alcohol-free days. Unknown days are not alcohol-free days.
- Lab reports: separate dated series for matching analytes and normalized compatible units; do not combine different tests or report/reference ranges.

Do not produce numerical averages of ECG classifications, alert labels, device names, firmware, sync statuses, goals, or IDs. Alerts can have counts/rates only where source coverage establishes the denominator. Unsupported or never-recorded metrics stay out of the overview and can be listed under a compact metric picker.

## Correct averaging rules

- Store `sum`, `count`, `min`, `max`, first/last observation dates, recorded-day counts, expected calendar days, period totals where meaningful, units, quality flags, and definition versions.
- All-time average = total sum / total count of canonical eligible daily values. **Never average weekly or monthly averages.**
- Retain the numerator and denominator for rates and weighted metrics; aggregate those before division.
- Missing, failed, stale, invalid, or unsupported readings are not zero. Explicit recorded zeros are valid.
- Deduplicate by provider record identity/revision and canonical local date/metric. Repeated desktop uploads and cron runs must not add another day or duplicate a session.
- Failed endpoints must not overwrite previously saved valid measurements with null. Genuine provider edits/deletions must be handled through authoritative reconciliation and retained provenance, not an unconditional “keep every old non-null value” rule.
- Use completed local days by default. Today's partial values appear separately as “In progress” and do not lower all-time averages.
- Calendar completion is distinct from sensor coverage and processing completion. An old date is not necessarily a fully observed day.
- Weeks run Monday–Sunday; months are calendar months. Store period keys and timezone. Add rolling 7/30/90-day views separately, with clear labels.
- Never merge movement/sleep estimates across formula versions or materially different input coverage without explicitly labeling/recomputing the comparison. Store score components, goals/targets, penalties, input coverage, and version so estimates remain reproducible.
- Do not silently carry values forward or interpolate gaps. Averages show sample coverage, for example “18 recorded days”, without long explanatory sections.

## Daily VM job

### Schedule

Run once daily at **09:00 Asia/Kolkata** (03:30 UTC), targeting yesterday and the prior six days. This captures late syncing, processed sleep updates, and revised readings. Today's readings can arrive provisionally via desktop sync, outside completed-day aggregates.

Implement a CLI such as `node cloud/health-job.mjs --incremental`, invoked by a host systemd timer (cron equivalent `30 3 * * *` on a UTC host). Use one scheduler, not both. Prefer a persistent systemd timer so a missed run is caught up after reboot. Use the same image's dedicated worker command/service; do not launch Electron or a GUI on the VM.

### Run sequence

1. Acquire a single-run lock; identify connected accounts and their incremental cursors.
2. Refresh each account's access token only when needed. Persist token rotation atomically under encryption.
3. Import/reconcile the recent seven completed dates, page through all results, and respect type-specific Google query limits (14 days for restricted rollups; 90 for other rollups).
4. Process each source independently. Record source/date errors and keep previously valid history available.
5. Update canonical daily facts and score inputs, recording changed dates.
6. Recompute only affected calendar weeks/months, rolling windows, and all-time sufficient statistics. Correct a replaced day by removing the old contribution before adding the new one.
7. Commit a consistent generation/revision, release the lock, and write a non-sensitive run summary: success/partial/failure, dates updated, durations, and source error codes.

Use bounded retries/backoff for transient errors and rate limits. An expired/revoked connection becomes “Reconnect Google”; aggregation of already-owned history still succeeds. Include a manual aggregate rebuild command that makes no Google calls, and a manual import/catch-up command that uses the same lock and rate limits.

Perform a slower periodic reconciliation of older imported dates (e.g. a bounded monthly sweep) so edits outside the seven-day refresh window can be detected. Published historical aggregates are correctable, not permanently frozen.

## Historical bootstrap

- Upload actual dated desktop observations and compact intervals through the new health endpoint; never relabel every historical daily fact with the snapshot's selected date.
- Backfill Google history in a throttled background process, starting with recent data and then moving backward to the account's earliest available records. Allow interruption and resume from a cursor.
- Never run a 30-day request on a 14-day-limited rollup. The existing adapter fix should be reused and tested in the worker.
- Do not assume the first empty period means the account has no earlier data. Establish an import boundary using available account metadata/user choice and track attempted ranges.
- Display “Importing history” and the imported date range until bootstrap finishes. All-time values are clearly bounded to that range.
- Fetch expensive intraday data only for metrics that need it (daily spread, score reproduction, work-hour intervals); low-frequency daily summaries should not trigger a full daily dashboard sync for every historical date.

## Google connection and VM access

Add an explicit “Connect Google to cloud sync” flow using server-side OAuth, state binding, PKCE, and a registered HTTPS callback on our VM origin. Use the same necessary read scopes, not new write permissions. Use a compatible existing Web OAuth client with the added callback or a dedicated Web client; keep client/token audiences matched.

The VM needs its own encrypted refresh-token storage. Do not copy the desktop keychain or expose tokens in URLs, logs, browser storage, or aggregate responses. Connecting an account to the VM must be deliberate and bound to the authenticated OpenFit user. On disconnect, stop future imports; provide a clear separate choice for retaining/deleting the saved archive.

Server-side long-running sync must account for OAuth Testing-mode refresh-token expiration; configure an appropriate publishing status for the intended deployment. This affects connection longevity, not the amount of sensor data Google has recorded.

Keep existing per-user authentication and HTTPS. Aggregate reads and health uploads must enforce the same account isolation as the rest of OpenFit. The worker operates on local account records rather than impersonating a desktop session token.

## API and shared implementation

Proposed authenticated endpoints:

- `PUT /v1/health/days/:date`: idempotent upload with schema/source revisions and per-metric provenance.
- `GET /v1/trends?period=all-time|week|month&anchor=YYYY-MM-DD&category=...`: aggregate overview, coverage, timezone, generation, and freshness.
- `GET /v1/trends/:metric/series?from=...&to=...&bucket=day|week|month`: bounded historical series and source-quality metadata.
- `GET /v1/health/sync-status`: connector state, last successful import, last aggregate run, backfill progress, and per-source failures.
- Separate Google connect/callback/disconnect routes; never include tokens in the generic archive endpoint.

Extract the day/metric definitions, normalizers, and versioned score calculations into shared platform-independent modules used by the worker and desktop. Do not maintain separate server and React formulas. The current cloud Docker build will need those modules and the worker copied explicitly. Avoid importing Electron or renderer alias paths into Node at runtime.

## Trends page design

Add **Trends** to `PageId`, sidebar navigation, command navigation, and the existing view routing.

- Top controls: **All time / Weekly / Monthly**, category selector, period arrows, and a date/month/week picker appropriate to the view.
- All time: a small set of pinned headline averages with “Since [first imported date]” and recorded-day counts; compact grouped cards expose all supported metrics.
- Weekly/monthly: show average per recorded day, period total for additive metrics, and comparison with the preceding equivalent period. Show incomplete periods as partial; compare elapsed portions or completed periods rather than implying a finished period.
- Categories: Movement, Sleep, Heart & recovery, Body & nutrition; later Workouts and other app records.
- Each card: short metric label, prominent average with unit, small previous-period delta, small coverage count, and a sparkline where useful.
- Selecting a metric opens a larger graph within the page with daily/weekly/monthly buckets. Keep missing periods visibly empty. Show exact date/value/coverage on hover or keyboard focus.
- Keep daytime totals, nightly averages, measurement averages, and workout averages correctly labeled; every metric owns its unit and denominator.
- Reuse the cleaned Sleep/Movement visual language: aligned compact tiles, dominant graphs, restrained category colors, no large explanatory sections or formula accordions.
- A small freshness indicator distinguishes VM import status from desktop connectivity. Existing averages remain usable when Google fails or the VM is temporarily unreachable.
- Reuse VM aggregates for the small average labels on Sleep, Movement, and other pages, through the shared local cache. Always match timeframe, work-hour settings, metric definition, and score version.

## Execution order

1. [ ] Define the shared metric registry: stable keys, units, observation dates, eligible inputs, aggregation methods, zero/missing rules, score versions, and supported categories.
2. [ ] Implement canonical daily facts and deterministic aggregation as pure modules, with tests before wiring any scheduler.
3. [ ] Add encrypted per-user health storage and authenticated ingestion/Trends/status endpoints. Preserve the existing non-health archive contract.
4. [ ] Import existing desktop health history, preserving actual dates and source identities. Add conflict/revision handling and a shared desktop aggregate cache.
5. [ ] Add explicit VM Google connection and a headless incremental ingestion CLI; test independent of the desktop app.
6. [ ] Add resumable history bootstrap, source-specific limits/pagination, late-update reconciliation, job locking, and run status.
7. [ ] Build the Trends page against the local aggregate/cache contract: all-time first, then weekly/monthly selection and detailed metric graphs.
8. [ ] Connect existing per-page average labels to the same aggregate definitions. Do not let a page's chart-range selector change unrelated baselines.
9. [ ] Add scheduler/deployment definitions, encrypted backup/restore and archive-deletion support; verify locally before enabling the VM timer.
10. [ ] Deploy, run an initial bounded import and aggregate rebuild, verify the actual timer and account isolation, and keep one Electron instance open for UI review.
11. [ ] Extend the registry/UI to workout, gym, habits, drinking, and lab-record metrics only where their data contracts are complete and definitions have tests.

## Acceptance checks

- Averages agree with a hand-calculated daily fixture; unequal-size weeks/months do not cause an average-of-averages error.
- Missing values, explicit zeros, repeated uploads, multiple measurements, and overlapping intervals have distinct correct behavior.
- Replacing/deleting a historical observation updates all affected periods exactly once; restart/retry is idempotent.
- Midnight sleep timing, IST day boundaries, month/year boundaries, leap days, and a timezone with daylight-saving transitions are covered.
- Partial days are excluded by default. Current week/month coverage is visible and comparisons do not treat missing dates as zeros.
- Score versions, work-hour settings, input coverage and measurement units cannot silently mix.
- Worker runs while the desktop is closed; overlapping invocations cannot corrupt records.
- Expired credentials, Google outages, missing sources and VM restarts leave saved aggregates readable.
- A manual rebuild reproduces the persisted aggregates without contacting Google.
- Historical all-time coverage grows as bootstrap proceeds; the UI never claims unimported dates are known.
- Different authenticated users cannot access one another's health facts, aggregates, or connector credentials.
- Backup/restore reproduces the same date counts and averages, including their versions and provenance.
- Trends browsing works from the encrypted desktop cache with Google unavailable and makes no Google API calls.

## Verified references

- Google data types, historical queries, and aggregation limits: https://developers.google.com/health/data-types
- Google Cloud/OAuth setup, offline access, and testing-token behavior: https://developers.google.com/health/setup
- Existing code: `cloud/server.mjs`, `cloud/opengym-compose.yaml`, `electron/cloud-service.cjs`, `electron/health-cache.cjs`, `electron/google-health-service.cjs`, `src/data/normalize.ts`, `src/lib/movement-score.ts`, `src/lib/sleep-score.ts`.
