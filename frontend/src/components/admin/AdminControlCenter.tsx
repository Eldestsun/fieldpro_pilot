import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";

// ── Types ───────────────────────────────────────────────────────────────────

interface SummaryStats {
    active_routes: number;
    total_stops: number;
    observed_workload_minutes: number;
    emergency_count: number;
}

interface RouteStatus {
    id: string; // or number? usually number in this DB
    pool_label: string;
    status: string;
    assigned_names: string[] | null;
    total_stops: number;
    completed_stops: number;
    skipped_stops: number;
    observed_workload_minutes: number;
    difficulty_density: number;
}

interface ExceptionsStats {
    skips_by_reason: Array<{ reasons: string[]; count: string }>;
    total_hazards: number;
    total_infra_issues: number;
    emergency_count: number;
}

interface TopList {
    heavy_routes: Array<{ id: string; pool_label: string; observed_workload_minutes: number }>;
    heavy_stops: Array<{ STOP_ID: string; ON_STREET_NAME: string; observed_minutes: number }>;
}

// ── Component ───────────────────────────────────────────────────────────────

export const AdminControlCenter: React.FC = () => {
    const { getAccessToken } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [routes, setRoutes] = useState<RouteStatus[]>([]);
    const [exceptions, setExceptions] = useState<ExceptionsStats | null>(null);
    const [difficulty, setDifficulty] = useState<TopList | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const headers = { Authorization: `Bearer ${token}` };

            // Parallel Fetch
            const [sumRes, routesRes, excRes, diffRes] = await Promise.all([
                fetch("/api/admin/control-center/summary", { headers }),
                fetch("/api/admin/control-center/routes", { headers }),
                fetch("/api/admin/control-center/exceptions", { headers }),
                fetch("/api/admin/control-center/difficulty", { headers }),
            ]);

            if (!sumRes.ok || !routesRes.ok || !excRes.ok || !diffRes.ok) {
                throw new Error("Failed to fetch control center data");
            }

            setSummary(await sumRes.json());
            const rData = await routesRes.json();
            setRoutes(rData.routes || []);
            setExceptions(await excRes.json());
            setDifficulty(await diffRes.json());
            setError(null);
        } catch (err: any) {
            console.error("Control Center Load Error:", err);
            setError("Failed to load operational data");
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    // Initial Load + Interval
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // 60s Refresh
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading && !summary) {
        return (
            <OpsLayout title="Control Center">
                <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
                    Loading operational snapshot...
                </div>
            </OpsLayout>
        );
    }

    if (error) {
        return (
            <OpsLayout title="Control Center">
                <div style={{ padding: "2rem", color: "red", fontWeight: "bold" }}>
                    {error}
                </div>
            </OpsLayout>
        );
    }

    return (
        <OpsLayout title="Control Center">
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

                {/* PANEL 1: SNAPSHOT */}
                <section>
                    <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Today's Operations Snapshot</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Active Routes</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#2b6cb0" }}>
                                {summary?.active_routes ?? 0}
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Total Stops</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold" }}>
                                {summary?.total_stops ?? 0}
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Observed Workload</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#2f855a" }}>
                                {Math.round(summary?.observed_workload_minutes ?? 0)}m
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Emergencies</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#c53030" }}>
                                {summary?.emergency_count ?? 0}
                            </div>
                        </OpsCard>
                    </div>
                </section>

                {/* PANEL 2: ROUTE STATUS */}
                <section>
                    <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Route Status</h2>
                    <OpsTable headers={["Route ID", "Pool", "Assignee(s)", "Progress", "Skips", "Workload", "Difficulty Density"]}>
                        {routes.map((r) => {
                            const pct = r.total_stops > 0 ? (r.completed_stops / r.total_stops) * 100 : 0;
                            return (
                                <OpsTableRow key={r.id}>
                                    <OpsTableCell>#{r.id}</OpsTableCell>
                                    <OpsTableCell>{r.pool_label || "-"}</OpsTableCell>
                                    <OpsTableCell>{r.assigned_names?.join(", ") || "Unassigned"}</OpsTableCell>
                                    <OpsTableCell>{Math.round(pct)}% ({r.completed_stops}/{r.total_stops})</OpsTableCell>
                                    <OpsTableCell>{r.skipped_stops > 0 ? `${r.skipped_stops} skips` : "-"}</OpsTableCell>
                                    <OpsTableCell>{Math.round(r.observed_workload_minutes)}m</OpsTableCell>
                                    <OpsTableCell>{r.difficulty_density.toFixed(1)} m/stop</OpsTableCell>
                                </OpsTableRow>
                            );
                        })}
                    </OpsTable>
                </section>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                    {/* PANEL 3: EXCEPTIONS */}
                    <section>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Exceptions & Breaks</h2>
                        <OpsCard>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #edf2f7" }}>
                                    <span>Total Hazards</span>
                                    <span style={{ fontWeight: "bold", color: "#c53030" }}>{exceptions?.total_hazards ?? 0}</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #edf2f7" }}>
                                    <span>Infra Issues</span>
                                    <span style={{ fontWeight: "bold", color: "#d69e2e" }}>{exceptions?.total_infra_issues ?? 0}</span>
                                </div>
                                <div style={{ marginTop: "1rem" }}>
                                    <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem" }}>Skips by Reason</div>
                                    {exceptions?.skips_by_reason.map((s, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.25rem 0" }}>
                                            <span>{s.reasons?.join(", ") || "No reason"}</span>
                                            <span style={{ fontWeight: "bold" }}>{s.count}</span>
                                        </div>
                                    ))}
                                    {(!exceptions?.skips_by_reason || exceptions.skips_by_reason.length === 0) && (
                                        <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>No skips recorded today</div>
                                    )}
                                </div>
                            </div>
                        </OpsCard>
                    </section>

                    {/* PANEL 4: DIFFICULTY INDICATORS */}
                    <section>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Asset Difficulty Indicators</h2>
                        <OpsCard>
                            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                <div>
                                    <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem", borderBottom: "1px solid #edf2f7", paddingBottom: "0.25rem" }}>Top Heavy Routes</div>
                                    {difficulty?.heavy_routes.map((r) => (
                                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.2rem 0" }}>
                                            <span>#{r.id} ({r.pool_label})</span>
                                            <span style={{ fontWeight: "bold" }}>{Math.round(r.observed_workload_minutes)}m</span>
                                        </div>
                                    ))}
                                    {(!difficulty?.heavy_routes || difficulty.heavy_routes.length === 0) && <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>None</div>}
                                </div>

                                <div>
                                    <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem", borderBottom: "1px solid #edf2f7", paddingBottom: "0.25rem" }}>Top Heavy Stops</div>
                                    {difficulty?.heavy_stops.map((s) => (
                                        <div key={s.STOP_ID} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.2rem 0" }}>
                                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "200px" }}>{s.ON_STREET_NAME} ({s.STOP_ID})</span>
                                            <span style={{ fontWeight: "bold" }}>{Math.round(s.observed_minutes)}m</span>
                                        </div>
                                    ))}
                                    {(!difficulty?.heavy_stops || difficulty.heavy_stops.length === 0) && <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>None</div>}
                                </div>
                            </div>
                        </OpsCard>
                    </section>
                </div>

            </div>
        </OpsLayout>
    );
};
