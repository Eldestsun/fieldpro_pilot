
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { runReplay, type OfflineAction, subscribe } from "./offlineQueue";
import { completeStop, skipRouteRunStopWithHazard, uploadStopPhotos, startRouteRunStop } from "../api/routeRuns";
import { getPhoto, deletePhoto } from "./photoStore";
import { OfflineSyncContext, DEFAULT_SYNC_STATE, type OfflineSyncState } from "./OfflineSyncContext";

interface Props {
    children?: ReactNode;
}

export function OfflineSyncManager({ children }: Props) {
    const { getAccessToken, account } = useAuth();
    const isReplayingRef = useRef(false);
    const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [syncState, setSyncState] = useState<OfflineSyncState>(DEFAULT_SYNC_STATE);

    // Derive identity
    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

    // Track online/offline transitions
    useEffect(() => {
        const update = () => setSyncState(prev => ({ ...prev, isOfflineMode: !navigator.onLine }));
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    useEffect(() => {
        if (!tenantId || !oid) return;

        // Executor map
        const executors: Record<string, (action: OfflineAction) => Promise<void>> = {
            COMPLETE_STOP: async (action) => {
                const token = await getAccessToken();
                const stopId = Number(action.routeRunStopId);
                const payload = action.payload as any;
                try {
                    await completeStop(token, stopId, payload);
                } catch (err: any) {
                    const msg = err?.response?.data?.message || err?.message || "";
                    if (
                        msg.includes("photo required") ||
                        msg.includes("after photo") ||
                        msg.includes("Photo Required")
                    ) {
                        console.warn("[OfflineSync] COMPLETE_STOP blocked by missing photo. Retrying...");
                        throw new Error("RETRY_NEEDED_PHOTO_MISSING");
                    }
                    throw err;
                }
            },
            START_STOP: async (action) => {
                const token = await getAccessToken();
                const stopId = Number(action.routeRunStopId);
                try {
                    await startRouteRunStop(token, stopId);
                } catch (err: any) {
                    const status = err?.response?.status;
                    if (status === 409) {
                        const msg = err?.response?.data?.message || "Stop already started or completed";
                        const errorWithCode: any = new Error(msg);
                        errorWithCode.code = "ALREADY_COMPLETE";
                        throw errorWithCode;
                    }
                    throw err;
                }
            },
            SKIP_STOP_WITH_HAZARD: async (action) => {
                const token = await getAccessToken();
                const stopId = Number(action.routeRunStopId);
                const payload = action.payload as any;
                try {
                    await skipRouteRunStopWithHazard(token, stopId, payload);
                } catch (err: any) {
                    const msg = err?.response?.data?.message || err?.message || "";
                    if (
                        msg.includes("safety photo") ||
                        msg.includes("after photo") ||
                        msg.includes("Photo Required") ||
                        msg.includes("required to skip")
                    ) {
                        console.warn("[OfflineSync] SKIP blocked by missing photo. Retrying...");
                        throw new Error("RETRY_NEEDED_PHOTO_MISSING");
                    }
                    throw err;
                }
            },
            UPLOAD_STOP_PHOTOS: async (action) => {
                const token = await getAccessToken();
                const stopId = Number(action.routeRunStopId);
                const payload = action.payload as any;
                const kind = payload.kind || "completion";
                const localIds = payload.localPhotoIds as string[];

                if (Array.isArray(localIds) && localIds.length > 0) {
                    const files: File[] = [];
                    for (const id of localIds) {
                        const rec = await getPhoto(id);
                        if (rec && rec.blob) {
                            files.push(new File([rec.blob], rec.filename, { type: rec.contentType }));
                        } else {
                            throw new Error(`Missing blob for localPhotoId: ${id}`);
                        }
                    }

                    if (files.length > 0) {
                        await uploadStopPhotos(token, Number(action.routeRunId), stopId, files, kind);
                        for (const id of localIds) {
                            await deletePhoto(id);
                        }
                    }
                }
            },
        };

        const attemptReplay = async () => {
            if (typeof navigator !== "undefined" && !navigator.onLine) return;
            if (isReplayingRef.current) return;
            isReplayingRef.current = true;

            setSyncState(prev => ({ ...prev, syncStatus: 'syncing' }));

            try {
                // Only fire the route-refresh event when a terminal stop action
                // (COMPLETE_STOP or SKIP_STOP_WITH_HAZARD) succeeded — prevents the
                // fetchRoute → replay → event → fetchRoute loop on empty or upload-only runs.
                const processed = await runReplay(tenantId, oid, executors);
                if (processed) {
                    window.dispatchEvent(new Event('baseline:after-replay'));
                }
            } finally {
                isReplayingRef.current = false;
                setSyncState(prev => ({ ...prev, syncStatus: 'success' }));
                if (successTimerRef.current) clearTimeout(successTimerRef.current);
                successTimerRef.current = setTimeout(() => {
                    setSyncState(prev => ({ ...prev, syncStatus: 'idle' }));
                }, 3000);
            }
        };

        const onOnline = () => attemptReplay();
        window.addEventListener("online", onOnline);

        const unsub = subscribe(tenantId, oid, (state) => {
            const actions = state.actions;
            setSyncState(prev => ({
                ...prev,
                pendingCount: actions.filter(a => a.status === 'pending').length,
                conflictCount: actions.filter(a => a.status === 'conflict').length,
                failedCount: actions.filter(a => a.status === 'failed').length,
                conflictActions: actions.filter(a => a.status === 'conflict'),
            }));
            const hasPending = actions.some(a => a.status === "pending");
            if (hasPending && navigator.onLine) {
                attemptReplay();
            }
        });

        if (navigator.onLine) {
            attemptReplay();
        }

        return () => {
            window.removeEventListener("online", onOnline);
            unsub();
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };

    }, [tenantId, oid, getAccessToken]);

    return (
        <OfflineSyncContext.Provider value={syncState}>
            {children}
        </OfflineSyncContext.Provider>
    );
}
