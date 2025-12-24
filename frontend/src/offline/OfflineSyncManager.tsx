
import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { runReplay, type OfflineAction, subscribe } from "./offlineQueue";
import { completeStop, skipRouteRunStopWithHazard, uploadStopPhotos, startRouteRunStop } from "../api/routeRuns";
import { getPhoto, deletePhoto } from "./photoStore";

export function OfflineSyncManager() {
    const { getAccessToken, account } = useAuth();
    const isReplayingRef = useRef(false);

    // Derive identity
    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

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
                    // Detect "Photo Required" error (usually 400)
                    // If backend says photo missing, it might be because the upload action is pending/failed.
                    // We throw to keep this action pending/retryable.
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
                    // 409 Conflict => Stop already done/skipped/etc.
                    // Do not retry. Mark as conflict or failed.
                    const status = err?.response?.status;
                    if (status === 409) {
                        const msg = err?.response?.data?.message || "Stop already started or completed";
                        // We throw an object that parseApiErrorCode might recognize if we had a code, 
                        // but here we just want to ensure runReplay sees it as fatal.
                        // Actually runReplay checks `isNetworkError` first.
                        // Then `parseApiErrorCode`. 
                        // If we throw a standard error with a code property, parseApiErrorCode can pick it up.
                        const errorWithCode: any = new Error(msg);
                        errorWithCode.code = "ALREADY_COMPLETE"; // Reusing this to indicate 'done' state effectively? 
                        // Wait, if it's already started (in_progress), backend returns 200 (idempotent).
                        // If it returns 409, it means it's DONE or SKIPPED.
                        // So treating it as ALREADY_COMPLETE is correct for queue cleanup.
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
                    // Retrieve blobs
                    for (const id of localIds) {
                        const rec = await getPhoto(id);
                        if (rec && rec.blob) {
                            files.push(new File([rec.blob], rec.filename, { type: rec.contentType }));
                        } else {
                            // Enforce B3: Missing blob -> Fail action
                            throw new Error(`Missing blob for localPhotoId: ${id}`);
                        }
                    }

                    if (files.length > 0) {
                        // Upload
                        await uploadStopPhotos(token, Number(action.routeRunId), stopId, files, kind);
                        // Cleanup
                        for (const id of localIds) {
                            await deletePhoto(id);
                        }
                    }
                }
            },
        };

        const attemptReplay = () => {
            // Basic online check
            if (typeof navigator !== "undefined" && !navigator.onLine) return;

            if (isReplayingRef.current) return;
            isReplayingRef.current = true;

            runReplay(tenantId, oid, executors)
                .finally(() => {
                    isReplayingRef.current = false;
                });
        };

        // Listen for online events
        const onOnline = () => attemptReplay();
        window.addEventListener("online", onOnline);

        // Listen for queue changes (if queue has pending items, try to sync)
        const unsub = subscribe(tenantId, oid, (state) => {
            const hasPending = state.actions.some(a => a.status === "pending");
            if (hasPending && navigator.onLine) {
                attemptReplay();
            }
        });

        // Initial attempt on mount
        if (navigator.onLine) {
            attemptReplay();
        }

        return () => {
            window.removeEventListener("online", onOnline);
            unsub();
        };

    }, [tenantId, oid, getAccessToken]);

    return null; // Headless
}
