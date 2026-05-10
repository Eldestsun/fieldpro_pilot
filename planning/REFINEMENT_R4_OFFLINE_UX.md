R4 — Offline-First Hardening (Expanded)
Original scope: Queue visibility UI
Expanded scope: Make the app genuinely offline-first — queue-first actions, Service Worker app shell cache, route data cache, then visibility UI on top
Status: 🔴 Not started
Depends on: Nothing (unblocked)
Blocks: Tier 1 final sign-off (offline replay done-criteria)

What this sprint delivers
When complete, a UL worker can:

Open the app with zero network signal — it loads from cache
See their route from earlier in the shift — loaded from IndexedDB
Start, complete, skip stops and upload photos — all actions queue locally and return success immediately
Drive back to base, connect to wifi — everything replays automatically and silently
See a status bar confirming sync completed


Sub-task A — Service Worker (app shell cache)
Why first: If the app doesn't load offline, nothing else matters.
Use vite-plugin-pwa. It generates a Service Worker that pre-caches the app shell on first load. Zero custom Service Worker code required.
Files to touch:
FileChangefrontend/package.jsonAdd vite-plugin-pwa dependencyfrontend/vite.config.tsRegister VitePWA plugin with manifest and workbox configfrontend/public/manifest.json (new)PWA manifest — name, icons, display mode
Workbox config:
tsVitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    navigateFallback: 'index.html',
  },
  manifest: {
    name: 'BASELINE FieldPro',
    short_name: 'FieldPro',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
  }
})
Done criteria:

Chrome DevTools → Application → Service Workers shows SW registered and active
Toggle Chrome to offline, hard refresh — app loads from cache, no network error
No changes to any business logic files


Sub-task B — Enable OTEM + queue-first action handlers
Why: VITE_ENABLE_OTEM is never set. executionMode is permanently 'LIVE'. The entire offline queue path is unreachable dead code.
Part 1 — Enable OTEM unconditionally
Remove the feature flag entirely. OTEM is not experimental — it is the architecture. The mode should be determined by network state, not a build flag.
Files to touch:
FileChangefrontend/src/hooks/useTodayRoute.tsRemove ENABLE_OTEM flag check. executionMode = offlineMode ? 'OFFLINE_TOLERANT' : 'LIVE' alwaysfrontend/.env.localRemove VITE_ENABLE_OTEM if present
Part 2 — Queue-first for all terminal actions
Currently handleStartStop, handleCompleteStop, handleSkipStop in LIVE mode: call API directly, catch failure with alert(), lose the action. Replace with queue-first pattern:
All modes:
  → enqueue action locally → return success to worker immediately
  → OfflineSyncManager replays when online

Remove alert() on network failure entirely.
Files to touch:
FileChangefrontend/src/hooks/useTodayRoute.tsRewrite handleStartStop, handleCompleteStop, handleSkipStop to always enqueue firstfrontend/src/offline/OfflineSyncManager.tsxAdd onAfterReplay callback that triggers route data refresh
Done criteria:

Chrome offline → start stop → no error, action appears in queue
Chrome online → replay fires → core.visits row created in DB
No alert() calls remain in action handlers
Route refreshes from server after successful replay


Sub-task C — Wire route data cache
Why: todayRouteCache.ts exists and is never called. Worker goes offline mid-shift, app is refreshed — routeRun is null, worker sees error screen with no data.
Files to touch:
FileChangefrontend/src/hooks/useTodayRoute.tsCall saveTodayRouteCache after successful fetchRoute. Call loadTodayRouteCache as fallback when fetchRoute fails with network errorfrontend/src/hooks/useTodayRoute.tsWire stopDraftStore — call saveStopDraft on checklist/safety/infra state changes, loadStopDraft on stop detail mount, clearStopDraft on stop completion
Done criteria:

Worker loads route while online
Chrome → offline → hard refresh
App loads from Service Worker cache
Route data loads from IndexedDB — stop list visible, no error screen
Worker completes a stop partway, closes app, reopens — checklist state restored from draft


