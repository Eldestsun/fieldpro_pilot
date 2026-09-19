import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    getLeadRouteRunById,
    fetchUlUsers,
    reassignRouteRun,
    addStopToRun,
    getStopsScoped,
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

    // ISSUE-050 — add-stop-to-live-run picker (append-only; server writes
    // origin_type='emergency'). Search reuses the existing ops stops read.
    const [addStopSearch, setAddStopSearch] = useState("");
    const [addStopResults, setAddStopResults] = useState<{ stopId: string; label: string }[]>([]);
    const [searchingAddStop, setSearchingAddStop] = useState(false);
    const [addingStopId, setAddingStopId] = useState<string | null>(null);
    const [addStopError, setAddStopError] = useState<string | null>(null);

    const handleSearchAddStop = async () => {
        if (!addStopSearch.trim()) return;
        setSearchingAddStop(true);
        setAddStopError(null);
        try {
            const token = await getAccessToken();
            const data = await getStopsScoped(
                token,
                { page: 1, pageSize: 8, q: addStopSearch.trim() },
                "ops",
            );
            setAddStopResults(
                (data?.items ?? []).map((s: any) => ({
                    stopId: String(s.stop_id),
                    label: [s.stop_id, s.on_street_name].filter(Boolean).join(" — "),
                })),
            );
        } catch (err: any) {
            setAddStopError(err.message || "Failed to search stops");
        } finally {
            setSearchingAddStop(false);
        }
    };

    const handleAddStop = async (stopId: string) => {
        setAddingStopId(stopId);
        setAddStopError(null);
        try {
            const token = await getAccessToken();
            await addStopToRun(token, id, stopId);
            setAddStopResults((prev) => prev.filter((s) => s.stopId !== stopId));
            await fetchDetail();
        } catch (err: any) {
            setAddStopError(err.message || "Failed to add stop");
        } finally {
            setAddingStopId(null);
        }
    };

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

    // T1-D4 — clear assignment: null is the cancel value (backend writes
    // assignment.cancel). "" is never sent; the API rejects it with a 400.
    const handleClearAssignment = async () => {
        setReassigning(true);
        setReassignError(null);
        try {
            const token = await getAccessToken();
            await reassignRouteRun(token, id, null);
            setSelectedOid("");
            await fetchDetail();
        } catch (err: any) {
            setReassignError(err.message || "Failed to clear assignment");
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

                {/* Reassign control (A4 + T1-D4). Names in the dropdown; the OID is the
                    write value only. Hidden on completed runs — nothing to move. */}
                {routeRun.status !== "completed" && (
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
                            {routeRun.assigned_user && (
                                <OpsButton
                                    variant="outline"
                                    onClick={handleClearAssignment}
                                    disabled={reassigning}
                                >
                                    Clear assignment
                                </OpsButton>
                            )}
                        </div>
                        {reassignError && (
                            <p className="mt-2 text-sm text-red-600" role="alert">{reassignError}</p>
                        )}
                    </div>
                )}

                {/* ISSUE-050 — Add stop (append-only). Only on planned/in_progress runs;
                    the injected stop lands at the tail badged 'emergency' — visible to
                    dispatch here and to the worker as a normal new stop, never silent. */}
                {(routeRun.status === "planned" || routeRun.status === "in_progress") && (
                    <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
                            Add stop (appends to end of route)
                        </div>
                        <div className="flex items-end gap-3 flex-wrap">
                            <input
                                aria-label="Search stops to add"
                                value={addStopSearch}
                                onChange={(e) => setAddStopSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSearchAddStop(); }}
                                placeholder="Stop # or street…"
                                className="px-3 py-2 rounded-md border border-gray-300 text-sm bg-white min-h-[44px] min-w-[220px]"
                            />
                            <OpsButton
                                variant="outline"
                                onClick={handleSearchAddStop}
                                disabled={!addStopSearch.trim() || searchingAddStop}
                            >
                                {searchingAddStop ? "Searching…" : "Search"}
                            </OpsButton>
                        </div>
                        {addStopResults.length > 0 && (
                            <ul className="mt-3 flex flex-col gap-2 list-none p-0 m-0">
                                {addStopResults.map((s) => (
                                    <li key={s.stopId} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-gray-200 bg-gray-50">
                                        <span className="text-sm text-gray-800">{s.label}</span>
                                        <OpsButton
                                            size="sm"
                                            variant="primary"
                                            onClick={() => handleAddStop(s.stopId)}
                                            disabled={addingStopId !== null}
                                        >
                                            {addingStopId === s.stopId ? "Adding…" : "Add"}
                                        </OpsButton>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {addStopError && (
                            <p className="mt-2 text-sm text-red-600" role="alert">{addStopError}</p>
                        )}
                    </div>
                )}
            </OpsCard>

            <OpsCard className="p-0">
                <OpsTable headers={["Seq", "Stop #", "Location", "Status", "History"]}>
                    {routeRun.stops.map((stop) => (
                        <OpsTableRow key={stop.route_run_stop_id}>
                            <OpsTableCell className="text-gray-500">{stop.sequence}</OpsTableCell>
                            <OpsTableCell className="font-semibold">
                                {stop.stopNumber || stop.stop_id.slice(0, 8)}
                                {stop.origin_type === "emergency" && (
                                    <span className="ml-2"><OpsBadge variant="danger" value="emergency" /></span>
                                )}
                            </OpsTableCell>
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
