import { useCreateRoute } from "../hooks/useCreateRoute";

interface RouteCreatePanelProps {
    isOpen: boolean;
    onClose: () => void;
    hook: ReturnType<typeof useCreateRoute>;
}

export function RouteCreatePanel({ isOpen, onClose, hook }: RouteCreatePanelProps) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "flex-end",
                zIndex: 1000,
            }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                style={{
                    width: "400px",
                    maxWidth: "100%",
                    background: "white",
                    height: "100%",
                    padding: "1.5rem",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "-2px 0 10px rgba(0,0,0,0.1)",
                    overflowY: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ marginBottom: "1.5rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Create Route</h2>
                    <p style={{ margin: "0.5rem 0 0", color: "#666", fontSize: "0.9rem" }}>
                        Generate a planned route for today using OSRM optimiser.
                    </p>
                </div>

                {hook.error && (
                    <div
                        style={{
                            background: "#fff5f5",
                            color: "#c53030",
                            padding: "0.75rem",
                            borderRadius: "4px",
                            marginBottom: "1rem",
                            fontSize: "0.9rem",
                        }}
                    >
                        {hook.error}
                    </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <div>
                        <label
                            htmlFor="pool-select"
                            style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
                        >
                            Route Pool <span style={{ color: "red" }}>*</span>
                        </label>
                        <select
                            id="pool-select"
                            value={hook.selectedPoolId}
                            onChange={(e) => hook.setPool(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                        >
                            <option value="">-- Select Pool --</option>
                            {hook.pools.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="ul-select"
                            style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
                        >
                            Assigned Field Crew <span style={{ color: "red" }}>*</span>
                        </label>
                        <select
                            id="ul-select"
                            value={hook.selectedUlId}
                            onChange={(e) => hook.setUl(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                        >
                            <option value="">-- Select Field Crew --</option>
                            {hook.uls.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.displayName}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label
                            htmlFor="run-date"
                            style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
                        >
                            Date (Test: today only)
                        </label>
                        <input
                            id="run-date"
                            type="text"
                            value={hook.runDate}
                            readOnly
                            style={{
                                width: "100%",
                                padding: "0.5rem",
                                borderRadius: "4px",
                                border: "1px solid #eee",
                                background: "#f7fafc",
                                color: "#718096",
                            }}
                        />
                    </div>

                    <button
                        onClick={hook.generatePreview}
                        disabled={!hook.canPreview || hook.loadingPreview}
                        style={{
                            padding: "0.75rem",
                            background: hook.canPreview ? "#3182ce" : "#cbd5e0",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontWeight: "bold",
                            cursor: hook.canPreview ? "pointer" : "not-allowed",
                            marginTop: "0.5rem",
                        }}
                    >
                        {hook.loadingPreview ? "Generating..." : "Generate Preview"}
                    </button>
                </div>

                {hook.preview && (
                    <div style={{ marginTop: "2rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
                        <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Preview</h3>
                        <div
                            style={{
                                background: "#f0fff4",
                                padding: "0.75rem",
                                borderRadius: "4px",
                                marginBottom: "1rem",
                                fontSize: "0.9rem",
                            }}
                        >
                            <div>
                                <strong>Stops:</strong> {hook.preview.ordered_stops.length}
                            </div>
                            <div>
                                <strong>Est. Duration:</strong> {(hook.preview.duration_s / 60).toFixed(0)} min
                            </div>
                            <div>
                                <strong>Est. Distance:</strong> {(hook.preview.distance_m / 1609.34).toFixed(1)} miles
                            </div>
                            {hook.preview.truncated && (
                                <div style={{ marginTop: "0.5rem", color: "#c05621", fontWeight: "bold" }}>
                                    Warning: Capped at {hook.preview.used_stops} stops (Pool has {hook.preview.total_stops}).
                                </div>
                            )}
                        </div>

                        <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #eee", marginBottom: "1rem" }}>
                            <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ background: "#f7fafc", textAlign: "left" }}>
                                        <th style={{ padding: "4px 8px" }}>#</th>
                                        <th style={{ padding: "4px 8px" }}>ID</th>
                                        <th style={{ padding: "4px 8px" }}>Loc</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hook.preview.ordered_stops.map((s) => (
                                        <tr key={s.stop_id} style={{ borderBottom: "1px solid #eee" }}>
                                            <td style={{ padding: "4px 8px" }}>{s.sequence + 1}</td>
                                            <td style={{ padding: "4px 8px" }}>{s.stop_id}</td>
                                            <td style={{ padding: "4px 8px" }}>{s.location || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <button
                            onClick={hook.saveRoute}
                            disabled={!hook.canSave || hook.savingRoute}
                            style={{
                                width: "100%",
                                padding: "0.75rem",
                                background: hook.canSave ? "#38a169" : "#cbd5e0",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                fontWeight: "bold",
                                cursor: hook.canSave ? "pointer" : "not-allowed",
                            }}
                        >
                            {hook.savingRoute ? "Saving..." : "Save Route"}
                        </button>
                    </div>
                )}

                <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                    <button
                        onClick={onClose}
                        style={{
                            width: "100%",
                            padding: "0.75rem",
                            background: "white",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            cursor: "pointer",
                            color: "#4a5568",
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