Sub-task D — Offline sync context + status UI
This is the original R4 scope, now built on top of a system that actually works.
Files to touch:
FileChangefrontend/src/offline/OfflineSyncContext.tsx (new)Context + provider for offline status statefrontend/src/offline/OfflineSyncManager.tsxExpose queue summary state via OfflineSyncContext.Providerfrontend/src/components/ui/OfflineStatusBar.tsx (new)Status bar: offline indicator, pending count, syncing state, success confirmationfrontend/src/components/ui/ConflictResolutionModal.tsx (new)Surfaces conflict-status actions with dismiss optionfrontend/src/App.tsxMount OfflineStatusBar in app shell
Status bar states:
ConditionDisplayOffline, actions queued🔴 "Offline — N actions queued"Online, syncing🟡 "Syncing N actions..."Sync complete🟢 "All synced" (auto-dismiss 3s)Conflicts exist🟠 "N stops need attention" → tap opens modalAll clearHidden
Done criteria:

Status bar reflects real queue state
Goes offline → bar appears immediately
Comes online → bar shows syncing → shows success → disappears
Conflict modal surfaces and allows dismiss


Sub-task E — Dead letter and retry hardening
Address the gaps that cause permanent data loss:
Files to touch:
FileChangefrontend/src/offline/offlineQueue.tsRETRY_NEEDED_PHOTO_MISSING error class — reset to pending instead of failed. Maximum retry count (3) before marking failed permanently
Done criteria:

RETRY_NEEDED_PHOTO_MISSING retries up to 3 times before dead-lettering
Retry count visible in queue state for debugging


R4 Overall Done Definition
R4 is complete when ALL of the following are true:

 Service Worker registered — app loads offline after first visit
 VITE_ENABLE_OTEM flag removed — offline mode determined by network state only
 Start/complete/skip always queue-first — no alert() on network failure
 Route data loads from IndexedDB cache when offline
 Stop draft state persists across app close/reopen
 Route refreshes from server after successful replay
 OfflineStatusBar reflects real queue state
 ConflictResolutionModal surfaces and allows dismiss
 Offline replay end-to-end verified: offline → complete stops → online → DB rows confirmed
 Tier 1 offline done-criteria signed off
 Changelog written to docs/changelog/YYYY-MM-DD-r4-offline-first-hardening.md

 Here are all five agent launch blocks, ready to paste into the R4 file.

---
## Agent Launch Blocks

### Sub-task A — Service Worker

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md, Sub-task A only.

Install vite-plugin-pwa and configure it in vite.config.ts.
Create frontend/public/manifest.json with the BASELINE FieldPro PWA manifest.

Exact workbox config to use:
  registerType: 'autoUpdate'
  globPatterns: ['**/*.{js,css,html,ico,png,svg}']
  navigateFallback: 'index.html'

Manifest fields:
  name: 'BASELINE FieldPro'
  short_name: 'FieldPro'
  display: 'standalone'
  background_color: '#ffffff'
  theme_color: '#000000'

Do not touch any business logic files, hooks, components, or backend files.
Do not touch offlineQueue.ts, authz.ts, AuthContext.tsx, or any auth files.

Done criteria to verify before finishing:
- vite-plugin-pwa is in package.json dependencies
- VitePWA plugin is registered in vite.config.ts
- frontend/public/manifest.json exists with correct fields
- npm run build completes without errors

Write changelog entry to docs/changelog/2026-05-10-r4a-service-worker.md
listing all files touched.
```

---

### Sub-task B — Enable OTEM + Queue-First Action Handlers

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md, Sub-task B only.
Also read frontend/src/hooks/useTodayRoute.ts and 
frontend/src/offline/OfflineSyncManager.tsx in full before making any changes.

This sub-task has two parts. Complete both before verifying done criteria.

PART 1 — Remove VITE_ENABLE_OTEM feature flag:
- In useTodayRoute.ts, remove the ENABLE_OTEM constant and its import.meta.env check
- executionMode should be computed as:
    const executionMode: ExecutionMode = offlineMode ? 'OFFLINE_TOLERANT' : 'LIVE'
- Remove VITE_ENABLE_OTEM from frontend/.env.local if present
- Do not change anything else about how offlineMode is derived

PART 2 — Queue-first action handlers:
- Rewrite handleStartStop so it always enqueues the START_STOP action 
  regardless of executionMode, then returns immediately. Remove the direct 
  API call from this handler entirely. Remove any alert() on network failure.
- Rewrite handleCompleteStop so it always enqueues COMPLETE_STOP first,
  returns immediately. Remove direct API call. Remove alert().
- Rewrite handleSkipStop so it always enqueues SKIP_STOP_WITH_HAZARD first,
  returns immediately. Remove direct API call. Remove alert().
- Photo upload (handleFileUpload / uploadPhotos) already falls back to queue
  on network failure — leave it as-is for now.

PART 3 — Wire onAfterReplay route refresh:
- In OfflineSyncManager.tsx, pass an onAfterReplay callback to runReplay
  that triggers a route data refresh. The refresh should call whatever 
  function useTodayRoute exposes to re-fetch the route from the server.
  If no such function is currently exposed, add a refreshRoute export 
  to useTodayRoute and call it from onAfterReplay.

Do not touch offlineQueue.ts mechanics or replay order.
Do not touch authz.ts, AuthContext.tsx, or any auth files.
Do not touch any backend files.
TypeScript must compile clean after all changes.

Done criteria to verify before finishing:
- ENABLE_OTEM constant is gone from useTodayRoute.ts
- executionMode is determined by offlineMode state only
- handleStartStop, handleCompleteStop, handleSkipStop contain no direct API calls
- No alert() calls remain in any of the three handlers
- OfflineSyncManager passes onAfterReplay to runReplay
- tsc --noEmit passes clean

Write changelog entry to docs/changelog/2026-05-10-r4b-queue-first-handlers.md
listing all files touched and all alert() calls removed.
```

