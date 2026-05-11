import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";
import { cn } from "../../lib/utils";

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

// ── Sub-components ──────────────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: number | string;
    valueClassName?: string;
}

function StatCard({ label, value, valueClassName }: StatCardProps) {
    return (
        <OpsCard>
            <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {label}
            </div>
            <div className={valueClassName ?? "text-4xl font-bold text-gray-800"}>
                {value}
            </div>
        </OpsCard>
    );
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
            <OpsLayout title="Control Center" subtitle="Auto-refreshes every 60s">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[...Array(4)].map((_, i) => (
                        <OpsCard key={i}>
                            <div className="animate-pulse">
                                <div className="h-4 bg-gray-200 rounded mb-3 w-2/3" />
                                <div className="h-8 bg-gray-200 rounded w-1/2" />
                            </div>
                        </OpsCard>
                    ))}
                </div>
            </OpsLayout>
        );
    }

    if (error) {
        return (
            <OpsLayout title="Control Center" subtitle="Auto-refreshes every 60s">
                <OpsCard className="border-red-200 bg-red-50">
                    <p className="text-red-600 font-semibold">{error}</p>
                </OpsCard>
            </OpsLayout>
        );
    }

    const formatReason = (reason: string) => {
        return reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    return (
        <OpsLayout title="Control Center" subtitle="Auto-refreshes every 60s">
            <div className="flex flex-col gap-8">

                {/* PANEL 1: SNAPSHOT */}
                <section>
                    <h2 className="text-base font-semibold text-gray-800 mb-4">Today's Operations Snapshot</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Clean Events"
                            value={summary?.clean_events ?? 0}
                            valueClassName="text-4xl font-bold text-blue-700"
                        />
                        <StatCard
                            label="Observed Minutes"
                            value={`${Math.round(summary?.total_clean_minutes ?? 0)}m`}
                        />
                        <StatCard
                            label="Hazards Reported"
                            value={summary?.hazards_reported ?? 0}
                            valueClassName="text-4xl font-bold text-green-700"
                        />
                        <StatCard
                            label="High Severity"
                            value={summary?.high_severity_hazards ?? 0}
                            valueClassName="text-4xl font-bold text-red-700"
                        />
                    </div>
                </section>

                {/* PANEL 2: ROUTE STATUS */}
                <section>
                    <h2 className="text-base font-semibold text-gray-800 mb-4">Route Status</h2>
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
                                    <OpsTableCell>{r.pool_id || "—"}</OpsTableCell>
                                    <OpsTableCell>{r.assigned_ul_name || "Unassigned"}</OpsTableCell>
                                    <OpsTableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-[60px] bg-gray-100 h-2 rounded overflow-hidden">
                                                {/* Progress fill width is data-driven — documented exception */}
                                                <div
                                                    style={{ width: `${pct}%` }}
                                                    className="bg-green-400 h-full"
                                                />
                                            </div>
                                            <span className="text-sm text-gray-700">{Math.round(pct)}%</span>
                                        </div>
                                    </OpsTableCell>
                                    <OpsTableCell>{Math.round(r.observed_minutes)}m</OpsTableCell>
                                    <OpsTableCell>
                                        <div className="flex gap-2">
                                            {r.has_emergency_additions && <span title="Emergency Additions">🚨</span>}
                                            {r.high_skip_count && <span title="High Skip Count">⏭️</span>}
                                            {!r.has_emergency_additions && !r.high_skip_count && (
                                                <span className="text-gray-300">—</span>
                                            )}
                                        </div>
                                    </OpsTableCell>
                                </OpsTableRow>
                            );
                        })}
                        {routes.length === 0 && (
                            <OpsTableRow>
                                <OpsTableCell
                                    className="text-center text-gray-400 italic"
                                    colSpan={6}
                                >
                                    No active routes today
                                </OpsTableCell>
                            </OpsTableRow>
                        )}
                    </OpsTable>
                </section>

                {/* PANELS 3 + 4: 2×2 grid — stacked on mobile, side-by-side on desktop */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* PANEL 3: EXCEPTIONS & BREAKS */}
                    <section>
                        <h2 className="text-base font-semibold text-gray-800 mb-4">Exceptions & Breaks</h2>
                        <OpsCard>
                            {/* Key Indicators */}
                            <div className="grid grid-cols-3 gap-4 mb-6 pb-4 border-b border-gray-100">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-red-700">{stats?.total_hazards ?? 0}</div>
                                    <div className="text-xs text-gray-500 mt-1">Hazards</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-yellow-600">{stats?.total_infra_issues ?? 0}</div>
                                    <div className="text-xs text-gray-500 mt-1">Infra Issues</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-blue-600">{stats?.emergency_count ?? 0}</div>
                                    <div className="text-xs text-gray-500 mt-1">Emergencies</div>
                                </div>
                            </div>

                            <div className="text-sm font-semibold text-gray-700 mb-2">Skips by Reason</div>
                            {(!stats?.skips_by_reason || stats.skips_by_reason.length === 0) ? (
                                <div className="py-4 text-center text-gray-300 italic text-sm">No skips recorded today</div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {stats.skips_by_reason.map((s, i) => (
                                        <div key={i} className="flex justify-between items-center py-2 text-sm">
                                            <span className="text-gray-700">{formatReason(s.reason)}</span>
                                            <span className="font-bold text-gray-900">{s.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </OpsCard>
                    </section>

                    {/* PANEL 4: DIFFICULTY INDICATORS */}
                    <section>
                        <h2 className="text-base font-semibold text-gray-800 mb-4">Asset Difficulty Indicators</h2>
                        <div className="flex flex-col gap-4">

                            {/* Hotspot Areas */}
                            <OpsCard>
                                <div className="text-sm font-semibold text-gray-500 mb-3">System Hotspots</div>
                                {(!difficulty?.hotspot_areas || difficulty.hotspot_areas.length === 0) ? (
                                    <div className="text-sm text-gray-300 italic">None detected today</div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {difficulty.hotspot_areas.map((h, i) => (
                                            <div
                                                key={i}
                                                className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 text-sm font-medium rounded"
                                            >
                                                {h.pool_label}: <span className="font-bold">{h.heavy_stop_count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </OpsCard>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                                {/* Heavy Stops */}
                                <OpsCard>
                                    <div className="text-sm font-semibold text-gray-500 mb-2 pb-1 border-b border-gray-100">
                                        Heavier Than Median
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {difficulty?.heavy_stops.map((s) => (
                                            <div
                                                key={s.location_id}
                                                className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50 last:border-0"
                                            >
                                                <span className="max-w-[60%] overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {s.label}
                                                </span>
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded font-bold text-xs",
                                                    s.difficulty_band === "very_heavy"
                                                        ? "bg-red-100 text-red-700"
                                                        : "bg-orange-100 text-orange-700"
                                                )}>
                                                    {s.difficulty_band === "very_heavy" ? "Very Heavy" : "Heavy"}
                                                </span>
                                            </div>
                                        ))}
                                        {(!difficulty?.heavy_stops || difficulty.heavy_stops.length === 0) && (
                                            <div className="text-xs text-gray-300">Normal Load</div>
                                        )}
                                    </div>
                                </OpsCard>

                                {/* Heavy Routes */}
                                <OpsCard>
                                    <div className="text-sm font-semibold text-gray-500 mb-2 pb-1 border-b border-gray-100">
                                        Route Density
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {difficulty?.heavy_routes.map((r) => (
                                            <div
                                                key={r.route_id}
                                                className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50 last:border-0"
                                            >
                                                <span>#{r.route_id} ({r.pool_label})</span>
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded font-bold text-xs",
                                                    r.difficulty_density_band === "high"
                                                        ? "bg-red-100 text-red-700"
                                                        : "bg-orange-100 text-orange-700"
                                                )}>
                                                    {r.difficulty_density_band === "high" ? "High" : "Elevated"}
                                                </span>
                                            </div>
                                        ))}
                                        {(!difficulty?.heavy_routes || difficulty.heavy_routes.length === 0) && (
                                            <div className="text-xs text-gray-300">Balanced</div>
                                        )}
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
