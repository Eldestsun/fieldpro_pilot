# 2026-05-11 — Fix ISSUE-005: gate baseline:after-replay on successful terminal action

## What changed
- `offlineQueue.ts`: `runReplay` now returns `Promise<boolean>` instead of `Promise<void>`. Returns `true` when at least one terminal stop action (`COMPLETE_STOP` or `SKIP_STOP_WITH_HAZARD`) succeeded; `false` on empty queue or all-failure runs. The `onAfterReplay` callback parameter was removed.
- `OfflineSyncManager.tsx`: `attemptReplay` is now `async`. The `window.dispatchEvent(new Event('baseline:after-replay'))` call is gated on the boolean returned by `runReplay`, replacing the unconditional `onAfterReplay` callback pattern.

## Why
- `baseline:after-replay` was firing on every replay attempt including empty-queue runs. `useTodayRoute` listens for this event and calls `fetchRoute`, which failed when offline, which triggered another replay, which fired the event again — an infinite loop causing UI flicker and excessive failed network requests.
- Guard is scoped to terminal stop actions (not `START_STOP` / `UPLOAD_STOP_PHOTOS`) because only a completed or skipped stop changes the route state that `fetchRoute` needs to refresh.

## Files touched
- `frontend/src/offline/offlineQueue.ts`
- `frontend/src/offline/OfflineSyncManager.tsx`
