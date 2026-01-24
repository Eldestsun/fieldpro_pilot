import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";

// ── Types ───────────────────────────────────────────────────────────────────

interface SummaryStats {
    clean_events: number;
    total_clean_minutes: number;
    hazards_reported: number;
    high_severity_hazards: number;
}

interface RouteStatus {
    route_run_id: number;
    pool_id: string | null;
    assigned_ul_name: string | null;

    planned_stops: number;
    emergency_stops: number;
    resolved_stops: number;
    skipped_stops: number;

    observed_minutes: number;

    has_emergency_additions: boolean;
    high_skip_count: boolean;
}

interface SkipReason {
    reason: string;
    count: number;
}

interface ExceptionStats {
    skips_by_reason: SkipReason[];
    total_hazards: number;
    total_infra_issues: number;
    emergency_count: number;
}

interface DifficultyResponse {
    heavy_stops: Array<{
        location_id: number;
        label: string;
        difficulty_band: "normal" | "heavy" | "very_heavy";
    }>;
    heavy_routes: Array<{
        route_id: number;
        pool_label: string;
        difficulty_density_band: "normal" | "elevated" | "high";
    }>;
    hotspot_areas: Array<{
        pool_label: string;
        heavy_stop_count: number;
    }>;
}

// ── Component ───────────────────────────────────────────────────────────────

