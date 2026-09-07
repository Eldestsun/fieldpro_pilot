import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getSystemHealth, type SystemHealth } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsButton } from "../ui/OpsButton";

// T2-A7 — Admin governance health view. COUNTS ONLY (labor safety): no user
// lists, no per-worker activity, no leaderboards. Not a live-view — refresh
// on mount + manual refresh button, deliberately no auto-poll (live ops
// belongs to the Dispatch Control Center).

function Section({ title, rows }: { title: string; rows: Array<[string, string | number]> }) {
    return (
        <OpsCard className="p-5">
            <h3 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-(--text-muted)">{title}</h3>
            <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
                {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-sm text-(--text-body)">{label}</dt>
                        <dd className="m-0 text-sm font-semibold text-(--text-heading) tabular-nums text-right">{value}</dd>
                    </div>
                ))}
            </dl>
        </OpsCard>
    );
}

export function AdminSystemHealthPanel() {
    const { getAccessToken } = useAuth();
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchHealth = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            setHealth(await getSystemHealth(token));
        } catch (err: any) {
            setError(err?.message || "Failed to load system health");
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        fetchHealth();
    }, [fetchHealth]);

    const rightActions = (
        <OpsButton variant="secondary" onClick={fetchHealth} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
        </OpsButton>
    );

    return (
        <OpsLayout
            title="System Health"
            subtitle="Governance view: volumes, statuses, and integration recency. Counts only — no individual activity."
            rightActions={rightActions}
        >
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm" role="alert">
                    {error}
                    <button onClick={fetchHealth} className="ml-3 underline font-medium hover:text-red-900">Retry</button>
                </div>
            )}

            {loading && !health && (
                <p className="text-center text-(--text-muted) py-12">Loading system health…</p>
            )}

            {health && (
                <>
                    <p className="text-xs text-(--text-muted) mb-4">
                        As of {new Date(health.as_of).toLocaleString()}
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <Section
                            title="Users"
                            rows={[
                                ...Object.entries(health.users.by_role).map(
                                    ([role, n]) => [role, n] as [string, number],
                                ),
                                ["Active (last 30 days)", health.users.active_last_30d],
                            ]}
                        />
                        <Section
                            title="Stops"
                            rows={[
                                ["Active", health.stops.active],
                                ["Retired", health.stops.retired],
                                ["Total", health.stops.total],
                            ]}
                        />
                        <Section
                            title="Route Pools"
                            rows={[
                                ["Active", health.pools.active],
                                ["Inactive", health.pools.inactive],
                                ["Total", health.pools.total],
                            ]}
                        />
                        <Section
                            title="Route Runs (yesterday)"
                            rows={
                                Object.keys(health.route_runs_yesterday).length > 0
                                    ? Object.entries(health.route_runs_yesterday).map(
                                          ([status, n]) => [status.replace("_", " "), n] as [string, number],
                                      )
                                    : [["No runs", "—"] as [string, string]]
                            }
                        />
                        <Section
                            title="Visits (yesterday)"
                            rows={[["Visits recorded", health.visits_yesterday]]}
                        />
                        <Section
                            title="EAM Bridge"
                            rows={[
                                [
                                    "Last log",
                                    health.eam_bridge.last_log_at
                                        ? new Date(health.eam_bridge.last_log_at).toLocaleString()
                                        : "Never",
                                ],
                                ["Logs (7 days)", health.eam_bridge.logs_7d],
                            ]}
                        />
                        <Section
                            title="Audit Log"
                            rows={[
                                ["Entries (24 hours)", health.audit_log.rows_24h],
                                ["Entries (7 days)", health.audit_log.rows_7d],
                            ]}
                        />
                        <Section
                            title="Reported Issues"
                            rows={[["Not-OK presence observations (7 days)", health.recent_issues.not_ok_presence_7d]]}
                        />
                    </div>
                </>
            )}
        </OpsLayout>
    );
}
