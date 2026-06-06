import { describe, it, expect, beforeEach } from 'vitest'
import {
    enqueueAction,
    runReplay,
    getQueueSummary,
    loadQueueForUser,
    clearOfflineStateForUser,
    type OfflineAction,
} from './offlineQueue'

// ISSUE-001 regression guard.
//
// The original symptom: after a spot-check stop completed, the offline queue UI
// kept showing a non-zero pending action count instead of clearing to zero. The
// fix hint asked to "ensure all terminal action types are covered in the pending
// count filter."
//
// The pending count shown in the UI (OfflineStatusBar via OfflineSyncContext, and
// useSyncStatus) is derived from `actions.filter(a => a.status === 'pending')` —
// the same derivation getQueueSummary().totalPending uses. These tests lock in
// that a spot-check completion replays to a terminal ('done') status like any
// other terminal action, so the pending count clears to zero.

const TENANT = 'tenant-1'
const OID = 'oid-1'

function pendingAction(partial: Partial<OfflineAction> & Pick<OfflineAction, 'type'>): OfflineAction {
    return {
        id: crypto.randomUUID(),
        routeRunId: '100',
        routeRunStopId: '200',
        createdAt: new Date().toISOString(),
        status: 'pending',
        payload: {},
        ...partial,
    }
}

// Executors that always succeed — mirrors a clean online replay.
const succeedingExecutors: Record<string, (a: OfflineAction) => Promise<void>> = {
    START_STOP: async () => {},
    UPLOAD_STOP_PHOTOS: async () => {},
    SKIP_STOP_WITH_HAZARD: async () => {},
    COMPLETE_STOP: async () => {},
}

describe('offlineQueue — ISSUE-001 pending count clears after spot check', () => {
    beforeEach(() => {
        clearOfflineStateForUser(TENANT, OID)
    })

    it('clears the pending count to zero after an offline spot-check stop syncs', async () => {
        // Spot-check capture while offline enqueues: arrive (START_STOP), the
        // required after-photo (UPLOAD_STOP_PHOTOS), and completion carrying the
        // spotCheck flag (COMPLETE_STOP).
        enqueueAction(TENANT, OID, pendingAction({ type: 'START_STOP' }))
        enqueueAction(TENANT, OID, pendingAction({
            type: 'UPLOAD_STOP_PHOTOS',
            payload: { kind: 'completion', localPhotoIds: ['photo-1'] },
        }))
        enqueueAction(TENANT, OID, pendingAction({
            type: 'COMPLETE_STOP',
            payload: { spotCheck: true, photo_keys: [], picked_up_litter: false },
        }))

        expect(getQueueSummary(TENANT, OID).totalPending).toBe(3)

        await runReplay(TENANT, OID, succeedingExecutors)

        // The whole point of the issue: the count must clear to zero.
        expect(getQueueSummary(TENANT, OID).totalPending).toBe(0)

        // And the spot-check completion specifically must reach a terminal status,
        // not linger as pending.
        const completeStop = loadQueueForUser(TENANT, OID).actions.find(
            (a) => a.type === 'COMPLETE_STOP',
        )
        expect(completeStop?.status).toBe('done')
    })

    it('clears the pending count after a normal (non-spot-check) completion too', async () => {
        enqueueAction(TENANT, OID, pendingAction({ type: 'START_STOP' }))
        enqueueAction(TENANT, OID, pendingAction({
            type: 'COMPLETE_STOP',
            payload: { spotCheck: false, picked_up_litter: true, trashVolume: 'low' },
        }))

        expect(getQueueSummary(TENANT, OID).totalPending).toBe(2)

        await runReplay(TENANT, OID, succeedingExecutors)

        expect(getQueueSummary(TENANT, OID).totalPending).toBe(0)
    })
})