export const AdminControlCenter: React.FC = () => {
    const { getAccessToken, isLoading } = useAuth();
    const authReady = !isLoading;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [summary, setSummary] = useState<SummaryStats | null>(null);
    const [routes, setRoutes] = useState<RouteStatus[]>([]);
    const [stats, setStats] = useState<ExceptionStats | null>(null);
    const [difficulty, setDifficulty] = useState<DifficultyResponse | null>(null);

    const fetchData = useCallback(async () => {
        if (!authReady) return;

        try {
            const token = await getAccessToken();
            if (!token) return;

            const headers = { Authorization: `Bearer ${token}` };

            // Parallel Fetch
            const [sumRes, routesRes, excRes, diffRes] = await Promise.all([
                fetch("/api/admin/control-center/overview", { headers }),
                fetch("/api/admin/control-center/routes", { headers }),
                fetch("/api/admin/control-center/exceptions", { headers }),
                fetch("/api/admin/control-center/difficulty", { headers }),
            ]);

            if (!sumRes.ok || !routesRes.ok || !excRes.ok || !diffRes.ok) {
                throw new Error("Failed to fetch control center data");
            }

            setSummary(await sumRes.json());
            const rData = await routesRes.json();
            setRoutes(rData || []); // Direct array return now
            setStats(await excRes.json());
            setDifficulty(await diffRes.json());
            setError(null);
        } catch (err: any) {
            console.error("Control Center Load Error:", err);
            setError("Failed to load operational data");
        } finally {
            setLoading(false);
        }
    }, [authReady, getAccessToken]);

    // Initial Load + Interval
    useEffect(() => {
        if (!authReady) return;

        fetchData();
        const interval = setInterval(fetchData, 60000); // 60s Refresh
        return () => clearInterval(interval);
    }, [authReady, fetchData]);

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

    const formatReason = (reason: string) => {
        // Simple formatting for display
        return reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    return (
        <OpsLayout title="Control Center">
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

                {/* PANEL 1: SNAPSHOT */}
                <section>
                    <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Today's Operations Snapshot</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Clean Events</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#2b6cb0" }}>
                                {summary?.clean_events ?? 0}
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Observed Minutes</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold" }}>
                                {Math.round(summary?.total_clean_minutes ?? 0)}m
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>Hazards Reported</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#2f855a" }}>
                                {summary?.hazards_reported ?? 0}
                            </div>
                        </OpsCard>
                        <OpsCard>
                            <div style={{ fontSize: "0.85rem", color: "#718096", marginBottom: "0.5rem" }}>High Severity</div>
                            <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#c53030" }}>
                                {summary?.high_severity_hazards ?? 0}
                            </div>
                        </OpsCard>
                    </div>
                </section>


                {/* PANEL 2: ROUTE STATUS */}
                <section>
                    <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Route Status</h2>
                    <OpsTable headers={["Route ID", "Pool", "Assignee", "Progress", "Workload", "Deviations"]}>
                        {routes.map((r) => {
                            const planned = Number(r.planned_stops);
                            const emergency = Number(r.emergency_stops);
                            const resolved = Number(r.resolved_stops);

                            const totalExpected = planned + emergency;

                            const pct =
                                totalExpected > 0
                                    ? Math.min(100, (resolved / totalExpected) * 100)
                                    : 0;
                            return (
                                <OpsTableRow key={r.route_run_id}>
                                    <OpsTableCell>#{r.route_run_id}</OpsTableCell>
                                    <OpsTableCell>{r.pool_id || "-"}</OpsTableCell>
                                    <OpsTableCell>{r.assigned_ul_name || "Unassigned"}</OpsTableCell>
                                    <OpsTableCell>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <div style={{ width: "60px", background: "#edf2f7", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                                                <div style={{ width: `${pct}%`, background: "#48bb78", height: "100%" }}></div>
                                            </div>
                                            <span style={{ fontSize: "0.85rem" }}>{Math.round(pct)}%</span>
                                        </div>
                                    </OpsTableCell>
                                    <OpsTableCell>{Math.round(r.observed_minutes)}m</OpsTableCell>
                                    <OpsTableCell>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            {r.has_emergency_additions && <span title="Emergency Additions">🚨</span>}
                                            {r.high_skip_count && <span title="High Skip Count">⏭️</span>}
                                            {!r.has_emergency_additions && !r.high_skip_count && <span style={{ color: "#cbd5e0" }}>-</span>}
                                        </div>
                                    </OpsTableCell>
                                </OpsTableRow>
                            );
                        })}
                    </OpsTable>
                </section>


                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                    {/* PANEL 3: EXCEPTIONS & BREAKS */}
                    <section>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Exceptions & Breaks</h2>
                        <OpsCard>
                            {/* Key Indicators */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem", borderBottom: "1px solid #edf2f7", paddingBottom: "1rem" }}>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#c53030" }}>{stats?.total_hazards ?? 0}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#718096" }}>Hazards</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#d69e2e" }}>{stats?.total_infra_issues ?? 0}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#718096" }}>Infra Issues</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#3182ce" }}>{stats?.emergency_count ?? 0}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#718096" }}>Emergencies</div>
                                </div>
                            </div>

                            <div style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#2d3748", marginBottom: "0.5rem" }}>Skips by Reason</div>
                            {(!stats?.skips_by_reason || stats.skips_by_reason.length === 0) ? (
                                <div style={{ padding: "1rem", color: "#cbd5e0", textAlign: "center", fontStyle: "italic" }}>No skips recorded today</div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                                    <tbody>
                                        {stats?.skips_by_reason.map((s, i) => (
                                            <tr key={i} style={{ borderBottom: i < stats.skips_by_reason.length - 1 ? "1px solid #f7fafc" : "none" }}>
                                                <td style={{ padding: "0.5rem 0" }}>{formatReason(s.reason)}</td>
                                                <td style={{ padding: "0.5rem 0", textAlign: "right", fontWeight: "bold" }}>{s.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </OpsCard>
                    </section>

                    {/* PANEL 4: DIFFICULTY INDICATORS */}
                    <section>
                        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#2d3748" }}>Asset Difficulty Indicators</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

                            {/* Hotspot Areas */}
                            <OpsCard>
                                <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.75rem", fontWeight: "600" }}>System Hotspots</div>
                                {(!difficulty?.hotspot_areas || difficulty.hotspot_areas.length === 0) ? (
                                    <div style={{ color: "#cbd5e0", fontStyle: "italic", fontSize: "0.85rem" }}>None detected today</div>
                                ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                                        {difficulty.hotspot_areas.map((h, i) => (
                                            <div key={i} style={{ background: "#ebf8ff", border: "1px solid #bee3f8", color: "#2c5282", padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.85rem", fontWeight: "500" }}>
                                                {h.pool_label}: <span style={{ fontWeight: "bold" }}>{h.heavy_stop_count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </OpsCard>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                {/* Heavy Stops */}
                                <OpsCard>
                                    <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem", borderBottom: "1px solid #edf2f7", paddingBottom: "0.25rem" }}>Heavier Than Median</div>
                                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                                        {difficulty?.heavy_stops.map((s) => (
                                            <div key={s.location_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "0.3rem 0", borderBottom: "1px solid #f7fafc" }}>
                                                <span style={{ maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                                                <span style={{
                                                    fontSize: "0.7rem", padding: "2px 4px", borderRadius: "3px", fontWeight: "bold",
                                                    background: s.difficulty_band === 'very_heavy' ? '#FED7D7' : '#FEEBC8',
                                                    color: s.difficulty_band === 'very_heavy' ? '#C53030' : '#C05621'
                                                }}>
                                                    {s.difficulty_band === 'very_heavy' ? 'Very Heavy' : 'Heavy'}
                                                </span>
                                            </div>
                                        ))}
                                        {(!difficulty?.heavy_stops || difficulty.heavy_stops.length === 0) && <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>Normal Load</div>}
                                    </div>
                                </OpsCard>

                                {/* Heavy Routes */}
                                <OpsCard>
                                    <div style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem", borderBottom: "1px solid #edf2f7", paddingBottom: "0.25rem" }}>Route Density</div>
                                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                                        {difficulty?.heavy_routes.map((r) => (
                                            <div key={r.route_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", padding: "0.3rem 0", borderBottom: "1px solid #f7fafc" }}>
                                                <span>#{r.route_id} ({r.pool_label})</span>
                                                <span style={{
                                                    fontSize: "0.7rem", padding: "2px 4px", borderRadius: "3px", fontWeight: "bold",
                                                    background: r.difficulty_density_band === 'high' ? '#FED7D7' : '#FEEBC8',
                                                    color: r.difficulty_density_band === 'high' ? '#C53030' : '#C05621'
                                                }}>
                                                    {r.difficulty_density_band === 'high' ? 'High' : 'Elevated'}
                                                </span>
                                            </div>
                                        ))}
                                        {(!difficulty?.heavy_routes || difficulty.heavy_routes.length === 0) && <div style={{ fontSize: "0.8rem", color: "#cbd5e0" }}>Balanced</div>}
                                    </div>
                                </OpsCard>
                            </div>

                        </div>
                    </section>
                </div>

            </div>
        </OpsLayout>
    );
};
