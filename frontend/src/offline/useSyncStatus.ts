import { useEffect, useState } from "react";
import { subscribe, getQueueSummary } from "./offlineQueue";
import { useAuth } from "../auth/AuthContext";

export function useSyncStatus() {
    const { account } = useAuth();
    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

    const [summary, setSummary] = useState(getQueueSummary(tenantId, oid));
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);

    useEffect(() => {
        setSummary(getQueueSummary(tenantId, oid));

        // Subscribe handles undefined tenantId/oid gracefully by returning no-op
        const unsub = subscribe(tenantId, oid, () => {
            setSummary(getQueueSummary(tenantId, oid));
        });
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            unsub();
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, [tenantId, oid]);

    let statusKind = "synced";
    let label = "All changes synced";

    if (summary.totalConflict > 0) {
        statusKind = "conflict";
        label = "Sync issues detected";
    } else if (summary.totalRunning > 0) {
        statusKind = "syncing";
        label = "Syncing changes...";
    } else if (summary.totalPending > 0) {
        statusKind = isOnline ? "syncing" : "offline-queued";
        label = isOnline
            ? "Syncing queued actions..."
            : `Offline — ${summary.totalPending} queued`;
    }

    return { statusKind, label, summary, isOnline };
}