---

### Sub-task C — Route Data Cache + Stop Draft Store

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md, Sub-task C only.
Also read these files in full before making any changes:
- frontend/src/hooks/useTodayRoute.ts
- frontend/src/offline/todayRouteCache.ts (if it exists — report if not found)
- frontend/src/offline/stopDraftStore.ts

This sub-task has two parts.

PART 1 — Wire todayRouteCache:
- In useTodayRoute.ts, after fetchRoute succeeds and routeRun is set,
  call saveTodayRouteCache(routeRun) to persist the route to IndexedDB.
- In the fetchRoute error handler, when the error is a network failure
  (check using the existing isNetworkFailure helper or navigator.onLine),
  call loadTodayRouteCache() and use the result as routeRun if it exists.
  If cache returns null, surface the existing error state.
- Do not change the fetchRoute function itself — only add cache calls 
  around it in the hook.

PART 2 — Wire stopDraftStore:
- When a worker is on the stop detail screen and modifies checklist state,
  safety state, or infra state, save a draft via saveStopDraft(stopId, draftData).
  Draft data shape: { checklist, safety, infra, timestamp }.
- On stop detail mount, call loadStopDraft(stopId). If a draft exists and
  is less than 24 hours old, restore state from it and show a 
  "Resume from where you left off" banner that the worker can dismiss.
- On stop completion or skip (success), call clearStopDraft(stopId).
- On banner dismiss, call clearStopDraft(stopId).

Do not touch offlineQueue.ts, authz.ts, AuthContext.tsx, or any auth files.
Do not touch any backend files.
Do not touch the cache or draft store implementations themselves — 
only add call sites in useTodayRoute.ts and relevant stop detail components.
TypeScript must compile clean after all changes.

Done criteria to verify before finishing:
- saveTodayRouteCache is called after successful fetchRoute
- loadTodayRouteCache is called as fallback on network failure
- saveStopDraft is called on checklist/safety/infra state changes
- loadStopDraft is called on stop detail mount
- clearStopDraft is called on completion, skip, and banner dismiss
- Resume banner renders when a valid draft exists
- tsc --noEmit passes clean

