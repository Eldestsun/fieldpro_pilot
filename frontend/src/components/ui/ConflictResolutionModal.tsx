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
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    padding: '24px',
                    maxWidth: '480px',
                    width: '90%',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Stops needing attention
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#718096' }}
                    >
                        ✕
                    </button>
                </div>

                {conflicts.length === 0 ? (
                    <p style={{ color: '#718096', margin: 0 }}>No conflicts remaining.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {conflicts.map(action => (
                            <li
                                key={action.id}
                                style={{
                                    border: '1px solid #fed7aa',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    backgroundColor: '#fffaf0',
                                }}
                            >
                                <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                                    Stop {action.routeRunStopId ?? 'unknown'}
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: '#c05621', marginBottom: '12px' }}>
                                    {friendlyConflict(action.lastError)}
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => onDismiss(action.id)}
                                        style={{
                                            padding: '6px 12px',
                                            background: '#e53e3e',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '0.8125rem',
                                        }}
                                    >
                                        Dismiss
                                    </button>
                                    <button
                                        onClick={() => handleCopyInfo(action)}
                                        style={{
                                            padding: '6px 12px',
                                            background: '#edf2f7',
                                            color: '#2d3748',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '0.8125rem',
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
