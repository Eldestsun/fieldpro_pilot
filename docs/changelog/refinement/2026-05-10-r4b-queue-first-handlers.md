# 2026-05-10 — R4-B: Queue-first action handlers + OTEM unconditional

## What changed
- Removed `ENABLE_OTEM` feature flag and `import.meta.env.VITE_ENABLE_OTEM` check from `useTodayRoute.ts`
- `executionMode` is now derived from `offlineMode` state only: `offlineMode ? 'OFFLINE_TOLERANT' : 'LIVE'`
- `handleStartStop` rewritten to always enqueue a `START_STOP` action and return immediately with optimistic update; LIVE direct API call removed
- `handleSkipStop` rewritten to always enqueue a `SKIP_STOP_WITH_HAZARD` action; LIVE direct API call and `alert()` on network failure removed; validation failures now use `console.warn`
- `handleCompleteStop` rewritten to always enqueue a `COMPLETE_STOP` action; LIVE direct API call and `alert()` on network failure removed
- Removed now-unused `startRouteRunStop` and `completeStop` imports from `useTodayRoute.ts`
- `useTodayRoute.ts` now listens for the `baseline:after-replay` DOM event and calls `fetchRoute` to refresh route data after a successful replay
- `OfflineSyncManager.tsx` now dispatches `baseline:after-replay` via `window.dispatchEvent` as the `onAfterReplay` callback passed to `runReplay`

## Why
- `VITE_ENABLE_OTEM` was never set in production, making `executionMode` permanently `'LIVE'` and the entire offline queue path dead code
- Terminal actions (start/complete/skip) in LIVE mode called the API directly, caught failures with `alert()`, and lost the action permanently — the worker's work was gone on any network hiccup
- Queue-first makes every action durable by design; replay syncs to the server when connectivity is restored
- Route refresh after replay ensures the UI reflects the server's confirmed state

## Files touched
- `frontend/src/hooks/useTodayRoute.ts` — removed ENABLE_OTEM, rewrote three handlers, added after-replay listener, removed unused imports
- `frontend/src/offline/OfflineSyncManager.tsx` — added onAfterReplay callback dispatch, passed to runReplay
