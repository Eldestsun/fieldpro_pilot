# 2026-05-10 — R4 Sub-task D: Offline Sync Context + Status UI

## What changed
- Created `frontend/src/offline/OfflineSyncContext.tsx` — React context providing `OfflineSyncState` (pendingCount, conflictCount, failedCount, syncStatus, conflictActions, isOfflineMode) and `useOfflineSync()` hook
- Extended `frontend/src/offline/OfflineSyncManager.tsx` — now accepts `children`, manages syncState via useState, tracks online/offline transitions, sets syncStatus to 'success' for 3 seconds after replay completes, wraps return with `OfflineSyncContext.Provider`
- Created `frontend/src/components/ui/OfflineStatusBar.tsx` — fixed-position status bar with 5 priority states: offline-queued (🔴), syncing (🟡), success (🟢), conflict (🟠), failed (🔴); returns null when all clear and online
- Created `frontend/src/components/ui/ConflictResolutionModal.tsx` — modal listing ROUTE_REASSIGNED/ROUTE_NOT_FOUND conflicts; Dismiss and Copy Info buttons per action
- Added `dismissConflict(tenantId, oid, actionId)` export to `frontend/src/offline/offlineQueue.ts` — sets conflict action to 'done' and persists
- Updated `frontend/src/App.tsx` — `OfflineSyncManager` now wraps `OfflineStatusBar` as a child, giving the status bar access to `OfflineSyncContext`

## Why
- The offline queue and replay engine were production-quality but entirely invisible to field workers
- Workers had no way to know if actions were queued, syncing, or conflicted
- ROUTE_REASSIGNED conflicts silently accumulated with no dismiss path

## Files touched
- `frontend/src/offline/OfflineSyncContext.tsx` (new)
- `frontend/src/offline/OfflineSyncManager.tsx`
- `frontend/src/components/ui/OfflineStatusBar.tsx` (new)
- `frontend/src/components/ui/ConflictResolutionModal.tsx` (new)
- `frontend/src/offline/offlineQueue.ts`
- `frontend/src/App.tsx`
