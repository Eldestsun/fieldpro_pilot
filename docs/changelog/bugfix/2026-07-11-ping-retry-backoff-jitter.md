# 2026-07-11 — PING-RETRY: backoff + full jitter on /api/secure/ping; reconnecting state via existing offline bar

## What changed
- `AuthContext.tsx` (**freeze exception granted 2026-07-11, narrow, additive-only**):
  - Added `pingFailsRef` (consecutive `/api/secure/ping` failure count) and an
    `isReconnecting` boolean on the context. Bookkeeping added inside the
    existing `fetchMe` success/failure branches; success resets the count.
  - Added a backoff gate in front of the existing auto-fetch re-fire:
    after the nth consecutive failure the retry ceiling is
    `min(2^(n-1) * 1000ms, 30000ms)` — 1s→2s→4s→8s→16s→30s cap — and the
    actual delay is uniform random in `[0, ceiling]` (**full jitter**, so a
    yard of devices doesn't thundering-herd the backend when it returns).
    **No permanent give-up**: attempts continue at the 30s cap forever; a
    device that regains signal reconnects with no manual reload. The first
    attempt after sign-in (or after a success) still fires immediately —
    pre-existing behavior unchanged.
  - NOT touched: `getAccessToken`, MSAL wiring, `signIn`/`signOut`, the
    sign-in gate, the dev-bypass path, the state machine's shape.
- `OfflineStatusBar.tsx` (not frozen): one new priority branch
  (offline > reconnecting > syncing > …) rendering
  "🟡 Reconnecting to server…" through the existing bar. No new component;
  no `OfflineSyncContext` change needed (the minimal floor per ruling 1.2).
- New test/demo harness `AuthContext.pingBackoff.test.tsx` + two
  `OfflineStatusBar.test.tsx` cases. Committed red-first.

## Why
- Symptom of record: `/api/secure/ping` retried ~1000x/sec when the backend
  was unreachable. Mechanism (Phase 0): on failure, `setMe(null)` + the
  `isLoading` true→false toggle restore the auto-fetch effect's precondition
  (`isSignedIn && !me && !isLoading`), so it re-fired every render, with zero
  delay, zero cap, and no state distinguishing "never tried" from "failed."
  Real field devices on flaky yard wifi hit this in week one of the shadow
  operation.

## Proof (committed states)
- RED (`4f0b13b`, tests against pre-fix code): tight-loop test —
  **`expected 51 to be 1`** — 51 ping attempts with ZERO time advanced
  (bounded only by the test's safety fuse; unbounded in reality). Spacing,
  jitter, reset, and reconnecting-banner tests all fail. 5 failed / 7 passed.
- GREEN (`2bff1e6`): full frontend suite **60/60**, `tsc -b && vite build`
  clean. Demo output: attempt deltas `[1000, 2000, 4000, 8000, 16000, 30000,
  30000]` ms at `random=1`; `[500, 1000]` at `random=0.5` (multiplicative
  jitter); post-success-reset retry delta `1000` ms (floor restored).

## Files touched
- `frontend/src/auth/AuthContext.tsx` (freeze exception, additive)
- `frontend/src/components/ui/OfflineStatusBar.tsx`
- `frontend/src/auth/__tests__/AuthContext.pingBackoff.test.tsx` (new)
- `frontend/src/components/ui/__tests__/OfflineStatusBar.test.tsx`
- `docs/changelog/bugfix/2026-07-11-ping-retry-backoff-jitter.md` (this file)

## Note on the backoff formula
The dispatch wrote `ceil = min(2^n * 1000ms, 30000ms)`. Implemented as
`min(2^(n-1) * 1000ms, 30000ms)` so the FIRST retry ceiling is 1s, matching
the demo curve the same ruling specified (`1→2→4→8→…→30s`). Same cap, same
jitter, same no-give-up semantics; the sequence just starts at 1s not 2s.
