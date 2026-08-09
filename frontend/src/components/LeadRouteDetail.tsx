import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    getLeadRouteRunById,
    fetchUlUsers,
    reassignRouteRun,
    type RouteRun,
    type UlUser,
} from "../api/routeRuns";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsBadge } from "./ui/OpsBadge";
import { OpsButton } from "./ui/OpsButton";
import { StopHistoryDrawer } from "./StopHistoryDrawer";

interface LeadRouteDetailProps {
    id: number;
    onBack: () => void;
}

export function LeadRouteDetail({ id, onBack }: LeadRouteDetailProps) {
    const { getAccessToken } = useAuth();
    const [routeRun, setRouteRun] = useState<RouteRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Reassign state (A4). The dropdown shows worker NAMES; the selected value is the
    // OID — a write of assignment intent, never rendered.
    const [users, setUsers] = useState<UlUser[]>([]);
    const [selectedOid, setSelectedOid] = useState<string>("");
    const [reassigning, setReassigning] = useState(false);
    const [reassignError, setReassignError] = useState<string | null>(null);

    // D5b — read-only per-stop history drawer (worker-anonymous by construction).
    const [historyStop, setHistoryStop] = useState<{ stopId: string; label: string } | null>(null);

    const fetchDetail = useCallback(async () => {
        try {
            const token = await getAccessToken();
            const data = await getLeadRouteRunById(token, id);
            setRouteRun(data);
        } catch (err: any) {
            setError(err.message || "Failed to load route detail");
        } finally {
            setLoading(false);
        }
    }, [id, getAccessToken]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    useEffect(() => {
        (async () => {
            try {
                const token = await getAccessToken();
                setUsers(await fetchUlUsers(token));
            } catch {
                // Non-fatal: reassign dropdown just stays empty; detail still renders.
            }
        })();
    }, [getAccessToken]);

    const handleReassign = async () => {
        if (!selectedOid) return;
        setReassigning(true);
        setReassignError(null);
        try {
            const token = await getAccessToken();
            await reassignRouteRun(token, id, selectedOid);
            setSelectedOid("");
            await fetchDetail(); // refetch on success (200)
        } catch (err: any) {
            setReassignError(err.message || "Failed to reassign route");
        } finally {
            setReassigning(false);
        }
    };

    if (loading) {
        return (
            <OpsLayout title={`Route Run #${id}`} subtitle="Loading detail...">
                <OpsCard>
                    <p className="text-center text-gray-500">Loading stop list...</p>
                </OpsCard>
            </OpsLayout>
        );
    }

    if (error || !routeRun) {
        return (
            <OpsLayout title={`Route Run #${id}`} subtitle="Error">
                <OpsCard>
                    <p className="text-red-600 text-center">{error || "Route not found"}</p>
                    <div className="text-center mt-4">
                        <OpsButton onClick={onBack}>Back to list</OpsButton>
                    </div>
                </OpsCard>
            </OpsLayout>
        );
    }

    const rightActions = (
        <OpsButton onClick={onBack} variant="outline">
            Back to Routes
        </OpsButton>
    );

    return (
        <OpsLayout
            title={`Route Run #${id}`}
            subtitle="Route detail and stop list."
            rightActions={rightActions}
        >
            <OpsCard className="mb-6">
                <div className="flex gap-8">
                    <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Status</div>
                        <div className="mt-1">
                            <OpsBadge
                                variant={routeRun.status === "completed" ? "success" : "status"}
                                value={routeRun.status.replace("_", " ")}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Pool</div>
                        <div className="mt-1 font-semibold text-gray-900">
                            {routeRun.route_pool_id}
                            {routeRun.is_adhoc && <span className="ml-2"><OpsBadge variant="neutral" value="ad-hoc" /></span>}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Date</div>
                        <div className="mt-1 font-semibold text-gray-900">
                            {new Date(routeRun.run_date).toLocaleDateString()}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Assigned to</div>
                        <div className="mt-1 font-semibold text-gray-900">
                            {routeRun.assigned_user?.display_name || <span className="text-gray-400 font-normal">Unassigned</span>}
                        </div>
                    </div>
                </div>

                {/* Reassign control (A4). Names in the dropdown; the OID is the write value only. */}
                <div className="mt-6 pt-4 border-t border-gray-100">
                    <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Reassign</div>
                    <div className="flex items-end gap-3 flex-wrap">
                        <select
                            aria-label="Reassign to worker"
                            value={selectedOid}
                            onChange={(e) => setSelectedOid(e.target.value)}
                            className="px-3 py-2 rounded-md border border-gray-300 text-sm bg-white min-h-[44px] min-w-[220px]"
                        >
                            <option value="">Select a worker…</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.displayName}{u.role ? ` (${u.role})` : ""}</option>
                            ))}
                        </select>
                        <OpsButton
                            variant="primary"
                            onClick={handleReassign}
                            disabled={!selectedOid || reassigning}
                        >
                            {reassigning ? "Reassigning…" : "Reassign"}
                        </OpsButton>
                    </div>
                    {reassignError && (
                        <p className="mt-2 text-sm text-red-600" role="alert">{reassignError}</p>
                    )}
                </div>
            </OpsCard>

            <OpsCard className="p-0">
                <OpsTable headers={["Seq", "Stop #", "Location", "Status", "History"]}>
                    {routeRun.stops.map((stop) => (
                        <OpsTableRow key={stop.route_run_stop_id}>
                            <OpsTableCell className="text-gray-500">{stop.sequence}</OpsTableCell>
                            <OpsTableCell className="font-semibold">{stop.stopNumber || stop.stop_id.slice(0, 8)}</OpsTableCell>
                            <OpsTableCell>
                                {stop.on_street_name} {stop.cross_street && `& ${stop.cross_street}`}
                            </OpsTableCell>
                            <OpsTableCell>
                                <OpsBadge
                                    variant={stop.status === "done" ? "success" : stop.status === "skipped" ? "danger" : "info"}
                                    value={stop.status.replace("_", " ")}
                                />
                            </OpsTableCell>
                            <OpsTableCell>
                                <OpsButton
                                    size="sm"
                                    variant="outline"
                                    aria-label={`History for stop ${stop.stopNumber || stop.stop_id}`}
                                    onClick={() =>
                                        setHistoryStop({
                                            stopId: stop.stop_id,
                                            label: stop.stopNumber || stop.stop_id,
                                        })
                                    }
                                >
                                    History
                                </OpsButton>
                            </OpsTableCell>
                        </OpsTableRow>
                    ))}
                    {routeRun.stops.length === 0 && (
                        <OpsTableRow>
                            <OpsTableCell colSpan={5} className="text-center py-8 text-gray-500">
                                No stops in this route.
                            </OpsTableCell>
                        </OpsTableRow>
                    )}
                </OpsTable>
            </OpsCard>

            {historyStop && (
                <StopHistoryDrawer
                    stopId={historyStop.stopId}
                    stopLabel={historyStop.label}
                    onClose={() => setHistoryStop(null)}
                />
            )}
        </OpsLayout>
    );
}
