import { formatStopLocation } from "../../utils/formatStopLocation";
import type { Stop } from "../../api/routeRuns";

interface StopListItemProps {
    stop: Stop;
    onClick: () => void;
}

export function StopListItem({ stop, onClick }: StopListItemProps) {
    return (
        <li
            onClick={onClick}
            style={{
                padding: "1rem",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                marginBottom: "0.75rem",
                cursor: "pointer",
                background: stop.status === "done" ? "#f7fafc" : "#fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: stop.status === "done" ? 0.8 : 1,
            }}
        >
            <div className="flex items-start gap-3" style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
                <div className="shrink-0 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded px-2 py-1"
                    style={{
                        flexShrink: 0,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#334155",
                        backgroundColor: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        borderRadius: "0.25rem",
                        padding: "0.25rem 0.5rem"
                    }}>
                    #{Number.isFinite(stop.sequence) ? stop.sequence : Number(stop.stopNumber)}
                </div>

                <div className="min-w-0 flex-1" style={{ minWidth: 0, flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontWeight: "bold", marginBottom: "0.25rem", color: "#2d3748" }}>
                            Stop {stop.stopNumber} — {formatStopLocation(stop)}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#718096" }}>
                            <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                                {stop.is_hotspot && (
                                    <span style={{ fontSize: "0.8rem", marginRight: "0.25rem" }} title="Hotspot">
                                        🔥
                                    </span>
                                )}
                                {stop.compactor && (
                                    <span style={{ fontSize: "0.7rem", color: "#2b6cb0", background: "#ebf8ff", padding: "1px 4px", borderRadius: "4px", border: "1px solid #bee3f8" }}>
                                        Compactor
                                    </span>
                                )}
                                {stop.has_trash && (
                                    <span style={{ fontSize: "0.7rem", color: "#2d3748", background: "#edf2f7", padding: "1px 4px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
                                        Trash bag
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div>
                        <span
                            style={{
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                background: stop.status === "done" ? "#c6f6d5" : "#feebc8",
                                color: stop.status === "done" ? "#22543d" : "#744210",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                            }}
                        >
                            {stop.status}
                        </span>
                        {(stop as any).syncState === "queued" && (
                            <span style={{ fontSize: "0.75rem", color: "#ff9800", marginLeft: "6px" }}>
                                Queued
                            </span>
                        )}

                        {(stop as any).syncState === "conflict" && (
                            <span style={{ fontSize: "0.75rem", color: "#f44336", marginLeft: "6px" }}>
                                Conflict
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}
