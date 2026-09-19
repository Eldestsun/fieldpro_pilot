# 2026-09-18 — ISSUE-067: app-scoped sign-out (stop ending the org-wide Entra session)

## What changed
- `frontend/src/auth/AuthContext.tsx` (`signOut` only — **auth freeze lifted by the
  founder 2026-09-18 for exactly this scoped change**; `authz.ts`, `msalConfig.ts`,
  and the rest of `AuthContext.tsx` untouched):
  - `instance.logoutPopup()` → `instance.clearCache({ account })` +
    `instance.setActiveAccount(null)`. Sign out now removes the account and
    tokens from the app's **local MSAL cache only**; the Entra SSO session at
    login.microsoftonline.com is left alive. The next Sign in silently SSOs
    (or shows the account picker) with no password re-entry.
  - The per-user offline-state cleanup (`clearOfflineStateForUser`, photos,
    drafts) is unchanged — it guards cross-user data bleed on the device and
    still runs before the cache clear.
- New regression suite `frontend/src/auth/__tests__/AuthContext.signOutScope.test.tsx`
  (3 tests): clearCache called for the account + active account deactivated;
  **logoutPopup/logoutRedirect never called** (a revert turns CI red); offline
  cleanup still runs with the right (tenantId, oid).

## Why
Discovered 2026-09-13 during multi-persona session setup: each app Sign out
destroyed the previous account's server-side Entra session (verified against
the Entra session list — only the last account remained signed in). Field
devices will run org-signed browsers (some Microsoft Edge signed in as the
worker's org user); BASELINE sign-out must never revoke the worker's
browser/device-level Microsoft session. Founder requirement, 2026-09-13.

## Tradeoff decision (recorded per the card)
On a genuinely shared device/browser profile, a local-only sign-out leaves the
Entra session alive — the next person at the device could re-enter the app as
the previous worker via silent SSO. **Decision: accepted.** Pilot devices are
per-worker; if any shared-profile device enters the fleet, mitigate at the
device layer (separate browser profiles / OS accounts / Entra Conditional
Access session policies) — never by reverting to org-wide logout. The code
comment at the change site states this so the tradeoff travels with the code.

## Verification
- `tsc --noEmit` clean; frontend suite 122/122 (3 new).
- Live two-session Entra verification (sign in as A → Sign out → Entra session
  list still shows A signed in → next Sign in SSOs silently) requires real
  founder credentials and is left to the founder per the card's verification
  sketch — the agent does not perform Entra logins.

## Files touched
- `frontend/src/auth/AuthContext.tsx`
- `frontend/src/auth/__tests__/AuthContext.signOutScope.test.tsx` (new)
- `docs/changelog/bugfix/2026-09-18-issue-067-app-scoped-signout.md` (this entry)
