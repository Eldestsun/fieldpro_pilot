import { useState } from "react";
import { cn } from "../../lib/utils";
import { useOfflineSync } from "../../offline/OfflineSyncContext";
import { useAuth } from "../../auth/AuthContext";
import { dismissConflict } from "../../offline/offlineQueue";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

// States per the design-system StatusBar spec (components/feedback/StatusBar.jsx):
// a solid colored dot + text label — never emoji. Semantic colors carry sync /
// operational meaning; the conflict orange pair is hardcoded there too (no token).
type BarState = "offline" | "reconnecting" | "syncing" | "synced" | "conflict" | "failed";

const STATE_CLASSES: Record<BarState, { bar: string; dot: string }> = {
    offline:      { bar: "text-(--color-danger) bg-(--color-danger-tint) border-(--color-danger)/20",   dot: "bg-(--color-danger)" },
    reconnecting: { bar: "text-(--color-warning) bg-(--color-warning-tint) border-(--color-warning)/20", dot: "bg-(--color-warning) animate-pulse" },
    syncing:  { bar: "text-(--color-warning) bg-(--color-warning-tint) border-(--color-warning)/20", dot: "bg-(--color-warning) animate-pulse" },
    synced:   { bar: "text-(--color-success) bg-(--color-success-tint) border-(--color-success)/20", dot: "bg-(--color-success)" },
    conflict: { bar: "text-[#9a3412] bg-[#fff7ed] border-[#ea580c]/20",                              dot: "bg-[#ea580c]" },
    failed:   { bar: "text-(--color-danger) bg-(--color-danger-tint) border-(--color-danger)/20",    dot: "bg-(--color-danger)" },
};

export function OfflineStatusBar() {
    const { pendingCount, conflictCount, failedCount, syncStatus, conflictActions, isOfflineMode } = useOfflineSync();
    const { account, isReconnecting } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);

    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

    const handleDismiss = (actionId: string) => {
        dismissConflict(tenantId, oid, actionId);
    };

    // Priority order: offline > reconnecting > syncing > success > conflict > failed > clear
    let content: React.ReactNode = null;

    if (isOfflineMode) {
        content = (
            <Bar state="offline">
                Offline — {pendingCount} action{pendingCount !== 1 ? 's' : ''} queued
            </Bar>
        );
    } else if (isReconnecting) {
        // PING-RETRY: the session ping (/api/secure/ping) is failing and retries
        // are being scheduled with backoff (AuthContext). Device is "online" but
        // the server is unreachable — distinct from device-offline above.
        content = (
            <Bar state="reconnecting">
                Reconnecting to server…
            </Bar>
        );
    } else if (syncStatus === 'syncing') {
        content = (
            <Bar state="syncing">
                Syncing {pendingCount} action{pendingCount !== 1 ? 's' : ''}...
            </Bar>
        );
    } else if (syncStatus === 'success') {
        content = (
            <Bar state="synced">
                All synced
            </Bar>
        );
    } else if (conflictCount > 0) {
        content = (
            <Bar state="conflict" onClick={() => setModalOpen(true)} clickable>
                {conflictCount} stop{conflictCount !== 1 ? 's' : ''} need attention — tap to review
            </Bar>
        );
    } else if (failedCount > 0) {
        content = (
            <Bar state="failed">
                {failedCount} action{failedCount !== 1 ? 's' : ''} failed
            </Bar>
        );
    }

    if (!content) return null;

    return (
        <>
            {content}
            {modalOpen && (
                <ConflictResolutionModal
                    conflicts={conflictActions}
                    onDismiss={handleDismiss}
                    onClose={() => setModalOpen(false)}
                />
            )}
        </>
    );
}

interface BarProps {
    state: BarState;
    children: React.ReactNode;
    onClick?: () => void;
    clickable?: boolean;
}

function Bar({ state, children, onClick, clickable }: BarProps) {
    const s = STATE_CLASSES[state];
    return (
        <div
            onClick={onClick}
            className={cn(
                "fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2",
                "px-4 py-2.5 border-t text-sm font-medium text-center",
                s.bar,
                clickable ? "cursor-pointer" : "cursor-default"
            )}
        >
            <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
            <span>{children}</span>
        </div>
    );
}
