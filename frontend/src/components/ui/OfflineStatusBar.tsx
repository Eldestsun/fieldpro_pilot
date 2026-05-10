import { useState } from "react";
import { useOfflineSync } from "../../offline/OfflineSyncContext";
import { useAuth } from "../../auth/AuthContext";
import { dismissConflict } from "../../offline/offlineQueue";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

export function OfflineStatusBar() {
    const { pendingCount, conflictCount, failedCount, syncStatus, conflictActions, isOfflineMode } = useOfflineSync();
    const { account } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);

    const tenantId = account?.tenantId;
    const claims = account?.idTokenClaims as any;
    const oid = claims?.oid || account?.localAccountId;

    const handleDismiss = (actionId: string) => {
        dismissConflict(tenantId, oid, actionId);
    };

    // Priority order: offline > syncing > success > conflict > failed > clear
    let content: React.ReactNode = null;

    if (isOfflineMode) {
        content = (
            <Bar color="#c53030" bg="#fff5f5">
                🔴 Offline — {pendingCount} action{pendingCount !== 1 ? 's' : ''} queued
            </Bar>
        );
    } else if (syncStatus === 'syncing') {
        content = (
            <Bar color="#744210" bg="#fffbeb">
                🟡 Syncing {pendingCount} action{pendingCount !== 1 ? 's' : ''}...
            </Bar>
        );
    } else if (syncStatus === 'success') {
        content = (
            <Bar color="#276749" bg="#f0fff4">
                🟢 All synced
            </Bar>
        );
    } else if (conflictCount > 0) {
        content = (
            <Bar color="#7b341e" bg="#fffaf0" onClick={() => setModalOpen(true)} clickable>
                🟠 {conflictCount} stop{conflictCount !== 1 ? 's' : ''} need attention — tap to review
            </Bar>
        );
    } else if (failedCount > 0) {
        content = (
            <Bar color="#c53030" bg="#fff5f5">
                🔴 {failedCount} action{failedCount !== 1 ? 's' : ''} failed
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
    color: string;
    bg: string;
    children: React.ReactNode;
    onClick?: () => void;
    clickable?: boolean;
}

function Bar({ color, bg, children, onClick, clickable }: BarProps) {
    return (
        <div
            onClick={onClick}
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '10px 16px',
                backgroundColor: bg,
                color,
                fontSize: '0.875rem',
                fontWeight: 500,
                textAlign: 'center',
                zIndex: 9999,
                cursor: clickable ? 'pointer' : 'default',
                borderTop: `1px solid ${color}33`,
                // On wider screens shift to top
            }}
        >
            {children}
        </div>
    );
}
