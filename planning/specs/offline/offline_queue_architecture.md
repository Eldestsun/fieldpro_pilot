# Offline Queue Architecture

> Reference spec — describes the current offline system as implemented.
> Last reviewed: 2026-05-08

---

## Purpose

BASELINE operates in environments with unreliable or absent connectivity. Field workers must be able to complete stops, capture photos, and record safety skips even when the device has no network access. The offline queue ensures those actions are durably recorded locally and replayed to the backend when connectivity returns.

This is a first-class system requirement — not a progressive enhancement.

---

## Storage Architecture

Two separate storage mechanisms are used:

| Store | Technology | Contents | Key format |
|-------|------------|----------|------------|
| **Offline Queue** | `localStorage` | Action metadata, status, payloads (no blobs) | `fieldpro-offline-queue:{tenantId}:{oid}` |
| **IndexedDB** (`fieldpro-offline`, v2) | IndexedDB | Photo blobs (`photos` store), stop drafts (`stopDrafts` store) | `localPhotoId` (photos), `{tenantId}:{oid}:{routeRunStopId}` (drafts) |

The queue and IndexedDB are keyed by `(tenantId, oid)` — each authenticated user has an independent queue. No cross-user data leakage is possible from the storage layer.

---

## Action Types

| Type | Triggered by | Payload |
|------|-------------|---------|
| `UPLOAD_STOP_PHOTOS` | Photo captured offline | `{ kind, localPhotoIds[], routeRunStopId, routeRunId }` |
| `START_STOP` | Stop started offline | `{ routeRunStopId }` |
| `SKIP_STOP_WITH_HAZARD` | Stop skipped offline | `{ routeRunStopId, ...hazardPayload }` |
| `COMPLETE_STOP` | Stop completed offline | `{ routeRunStopId, ...completeStopPayload }` |

Photo blobs are stored separately in IndexedDB (`photoStore.ts`). The queue action holds only `localPhotoIds[]` — references to IndexedDB keys, not the blobs themselves. This prevents `localStorage` from being bloated by binary data.

---

## Action Status Lifecycle

```
pending → running → done
                 ↘ failed      (non-retriable error)
                 ↘ conflict    (ROUTE_NOT_FOUND, ROUTE_REASSIGNED)
                 ↘ pending     (auth error or network error → reset and stop replay)
```

| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be replayed |
| `running` | Currently being replayed |
| `done` | Successfully applied to backend |
| `failed` | Non-retriable error (validation failure, unexpected server error) |
| `conflict` | Backend reports a routing conflict — requires user or lead intervention |

---

## Execution Mode

Actions carry an optional `executionMode` field:
- `OFFLINE_TOLERANT` — queued intentionally while the worker is in offline mode
- `LIVE` — queued as a fallback when a live call failed (network drop mid-action)

This distinction is available for UI display and debugging but does not affect replay logic.

---

## Deduplication Rules

The queue applies deduplication at enqueue time to prevent double-submission:

| Action type | Deduplication logic |
|------------|-------------------|
| `UPLOAD_STOP_PHOTOS` | Merge `localPhotoIds` into existing pending action for same `(stopId, kind)` |
| `START_STOP` | Ignore if a pending/running `START_STOP` for the same stop already exists |
| `SKIP_STOP_WITH_HAZARD` | Replace existing pending skip for the same stop with latest payload |
| `COMPLETE_STOP` | No deduplication at enqueue; backend handles idempotency via `client_visit_id` |

---

## Replay Ordering

`runReplay()` in `offlineQueue.ts` enforces a deterministic dependency order:

```
1. UPLOAD_STOP_PHOTOS   ← photos must exist on the backend before completion
2. START_STOP           ← stop must be started before it can be completed
3. SKIP_STOP_WITH_HAZARD
4. COMPLETE_STOP
```

Within each type, actions are replayed FIFO by `createdAt`.

Replay stops on the first auth error or network error (those actions are reset to `pending`). Other errors are classified as `failed` or `conflict` and do not block subsequent unrelated actions.

---

## Stop-Draft Store

`stopDraftStore.ts` persists the in-progress wizard state for a stop that is partially filled in.

- **Database**: `fieldpro-offline` (IndexedDB v2), store `stopDrafts`
- **Key**: `{tenantId}:{oid}:{routeRunStopId}`
- **Contents**: Current `stepIndex`, `stepKey`, and partial wizard fields (`checklist`, `trashVolume`, `safety`, `infra`)
- **Lifecycle**: Written on every wizard step change; cleared on successful stop completion

If a worker is mid-wizard and the app closes (connectivity loss, crash, battery), the draft is restored from IndexedDB on next open. The worker continues from where they left off.

---

## Photo Store

`photoStore.ts` persists photo blobs captured before or during a stop.

- **Database**: `fieldpro-offline` (IndexedDB v2), store `photos`
- **Key**: `localPhotoId` (UUID generated at capture time)
- **Contents**: `{ localPhotoId, tenantId, oid, routeRunStopId, kind, filename, contentType, blob }`
- **Lifecycle**: Written at capture time; deleted by `OfflineSyncManager` after successful upload replay

`kind` distinguishes photo types: `"completion"`, `"safety"`, etc.

---

## OfflineSyncManager

`OfflineSyncManager.tsx` is a headless React component mounted at app root.

It triggers replay attempts:
1. **On mount** — if the device is online
2. **On `window.online` event** — when connectivity is restored
3. **On queue subscription change** — when a new pending action is enqueued while online

It holds a replay lock (`isReplayingRef`) to prevent concurrent replays.

**Do not mount multiple instances.** Do not duplicate replay logic in individual components.

---

## Offline Mode Hook

`utils/offlineMode.ts` exports `useOfflineMode()`:

- Activates automatically when `navigator.onLine` becomes `false`
- **Does not auto-deactivate** when the device comes back online — the worker must manually clear offline mode to prevent flapping
- State is persisted in `localStorage` under `fieldpro:offlineMode`
- Manual override available via `setOfflineMode(true)` for workers in areas with intermittent signal

---

## Rules for New Code

1. **Every new UL mutation must be enqueueable.** If a field worker can trigger it, it must survive an offline scenario.
2. **Do not add new action types without a corresponding executor in `OfflineSyncManager.tsx`.**
3. **Do not store photo blobs in the offline queue payload.** Blobs go in `photoStore.ts`; the queue holds only `localPhotoIds[]`.
4. **Respect the replay order.** If a new action type has a dependency on another action (e.g., must happen after `START_STOP`), assign it a position in the replay order and document it here.
5. **Idempotency is required on the backend for every replayed action.** The same action may be replayed multiple times. The backend must handle it without duplicating state.
6. **Do not change the queue key format** (`fieldpro-offline-queue:{tenantId}:{oid}`) — existing queues in localStorage would become inaccessible.
