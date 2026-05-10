# 2026-05-10 — R4 Offline-First Hardening (complete)

## What changed

Five sub-tasks delivered across two sessions:

**A — Service Worker (PWA app shell cache)**
- `vite-plugin-pwa` added; Service Worker pre-caches app shell on first load
- App loads from cache when offline — no network required after first visit
- See: `2026-05-10-r4a-service-worker.md`

**B — OTEM enabled + queue-first action handlers**
- `VITE_ENABLE_OTEM` flag removed; offline mode now determined by `navigator.onLine` only
- `handleStartStop`, `handleCompleteStop`, `handleSkipStop` all enqueue-first — no direct API call, no `alert()` on network failure
- Route refreshes from server after successful replay via `onAfterReplay` callback
- See: `2026-05-10-r4b-queue-first-handlers.md`

**C — Route data cache + stop draft store**
- `todayRouteCache` wired: route persisted to IndexedDB after fetch, loaded as fallback on network failure
- `stopDraftStore` wired: checklist/safety/infra state saved on every change, restored on mount, cleared on completion
- Resume banner surfaces when a valid draft is found
- See: `2026-05-10-r4c-route-cache-draft-store.md`

**D — Offline sync context + status UI**
- `OfflineSyncContext.tsx` provides `OfflineSyncState` to the entire app
- `OfflineSyncManager` extended to manage and expose context state; accepts children
- `OfflineStatusBar` reflects real queue state across 5 states (offline, syncing, success, conflict, failed)
- `ConflictResolutionModal` surfaces ROUTE_REASSIGNED / ROUTE_NOT_FOUND conflicts with Dismiss + Copy Info
- `dismissConflict` added to `offlineQueue.ts` as the only new export
- See: `2026-05-10-r4d-offline-sync-ui.md`

**E — Dead letter and retry hardening**
- `retryCount` added to `OfflineAction` type
- `RETRY_NEEDED_PHOTO_MISSING` resets to pending (up to 3 retries) before permanent dead-letter
- See: `2026-05-10-r4e-retry-hardening.md`

## Why
- A worker going offline mid-shift previously saw: app reload error, lost route data, lost stop state, silent action discard, and no feedback on what happened
- Every gap in that list is now closed

## R4 Done Criteria — all met
- [x] Service Worker registered — app loads offline after first visit
- [x] VITE_ENABLE_OTEM flag removed — offline mode determined by network state only
- [x] Start/complete/skip always queue-first — no alert() on network failure
- [x] Route data loads from IndexedDB cache when offline
- [x] Stop draft state persists across app close/reopen
- [x] Route refreshes from server after successful replay
- [x] OfflineStatusBar reflects real queue state
- [x] ConflictResolutionModal surfaces and allows dismiss
- [x] Offline replay structural path verified (START_STOP → UPLOAD_STOP_PHOTOS → COMPLETE_STOP); integration test deferred to Tier 6
- [x] Tier 1 offline done-criteria signed off
- [x] Changelogs written for all sub-tasks

## Files touched (summary)
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/public/manifest.json`
- `frontend/src/hooks/useTodayRoute.ts`
- `frontend/src/offline/offlineQueue.ts`
- `frontend/src/offline/OfflineSyncManager.tsx`
- `frontend/src/offline/OfflineSyncContext.tsx` (new)
- `frontend/src/offline/todayRouteCache.ts`
- `frontend/src/offline/stopDraftStore.ts`
- `frontend/src/components/ui/OfflineStatusBar.tsx` (new)
- `frontend/src/components/ui/ConflictResolutionModal.tsx` (new)
- `frontend/src/App.tsx`
