import type { RouteRun } from "../api/routeRuns";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { finishRoute } from "../api/routeRuns";
import { UlLayout } from "./today-route/UlLayout";

interface RouteSummaryProps {
    routeRun: RouteRun;
    summary: {
        totalStops: number;
        completedStops: number;
        inProgressStops: number;
        pendingStops: number;
        hotspotCount: number;
        compactorCount: number;
        photoList: string[]; // List of object keys or URLs
    };
    onFinishRoute?: () => void;
    onBack: () => void;
    isFinishing?: boolean;
}

export function RouteSummary({
    routeRun,
    summary,
    onFinishRoute,
    onBack,
    isFinishing,
}: RouteSummaryProps) {
    const { getAccessToken } = useAuth();
    const [localFinishing, setLocalFinishing] = useState(false);
    const isBusy = Boolean(isFinishing) || localFinishing;

    const isAllDone = summary.totalStops > 0 && summary.completedStops === summary.totalStops;
    const hasUnfinished = summary.pendingStops > 0 || summary.inProgressStops > 0;
    const isAlreadyFinished = String(routeRun.status || "").toLowerCase() === "completed" || String(routeRun.status || "").toLowerCase() === "finished";

    const handleFinish = async () => {
        if (!isAllDone || isBusy || isAlreadyFinished) return;
        try {
            setLocalFinishing(true);
            const token = await getAccessToken();
            await finishRoute(token, routeRun.id);
            onFinishRoute?.();
        } catch (err: any) {
            console.error("Failed to finish route run", err);
            alert(err?.message || "Failed to complete route");
        } finally {
            setLocalFinishing(false);
        }
    };

    return (
        <UlLayout>
            <div
                style={{
                    maxWidth: "600px",
                    margin: "0 auto",
                    padding: "16px",
                }}
            >
                <button
                    onClick={onBack}
                    style={{
                        marginBottom: "1rem",
                        padding: "0.5rem 1rem",
                        fontSize: "1rem",
                        cursor: "pointer",
                        background: "none",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                    }}
                >
                    ← Back to stops
                </button>

                <h2 style={{ marginBottom: "1.5rem", color: "#2d3748" }}>
                    Route Summary
                </h2>

                <div
                    style={{
                        background: "#f7fafc",
                        padding: "1.5rem",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        marginBottom: "2rem",
                    }}
                >
                    <div style={{ marginBottom: "1rem", fontWeight: "bold", color: "#4a5568" }}>
                        {routeRun.base_id} • {new Date(routeRun.run_date).toLocaleDateString()}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <StatBox label="Total Stops" value={summary.totalStops} />
                        <StatBox label="Completed" value={summary.completedStops} color="green" />
                        <StatBox label="Pending" value={summary.pendingStops} color={summary.pendingStops > 0 ? "orange" : undefined} />
                        <StatBox label="In Progress" value={summary.inProgressStops} color={summary.inProgressStops > 0 ? "blue" : undefined} />
                        <StatBox label="Hotspots" value={summary.hotspotCount} icon="🔥" />
                        <StatBox label="Compactors" value={summary.compactorCount} icon="♻" />
                    </div>
                </div>

                {/* Photos Section (Placeholder as we don't have persistent photos yet) */}
                {summary.photoList.length > 0 && (
                    <div style={{ marginBottom: "2rem" }}>
                        <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Photos ({summary.photoList.length})</h3>
                        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                            {summary.photoList.map((_, i) => (
                                <div key={i} style={{ width: "80px", height: "80px", background: "#eee", borderRadius: "4px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "#888" }}>
                                    📷
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Warnings */}
                {hasUnfinished && (
                    <div
                        style={{
                            background: "#fffaf0",
                            border: "1px solid #fbd38d",
                            color: "#c05621",
                            padding: "1rem",
                            borderRadius: "8px",
                            marginBottom: "1.5rem",
                            textAlign: "center",
                        }}
                    >
                        ⚠️ You still have unfinished stops.
                        <br />
                        Please complete all stops before finishing the route.
                    </div>
                )}

                {/* Action */}
                <div style={{ textAlign: "center" }}>
                    <button
                        onClick={handleFinish}
                        disabled={!isAllDone || isBusy || isAlreadyFinished}
                        style={{
                            padding: "1.2rem 2.5rem",
                            fontSize: "1.2rem",
                            background: !isAllDone || isBusy || isAlreadyFinished ? "#cbd5e0" : "#2b6cb0",
                            color: "white",
                            border: "none",
                            borderRadius: "8px",
                            cursor: !isAllDone || isBusy || isAlreadyFinished ? "not-allowed" : "pointer",
                            width: "100%",
                            boxShadow: !isAllDone || isBusy || isAlreadyFinished ? "none" : "0 4px 6px rgba(0,0,0,0.1)",
                        }}
                    >
                        {isAlreadyFinished ? "Route Completed" : isBusy ? "Finishing..." : "Complete Route"}
                    </button>
                </div>
            </div>
        </UlLayout>
    );
}

function StatBox({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: string }) {
    return (
        <div style={{ background: "white", padding: "0.75rem", borderRadius: "6px", border: "1px solid #edf2f7", textAlign: "center" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: color || "#2d3748" }}>
                {icon} {value}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#718096", marginTop: "0.25rem" }}>{label}</div>
        </div>
    );
}
