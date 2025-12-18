import { useCreateRoute } from "../hooks/useCreateRoute";
import { OpsCard } from "./ui/OpsCard";
import { OpsButton } from "./ui/OpsButton";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";


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
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                justifyContent: "flex-end",
                zIndex: 1000,
                backdropFilter: "blur(2px)"
            }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                style={{
                    width: "480px",
                    maxWidth: "100%",
                    background: "white",
                    height: "100%",
                    padding: "2rem",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "-4px 0 15px rgba(0,0,0,0.1)",
                    overflowY: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <header style={{ marginBottom: "2rem" }}>
                    <h2 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Create Route</h2>
                    <p style={{ margin: "0.5rem 0 0", color: "#718096", fontSize: "0.9375rem" }}>
                        Configure and preview a new route run.
                    </p>
                </header>

                {hook.error && (
                    <OpsCard style={{ backgroundColor: "#fff5f5", borderColor: "#feb2b2", marginBottom: "1.5rem" }} padding="0.75rem">
                        <p style={{ margin: 0, color: "#c53030", fontSize: "0.875rem" }}>{hook.error}</p>
                    </OpsCard>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    <div>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.875rem" }}>
                            Route Pool <span style={{ color: "#e53e3e" }}>*</span>
                        </label>
                        <select
                            value={hook.selectedPoolId}
                            onChange={(e) => hook.setPool(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "0.875rem" }}
                        >
                            <option value="">-- Select Pool --</option>
                            {hook.pools.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.875rem" }}>
                            Assigned Field Crew <span style={{ color: "#e53e3e" }}>*</span>
                        </label>
                        <select
                            value={hook.selectedUlId}
                            onChange={(e) => hook.setUl(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            style={{ width: "100%", padding: "0.625rem", borderRadius: "6px", border: "1px solid #cbd5e0", fontSize: "0.875rem" }}
                        >
                            <option value="">-- Select Crew member --</option>
                            {hook.uls.map((u) => (
                                <option key={u.id} value={u.id}>{u.displayName}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.875rem" }}>Date</label>
                        <input
                            type="text"
                            value={hook.runDate}
                            readOnly
                            style={{
                                width: "100%",
                                padding: "0.625rem",
                                borderRadius: "6px",
                                border: "1px solid #e2e8f0",
                                background: "#f8fafc",
                                color: "#718096",
                                fontSize: "0.875rem"
                            }}
                        />
                    </div>

                    <OpsButton
                        onClick={hook.generatePreview}
                        disabled={!hook.canPreview || hook.loadingPreview}
                        variant="primary"
                        style={{ marginTop: "0.5rem" }}
                    >
                        {hook.loadingPreview ? "Generating..." : "Generate Preview"}
                    </OpsButton>
                </div>

                {hook.preview && (
                    <div style={{ marginTop: "2rem", borderTop: "1px solid #e2e8f0", paddingTop: "1.5rem" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Route Analytics</h3>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                            <OpsCard padding="1rem">
                                <div style={{ fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", fontWeight: 600 }}>Stops</div>
                                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{hook.preview.ordered_stops.length}</div>
                            </OpsCard>
                            <OpsCard padding="1rem">
                                <div style={{ fontSize: "0.75rem", color: "#718096", textTransform: "uppercase", fontWeight: 600 }}>Miles</div>
                                <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{(hook.preview.distance_m / 1609.34).toFixed(1)}</div>
                            </OpsCard>
                        </div>

                        {hook.preview.truncated && (
                            <OpsCard style={{ backgroundColor: "#fffaf0", borderColor: "#feebc8", marginBottom: "1.5rem" }} padding="0.75rem">
                                <p style={{ margin: 0, color: "#c05621", fontSize: "0.875rem", fontWeight: 600 }}>
                                    ⚠️ Capped at {hook.preview.used_stops} stops.
                                </p>
                            </OpsCard>
                        )}

                        <OpsCard padding={0} style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "1.5rem" }}>
                            <OpsTable headers={["#", "Location"]}>
                                {hook.preview.ordered_stops.map((s) => (
                                    <OpsTableRow key={s.stop_id}>
                                        <OpsTableCell style={{ color: "#718096" }}>{s.sequence + 1}</OpsTableCell>
                                        <OpsTableCell>{s.location || s.stop_id.slice(0, 8)}</OpsTableCell>
                                    </OpsTableRow>
                                ))}
                            </OpsTable>
                        </OpsCard>

                        <OpsButton
                            onClick={hook.saveRoute}
                            disabled={!hook.canSave || hook.savingRoute}
                            variant="primary"
                            style={{ width: "100%" }}
                        >
                            {hook.savingRoute ? "Saving..." : "Save Route"}
                        </OpsButton>
                    </div>
                )}

                <div style={{ marginTop: "auto", paddingTop: "2rem" }}>
                    <OpsButton variant="secondary" onClick={onClose} style={{ width: "100%" }}>
                        Cancel
                    </OpsButton>
                </div>
            </div>
        </div>
    );
}