Write changelog entry to docs/changelog/2026-05-10-r4c-route-cache-draft-store.md
listing all files touched.
```

---

### Sub-task D — Offline Sync Context + Status UI

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md, Sub-task D only.
Also read these files in full before making any changes:
- frontend/src/offline/OfflineSyncManager.tsx
- frontend/src/App.tsx

Complete all steps in order.

STEP 1 — Create OfflineSyncContext.tsx:
Create frontend/src/offline/OfflineSyncContext.tsx with:
  - SyncStatus type: 'idle' | 'syncing' | 'success' | 'error'
  - OfflineSyncState interface: 
      pendingCount: number
      conflictCount: number
      failedCount: number
      syncStatus: SyncStatus
      conflictActions: OfflineAction[]
      isOfflineMode: boolean
  - OfflineSyncContext with safe defaults (all zeros, idle, empty array, false)
  - useOfflineSync() hook export

STEP 2 — Extend OfflineSyncManager to provide context:
- Add useState<OfflineSyncState> initialized to the same defaults
- In the queue subscribe callback, derive syncState from queueState:
    pendingCount = actions filtered by status === 'pending'
    conflictCount = actions filtered by status === 'conflict'
    failedCount = actions filtered by status === 'failed'
    syncStatus = isReplayingRef.current ? 'syncing' : 'idle'
    conflictActions = actions filtered by status === 'conflict'
    isOfflineMode = getOfflineMode()
- After successful replay, set syncStatus to 'success' for 3 seconds,
  then reset to 'idle'
- Wrap the return with OfflineSyncContext.Provider value={syncState}

STEP 3 — Create OfflineStatusBar.tsx:
Create frontend/src/components/ui/OfflineStatusBar.tsx
Conditions and display (in priority order):
  - isOfflineMode true → 🔴 "Offline — {pendingCount} actions queued"
  - syncStatus === 'syncing' → 🟡 "Syncing {pendingCount} actions..."
  - syncStatus === 'success' → 🟢 "All synced" (auto-dismiss after 3 seconds)
  - conflictCount > 0 → 🟠 "{conflictCount} stops need attention" 
    (tappable — opens ConflictResolutionModal)
  - failedCount > 0 → 🔴 "{failedCount} actions failed"
  - All clear and online → render nothing (return null)
Fixed position: bottom of screen on mobile, top on desktop.
Non-blocking — does not prevent interaction with content beneath it.

STEP 4 — Create ConflictResolutionModal.tsx:
Create frontend/src/components/ui/ConflictResolutionModal.tsx
Props: { conflicts: OfflineAction[], onDismiss: (actionId: string) => void, onClose: () => void }
For each conflict show: stop ID, conflict type (ROUTE_REASSIGNED or ROUTE_NOT_FOUND),
two action buttons: "Dismiss" (calls onDismiss) and "Copy Info" (copies stop details 
to clipboard for reporting to Lead).
onDismiss calls a dismissConflict(actionId) function — add this as the only new 
export to offlineQueue.ts. It sets the action status to 'done' and persists.
This is the one authorized addition to offlineQueue.ts for this sub-task.

STEP 5 — Mount in App.tsx:
Add OfflineStatusBar to App.tsx in the app shell, outside of Routes,
alongside the existing OfflineSyncManager mount.

Do not change offlineQueue.ts mechanics, replay order, or action schema
beyond the single dismissConflict export.
Do not touch authz.ts, AuthContext.tsx, or any auth files.
Do not touch any backend files.
TypeScript must compile clean after all changes.

Done criteria to verify before finishing:
- useOfflineSync() is importable and returns correct state
- OfflineStatusBar renders in the app shell
- OfflineStatusBar returns null when queue is empty and online
- ConflictResolutionModal renders for conflict-status actions
- dismissConflict is the only new export added to offlineQueue.ts
- tsc --noEmit passes clean

Write changelog entry to docs/changelog/2026-05-10-r4d-offline-sync-ui.md
listing all files touched.
```

---

### Sub-task E — Dead Letter and Retry Hardening

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md, Sub-task E only.
Also read frontend/src/offline/offlineQueue.ts in full before making any changes.

This is a targeted change to runReplay error handling only.
Do not touch any other part of offlineQueue.ts.

CHANGE 1 — RETRY_NEEDED_PHOTO_MISSING should not be a permanent dead letter:
- Find where runReplay handles errors that don't match isAuthError or isNetworkError
- Currently these fall through to status = 'failed' (permanent)
- Add a specific check: if error.message === 'RETRY_NEEDED_PHOTO_MISSING'
  AND action.retryCount < 3, reset status to 'pending' and increment retryCount
- If retryCount >= 3, allow it to fall through to 'failed' as before
- Add retryCount: number (default 0) to the OfflineAction type if not present

CHANGE 2 — Add retryCount to OfflineAction type:
- If OfflineAction does not already have a retryCount field, add it
  as an optional field: retryCount?: number
- Default to 0 wherever actions are created

Do not change action schema in any other way.
Do not touch any frontend component files.
Do not touch any backend files.
Do not touch authz.ts or AuthContext.tsx.
TypeScript must compile clean after all changes.

Done criteria to verify before finishing:
- RETRY_NEEDED_PHOTO_MISSING resets to pending with incremented retryCount
  for the first 3 attempts
- On the 4th failure it marks as 'failed' permanently
- retryCount is present on the OfflineAction type
- tsc --noEmit passes clean
- No other changes to offlineQueue.ts beyond these two

Write changelog entry to docs/changelog/2026-05-10-r4e-retry-hardening.md
listing all files touched.
```

---

**Execution order for the agent:**

Run A first, verify build passes. Then B — this is the one that makes offline actually reachable, verify it manually before proceeding. Then C, D, E can run in sequence. Don't run D before B — the status bar showing "offline" only matters if offline mode can actually activate.