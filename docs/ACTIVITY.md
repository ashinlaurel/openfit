# Activity: Fitbit Air workouts

Activity is dedicated to recorded workouts. Steps, daily active minutes, distance goals and sedentary analysis remain in Movement.

## Overview and sessions

The page uses a rolling 28-day window ending on the top-bar date. It combines the current exercise response with locally cached history, deduplicates session IDs, and lets newer complete responses supersede older snapshots (including sessions that have since been removed). A complete exercise response establishes coverage for its query window; older caches without that metadata retain unknown days instead of manufacturing rest days.

The overview contains session count, reported training time, distinct workout days and available distance/calorie totals. Calendar cells show workout volume, recorded zero-session days or unknown coverage. Clicking a date or training type filters the searchable, sortable session log. Same-exercise comparisons offer duration, distance, average pace and average HR only when at least two sessions report that metric; they make no claims about causality, fitness improvement or equivalent routes/effort.

Opening a session shows only supplied metrics and sections:

- Active duration, elapsed time and their difference, where both durations are available.
- Workout distance, average HR, calories, pace, speed and Active Zone Minutes.
- Elevation gain, running VO2 max, swimming lengths/pool length or a GPS-associated indicator only when explicitly supplied. No GPS map, advanced running dynamics, rep/set detection or device capability is inferred.
- Reported heart-rate zone distribution, preserving missing zones as unknown.
- Recorded splits/laps, including short final laps, their supplied metrics and a pace chart when possible. The adapter prefers `splitSummaries` over the default `splits` array so the same laps are not counted twice.
- Pause/resume and other supplied session events, plus plain-text workout notes.

Heart-rate detail uses exact timestamped samples intersecting the session's absolute start/end, with 1-minute means (coarser for very long sessions, capped near 240 bins). Missing bins remain gaps. Session charts use samples already in the local cache and do not trigger extra API calls. Sessions crossing midnight or DST boundaries use absolute instants. Provider-local start offsets take precedence for calendar grouping, then profile timezone, with UTC as a fallback. Offset-free historical timestamps remain local wall time.

## Google data

`exercise` is reconciled over 28 days using `google-wearables`. This targets device-recorded Fitbit/Google wearable workouts rather than manually logged or phone-only entries. It does not identify every record as Air when other wearables exist on the account: supplied source-device metadata is retained and shown in detail.

Reference: [Google exercise and metrics schemas](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints#Exercise), [Air compatibility](https://developers.google.com/health/data-types/device-compatibility).

All optional fields remain conditional. Air supports exercise records; this does not guarantee every optional schema field for every recording. Existing cached days may need a normal Google Health refresh to obtain extended fields and coverage. No new permissions were added.

Demo mode provides 28 days of explicitly illustrative running, walking, strength and pool sessions, with partial optional metrics and intentional sample gaps. Tests cover units, missing/zero metrics, split precedence, source offsets, timestamp filtering, recording gaps, DST, cached-history supersession and sparse detail rendering. The assistant's existing health context includes bounded workout detail (up to 20 splits/events and 1,000 note characters per selected-day session).
