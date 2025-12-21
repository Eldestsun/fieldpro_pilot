
import { useEffect, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { runReplay, type OfflineAction, subscribe } from "./offlineQueue";
import { completeStop, skipRouteRunStopWithHazard } from "../api/routeRuns";

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
                // Payload is typed as unknown in OfflineAction, cast it
                const payload = action.payload as any;
                await completeStop(token, stopId, payload);
            },
            SKIP_STOP_WITH_HAZARD: async (action) => {
                const token = await getAccessToken();
                const stopId = Number(action.routeRunStopId);
                const payload = action.payload as any;
                await skipRouteRunStopWithHazard(token, stopId, payload);
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
