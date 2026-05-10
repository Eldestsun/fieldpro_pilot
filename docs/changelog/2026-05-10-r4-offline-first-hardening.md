# 2026-05-10 — R4: Offline-First Hardening (complete)

R4 expanded the original "queue visibility UI" scope into a full offline-first sprint.
All five sub-tasks are done and committed on `refactor/baseline`.

---

## Sub-task A — Service Worker (PWA app shell cache)

**Files:** `frontend/package.json`, `frontend/vite.config.ts`, `frontend/public/manifest.json`

`vite-plugin-pwa` added. Workbox pre-caches the app shell (`**/*.{js,css,html,ico,png,svg}`) on first load with `navigateFallback: 'index.html'`. Service Worker registers with `autoUpdate`. PWA manifest published as `BASELINE FieldPro` / `FieldPro`.

**Verified:** Chrome DevTools → Application → Service Workers shows SW registered and active. Toggling Chrome offline + hard refresh serves app from cache with no network error.

---

## Sub-task B — OTEM enabled + queue-first action handlers

**Files:** `frontend/src/hooks/useTodayRoute.ts`, `frontend/src/offline/OfflineSyncManager.tsx`, `frontend/.env.local`

`VITE_ENABLE_OTEM` flag removed entirely. `executionMode` is now always derived from `offlineMode ? 'OFFLINE_TOLERANT' : 'LIVE'` — no build-time toggle. All three terminal action handlers (`handleStartStop`, `handleCompleteStop`, `handleSkipStop`) rewritten to enqueue-first: action is queued locally and returns success to the worker immediately; `OfflineSyncManager` replays on reconnect. All `alert()` calls removed from action handlers. `onAfterReplay` callback wired — fires `baseline:after-replay` DOM event after replay completes, triggering route refresh in `useTodayRoute`.

**Verified:** Chrome offline → start stop → action visible in queue, no error. Chrome online → replay fires → `core.visits` row confirmed in DB. `tsc --noEmit` passes clean.

**Known issue logged:** ISSUE-005 — `baseline:after-replay` fires on empty replays (no queued actions), causing `fetchRoute` loop on app load offline. Medium priority — deferred post-R4.

---

## Sub-task C — Route data cache + stop draft store

**Files:** `frontend/src/hooks/useTodayRoute.ts`, `frontend/src/components/today-route/StopDetail.tsx`

`todayRouteCache` wired: `saveTodayRouteCache(routeRun)` called after every successful `fetchRoute`; `loadTodayRouteCache()` called as fallback when `fetchRoute` fails with a network error. `stopDraftStore` wired: `saveStopDraft` fires on every checklist/safety/infra state change; `loadStopDraft` called on stop detail mount; resume banner renders when a valid draft (< 24 h old) is found; `clearStopDraft` called on completion, skip, and banner dismiss.

**Verified:** Route loads while online → Chrome offline → hard refresh → app loads from SW cache → route data loads from IndexedDB → stop list visible with no error screen. Stop draft partially filled → app closed → reopened → draft restored and resume banner shown.

---

## Sub-task D — Offline sync context + status UI

**Files (new):** `frontend/src/offline/OfflineSyncContext.tsx`, `frontend/src/components/ui/OfflineStatusBar.tsx`, `frontend/src/components/ui/ConflictResolutionModal.tsx`  
**Files (modified):** `frontend/src/offline/OfflineSyncManager.tsx`, `frontend/src/offline/offlineQueue.ts`, `frontend/src/App.tsx`

`OfflineSyncContext` exposes `OfflineSyncState` (`pendingCount`, `conflictCount`, `failedCount`, `syncStatus`, `conflictActions`, `isOfflineMode`) and `useOfflineSync()` hook. `OfflineSyncManager` extended to accept `children`, manage `syncState` via `useState`, track online/offline transitions, set `syncStatus = 'success'` for 3 s after replay completes, and render as `OfflineSyncContext.Provider`. `OfflineStatusBar` renders in 5 priority states: offline-queued (🔴), syncing (🟡), success (🟢 auto-dismiss 3 s), conflict (🟠 tap to review), failed (🔴); returns `null` when clear and online. `ConflictResolutionModal` lists each conflict action with stop ID, conflict type, Dismiss button (calls `dismissConflict`), and Copy Info button (copies details to clipboard for Lead). `dismissConflict(tenantId, oid, actionId)` added to `offlineQueue.ts` as the only new export — sets action to `'done'` and persists. `OfflineSyncManager` now wraps `OfflineStatusBar` as a child in `App.tsx`, giving the bar access to context.

**Verified:** `useOfflineSync()` importable and returns correct state. `OfflineStatusBar` renders in app shell. Returns `null` when queue empty and online. `ConflictResolutionModal` renders for conflict-status actions. `dismissConflict` is the only new export in `offlineQueue.ts`. `tsc --noEmit` passes clean.

---

## Sub-task E — Dead letter and retry hardening

**File:** `frontend/src/offline/offlineQueue.ts`

`retryCount?: number` added to `OfflineAction` interface. In `runReplay` error handling: `RETRY_NEEDED_PHOTO_MISSING` errors now reset the action to `pending` with `retryCount + 1` for the first three failures; on the fourth failure the action falls through to `failed` permanently. `retryCount` is persisted in `localStorage` with the action so retry state survives app restart.

**Verified:** `retryCount` present on `OfflineAction` type. Logic branches correctly at `retryCount < 3`. `tsc --noEmit` passes clean.

**Known issue logged:** ISSUE-006 — `memoryCache` may not flush to `localStorage` before tab crash during offline session. Medium priority — deferred pre-scale.

---

## DB verification — Stop 79213 (route_run_stop_id 17)

Live stop completed during R4 sign-off session. Confirmed correct writes:

| Layer | Result |
|-------|--------|
| `route_run_stops.status` | `done` |
| `core.visits.outcome` | `completed` |
| `core.visits.ended_at` | non-null |
| `core.visits.actor_oid` | real Entra OID |
| `core.observations` | 10 rows (ground, trash_can, shelter, pad before/after pairs + washed_can + trash_volume) |
| `core.evidence` | 1 row (completion photo, correct storage_key, OID) |
| `clean_logs` | still receiving rows — no regression |
| `stop_photos` | still receiving rows — no regression |

---

## R4 Overall Done Criteria — all met

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
- [x] Changelogs written for all sub-tasks and overall sprint
- [x] DB write correctness verified live against stop 79213

## Known issues deferred from R4

- ISSUE-005 — `baseline:after-replay` fires on empty replays (medium)
- ISSUE-006 — `memoryCache` durability on tab crash (medium, pre-scale)
