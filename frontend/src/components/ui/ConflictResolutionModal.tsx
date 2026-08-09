import type { OfflineAction } from "../../offline/offlineQueue";

interface Props {
    conflicts: OfflineAction[];
    onDismiss: (actionId: string) => void;
    onClose: () => void;
}

export function ConflictResolutionModal({ conflicts, onDismiss, onClose }: Props) {
    const handleCopyInfo = (action: OfflineAction) => {
        const info = [
            `Stop ID: ${action.routeRunStopId ?? 'unknown'}`,
            `Conflict: ${action.lastError ?? 'unknown'}`,
            `Action: ${action.type}`,
            `Queued: ${action.createdAt}`,
        ].join('\n');
        navigator.clipboard.writeText(info).catch(() => {
            // clipboard not available — silently ignore
        });
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(17,24,39,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="conflict-modal-title"
                style={{
                    backgroundColor: 'var(--surface-card)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '24px',
                    maxWidth: '480px',
                    width: '90%',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 id="conflict-modal-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Stops needing attention
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)', minHeight: '44px', minWidth: '44px' }}
                    >
                        ✕
                    </button>
                </div>

                {conflicts.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>No conflicts remaining.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {conflicts.map(action => (
                            <li
                                key={action.id}
                                style={{
                                    // Conflict orange family per the design-system StatusBar spec
                                    border: '1px solid #fed7aa',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '12px',
                                    backgroundColor: '#fff7ed',
                                }}
                            >
                                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                                    Stop {action.routeRunStopId ?? 'unknown'}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: '#9a3412', marginBottom: '12px' }}>
                                    {friendlyConflict(action.lastError)}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => onDismiss(action.id)}
                                        style={{
                                            padding: '6px 12px',
                                            background: 'var(--color-danger)',
                                            color: 'var(--text-on-brand)',
                                            border: 'none',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            fontSize: '0.8125rem',
                                            minHeight: '44px',
                                        }}
                                    >
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={() => handleCopyInfo(action)}
                                        style={{
                                            padding: '6px 12px',
                                            background: 'var(--gray-100)',
                                            color: 'var(--gray-800)',
                                            border: 'none',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: 'pointer',
                                            fontSize: '0.8125rem',
                                            minHeight: '44px',
                                        }}
                                    >
                                        Copy info
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function friendlyConflict(code: string | undefined): string {
    if (code === 'ROUTE_REASSIGNED') return 'This stop was reassigned to another worker.';
    if (code === 'ROUTE_NOT_FOUND') return 'Route could not be found — contact your Lead.';
    return code ?? 'Unknown conflict';
}
