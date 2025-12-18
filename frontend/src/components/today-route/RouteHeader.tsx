interface RouteHeaderProps {
    stats: {
        pending: number;
        done: number;
        miles: string;
    };
    syncStatus: any; // We can import type if exported, or use any for speed as instruction implies minimal changes
    routeLabel?: string;
}

export function RouteHeader({ stats, syncStatus, routeLabel }: RouteHeaderProps) {
    return (
        <header style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid #eee" }}>
            <h2 style={{ margin: "0 0 0.5rem 0", color: "#2d3748" }}>
                {routeLabel ? `Route: ${routeLabel}` : "Today's Route"}
            </h2>
            <div style={{ fontSize: '0.8rem', paddingTop: '4px', marginBottom: '8px' }}>
                {syncStatus.statusKind === 'synced' && (
                    <span style={{ color: '#4caf50' }}>{syncStatus.label}</span>
                )}
                {syncStatus.statusKind === 'offline-queued' && (
                    <span style={{ color: '#ff9800' }}>{syncStatus.label}</span>
                )}
                {syncStatus.statusKind === 'syncing' && (
                    <span style={{ color: '#2196f3' }}>{syncStatus.label}</span>
                )}
                {syncStatus.statusKind === 'conflict' && (
                    <span style={{ color: '#f44336' }}>{syncStatus.label}</span>
                )}
            </div>
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.95rem", color: "#4a5568" }}>
                <span>
                    <strong>{stats.pending}</strong> pending
                </span>
                <span>
                    <strong>{stats.done}</strong> done
                </span>
                <span>
                    <strong>{stats.miles}</strong> mi
                </span>
            </div>
        </header>
    );
}
