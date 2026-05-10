import { createContext, useContext } from "react";
import type { OfflineAction } from "./offlineQueue";

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface OfflineSyncState {
    pendingCount: number;
    conflictCount: number;
    failedCount: number;
    syncStatus: SyncStatus;
    conflictActions: OfflineAction[];
    isOfflineMode: boolean;
}

export const DEFAULT_SYNC_STATE: OfflineSyncState = {
    pendingCount: 0,
    conflictCount: 0,
    failedCount: 0,
    syncStatus: 'idle',
    conflictActions: [],
    isOfflineMode: false,
};

export const OfflineSyncContext = createContext<OfflineSyncState>(DEFAULT_SYNC_STATE);

export function useOfflineSync(): OfflineSyncState {
    return useContext(OfflineSyncContext);
}
