# Private OpenFit website — implementation plan

Status: private website deployed; Google Health history is persistently cached.

Reuse the existing React UI in the Mac app and a browser build served over HTTPS
from Oracle. Keep the existing desktop bridge. A browser bridge will implement
the same typed interfaces through same-origin authenticated API requests.

## Access

One Google sign-in button, no registration. Verify the Google identity on the
server and restrict access to the configured owner's verified email, then pin
the Google subject ID. Use opaque random sessions in Secure, HttpOnly, SameSite
cookies, expiration, logout, and origin/CSRF checks for writes. Never rely on
client-side hiding of controls for authorization.

Google Health consent can be requested after basic sign-in. A denied or expired
Health grant must not prevent access to the owner's todos, habits, or reports.
Keep OAuth state and PKCE tied to the initiating browser. Keep client secrets
server-side and encrypt refresh tokens with the existing storage key.

## Storage

- Existing Open Gym profile and OpenFit todos, habits, reports and PDFs remain
  in their current persistent VM storage; web and desktop use the same profile.
- Google Health snapshots are encrypted in the private web state on the VM.
  Authenticated cache reads show saved data before background refresh completes.
  Missing daily snapshots for today and the previous six days are backfilled
  sequentially after a successful sync; longer collected history is retained.
- The Mac app retains its encrypted local archive with the same week backfill.
  Cache rendering does not wait for cloud pairing. Refresh always queries the
  provider; failed syncs retain saved snapshots. Disconnect clears health history.
- Browser responses remain no-store; health data is not stored in localStorage
  or service-worker caches. The shared doctor link cannot access this cache.
- OAuth tokens are credentials stored encrypted on the VM, separate from
  Health response data. Do not copy browser tokens into localStorage.

## Work required before deployment

1. Confirm owner email and public origin, register the HTTPS OAuth callback.
2. Implement private web sessions and Google consent/token refresh.
3. Add browser adapters for health, gym, todos, habits and reports, including
   browser PDF upload/download and authenticated preview.
4. Reuse shared validation and mutation logic, handle concurrent desktop/web
   updates without overwriting later saves, and verify PDF persistence.
5. Review remaining desktop-only features: local Codex assistant, PDF OCR,
   file exports and Reader. Expose supported browser equivalents or clearly
   label unavailable features rather than silently showing nonworking controls.
6. Test authentication rejection, CSRF, expired consent, empty data,
   concurrent edits and responsive layouts, then deploy on Oracle.

`cloud/web.env.example` documents the proposed server-only settings. It is a
template, not an active feature toggle. Preserve the existing storage key and
never place secrets in browser build variables. Google Cloud Testing mode can
expire Health refresh tokens after seven days; publishing status needs to be
considered before promising persistent consent.

References:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/
- https://developers.google.com/health/setup

## India time

The app uses Asia/Kolkata (IST, UTC+05:30) for today, date limits, cache-day selection and timestamp display, regardless of browser/server timezone. Google Health civil dates/times are already local and are preserved. UTC physical timestamp fallbacks are converted to IST; ECG physical query bounds use Indian midnight. Date-only laboratory and daily-summary values remain calendar dates, without a second timezone shift.
