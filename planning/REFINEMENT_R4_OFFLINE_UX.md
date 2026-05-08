# R4 — Offline UX — Worker Feedback Layer

> **Goal**: Make the offline queue visible to the worker — show pending action count, surface conflict errors that require attention, and confirm when sync succeeds or fails.
>
> **Status**: 🔴 Not started
> **Depends on**: Nothing (unblocked)
> **Blocks**: Nothing

---

## Context

The offline queue and replay engine are production-quality. `OfflineSyncManager` subscribes to the queue, detects pending actions, and replays them when connectivity returns. The queue correctly handles auth errors, network errors, conflicts, and idempotency.

But **none of this is visible to the worker**. Today:
- A worker completes stops offline — no indicator that actions are queued
- When connectivity returns, replay fires silently — no confirmation that sync succeeded
- If a conflict occurs (`ROUTE_REASSIGNED`, `ROUTE_NOT_FOUND`) — the action sits in `conflict` status forever with no UI surface
- If replay partially fails — the worker has no idea which stops synced and which didn't

The infrastructure for building this UI already exists. `offlineQueue.ts` exports a `subscribe()` function that fires on every queue state change. `OfflineSyncManager.tsx` is a headless component — it's the right place to derive state that a status UI can consume.

This item adds the **worker-facing layer** on top of the existing engine. It does not modify the queue mechanics.

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/src/offline/OfflineSyncManager.tsx` | Expose queue summary state (pending count, conflict count, last sync result) via a React context |
| `frontend/src/offline/OfflineSyncContext.tsx` (new) | Context + provider for offline status state |
| `frontend/src/components/ui/OfflineStatusBar.tsx` (new) | Floating status bar component: shows pending count, sync in progress, conflicts requiring attention |
| `frontend/src/components/ui/ConflictResolutionModal.tsx` (new) | Modal for surfacing `conflict`-status actions to the worker with actionable options |
| `frontend/src/App.tsx` | Mount `OfflineStatusBar` in the app shell |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| `frontend/src/offline/offlineQueue.ts` | Offline contract frozen — do not change queue mechanics |
| `frontend/src/offline/photoStore.ts` | Frozen |
| `frontend/src/offline/stopDraftStore.ts` | Frozen |
| All backend files | Frontend-only change |

---

## Change 1 — Offline Sync Context

### `frontend/src/offline/OfflineSyncContext.tsx` (new)

```tsx
import { createContext, useContext } from 'react'

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export interface OfflineSyncState {
  pendingCount: number        // actions with status 'pending'
  conflictCount: number       // actions with status 'conflict'
  failedCount: number         // actions with status 'failed'
  syncStatus: SyncStatus      // current replay state
  conflictActions: OfflineAction[]  // actions needing user attention
  isOfflineMode: boolean      // manual offline mode active
}

export const OfflineSyncContext = createContext<OfflineSyncState>({
  pendingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  syncStatus: 'idle',
  conflictActions: [],
  isOfflineMode: false,
})

export const useOfflineSync = () => useContext(OfflineSyncContext)
```

### `OfflineSyncManager.tsx` — extend to provide context

Add state derived from the queue subscription and expose it via `OfflineSyncContext.Provider`:

```tsx
const [syncState, setSyncState] = useState<OfflineSyncState>({ ... })

// In subscribe callback:
const unsub = subscribe(tenantId, oid, (queueState) => {
  setSyncState({
    pendingCount: queueState.actions.filter(a => a.status === 'pending').length,
    conflictCount: queueState.actions.filter(a => a.status === 'conflict').length,
    failedCount: queueState.actions.filter(a => a.status === 'failed').length,
    syncStatus: isReplayingRef.current ? 'syncing' : 'idle',
    conflictActions: queueState.actions.filter(a => a.status === 'conflict'),
    isOfflineMode: getOfflineMode(),
  })
})

return (
  <OfflineSyncContext.Provider value={syncState}>
    {/* OfflineSyncManager is headless but now wraps children with context */}
  </OfflineSyncContext.Provider>
)
```

---

## Change 2 — Offline Status Bar Component

### `frontend/src/components/ui/OfflineStatusBar.tsx` (new)

A fixed-position floating bar. Only visible when there is something to communicate.

**States to show:**

| Condition | Display |
|-----------|---------|
| `isOfflineMode = true` | 🔴 "Offline mode — actions queued" |
| `pendingCount > 0` + online | 🟡 "Syncing N actions..." |
| `syncStatus = 'success'` | 🟢 "All actions synced" (auto-dismiss after 3s) |
| `conflictCount > 0` | 🟠 "N stops need attention" + tap to open conflict modal |
| `failedCount > 0` | 🔴 "N actions failed" + tap to see details |
| All clear + online | Hidden |

Design: fixed bottom bar on mobile (above the browser chrome), top bar on desktop. Non-blocking — does not prevent interaction.

---

## Change 3 — Conflict Resolution Modal

### `frontend/src/components/ui/ConflictResolutionModal.tsx` (new)

Surfaces when `conflictCount > 0`. Shows each conflicted action with:
- The stop name/ID
- The conflict type (`ROUTE_REASSIGNED` or `ROUTE_NOT_FOUND`)
- Two options: **Dismiss** (mark as acknowledged, remove from queue) or **Contact Lead** (copy stop info to clipboard for reporting)

```tsx
interface ConflictResolutionModalProps {
  conflicts: OfflineAction[]
  onDismiss: (actionId: string) => void
  onClose: () => void
}
```

The `onDismiss` handler calls `dismissConflict(actionId)` — a new export from `offlineQueue.ts` that sets the action status to `'done'` and removes it from the queue. This is the only addition to `offlineQueue.ts` permitted — a simple status mutation, not a mechanic change.

---

## R4 Overall Done Definition

R4 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `OfflineSyncContext` is provided and accessible via `useOfflineSync()`
- [ ] `OfflineStatusBar` shows pending count when actions are queued offline
- [ ] `OfflineStatusBar` shows "syncing" indicator during replay
- [ ] `OfflineStatusBar` shows success confirmation after clean replay
- [ ] `ConflictResolutionModal` surfaces when conflict-status actions exist
- [ ] Worker can dismiss a conflict from the UI
- [ ] Status bar is hidden when queue is empty and online
- [ ] No changes to queue mechanics (`offlineQueue.ts` action schema or replay order)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r4-offline-ux.md`

---

## Agent Launch Blocks

### Step 1 — Context and OfflineSyncManager extension

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md.
Create frontend/src/offline/OfflineSyncContext.tsx with the OfflineSyncState type
and context as defined in the file.
Extend OfflineSyncManager.tsx to derive syncState from the queue subscription
and expose it via OfflineSyncContext.Provider.
Do not change offlineQueue.ts mechanics or the replay logic.
```

### Step 2 — Status bar and conflict modal

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R4_OFFLINE_UX.md.
Create OfflineStatusBar.tsx and ConflictResolutionModal.tsx as specified.
Add OfflineStatusBar to App.tsx in the app shell (outside of Routes, alongside OfflineSyncManager).
The only addition to offlineQueue.ts is a dismissConflict(actionId) function
that sets an action's status to 'done'.
```
