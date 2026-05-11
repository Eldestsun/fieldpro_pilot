import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getLeadRouteRunById, getOpsCleanLogs, type RouteRun, type OpsCleanLog } from "../api/routeRuns";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsButton } from "./ui/OpsButton";
import { cn } from "../lib/utils";

interface LeadCompletedRouteDetailProps {
    id: number;
    onBack: () => void;
}

export function LeadCompletedRouteDetail({ id, onBack }: LeadCompletedRouteDetailProps) {
    const { getAccessToken } = useAuth();
    const [route, setRoute] = useState<RouteRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const [cleanLogs, setCleanLogs] = useState<OpsCleanLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        const loadRoute = async () => {
            try {
                const token = await getAccessToken();
                const data = await getLeadRouteRunById(token, id);
                setRoute(data);
            } catch (err) {
                console.error("Failed to load completed route", err);
            } finally {
                setLoading(false);
            }
        };
        loadRoute();
    }, [id, getAccessToken]);

    useEffect(() => {
        if (!selectedStopId) {
            setCleanLogs([]);
            return;
        }
        const loadLogs = async () => {
            setLoadingLogs(true);
            try {
                const token = await getAccessToken();
                const res = await getOpsCleanLogs(token, {
                    page: 1,
                    pageSize: 50,
                    stop_id: selectedStopId,
                    run_date: route?.run_date
                });
                setCleanLogs(res.clean_logs);
            } catch (err) {
                console.error("Failed to load clean logs", err);
            } finally {
                setLoadingLogs(false);
            }
        };
        loadLogs();
    }, [selectedStopId, route?.run_date, getAccessToken]);

    if (loading) {
        return (
            <OpsLayout title="Loading...">
                <OpsCard>
                    <p className="text-center text-gray-500">Loading route details...</p>
                </OpsCard>
            </OpsLayout>
        );
    }

    if (!route) {
        return (
            <OpsLayout title="Error">
                <OpsCard>
                    <p className="text-center text-gray-500">Route not found.</p>
                    <div className="text-center mt-4">
                        <OpsButton onClick={onBack}>Back</OpsButton>
                    </div>
                </OpsCard>
            </OpsLayout>
        );
    }

    return (
        <OpsLayout
            title={`Completed Route #${route.id}`}
            subtitle={`${route.run_date} • ${route.route_pool_id}`}
            onBack={onBack}
        >
            <OpsCard className="mb-6">
                <h3 className="mt-0 mb-1 text-base font-semibold text-gray-800">Stops List</h3>
                <p className="text-gray-500 text-sm mb-4">Click a stop to view clean logs.</p>
                <OpsTable headers={["#", "Location", "Status", "Actions"]}>
                    {route.stops.map((stop) => (
                        <OpsTableRow
                            key={stop.stop_id}
                            onClick={() => setSelectedStopId(stop.stop_id)}
                            className={cn(selectedStopId === stop.stop_id ? "bg-blue-50" : "")}
                        >
                            <OpsTableCell>{stop.stopNumber}</OpsTableCell>
                            <OpsTableCell>
                                {stop.on_street_name} {stop.cross_street ? `/ ${stop.cross_street}` : ""}
                            </OpsTableCell>
                            <OpsTableCell>{stop.status}</OpsTableCell>
                            <OpsTableCell>
                                <OpsButton size="sm" variant="outline" onClick={() => setSelectedStopId(stop.stop_id)}>
                                    View Logs
                                </OpsButton>
                            </OpsTableCell>
                        </OpsTableRow>
                    ))}
                </OpsTable>
            </OpsCard>

            {selectedStopId && (
                <OpsCard>
                    <h3 className="mt-0 mb-3 text-base font-semibold text-gray-800">
                        Clean Logs: Stop {selectedStopId}
                    </h3>
                    {loadingLogs ? (
                        <p className="text-gray-500 text-sm">Loading logs...</p>
                    ) : (
                        <OpsTable headers={["Cleaned At", "Washed pad", "Washed shelter", "Litter", "Volume"]}>
                            {cleanLogs.map(log => (
                                <OpsTableRow key={log.id}>
                                    <OpsTableCell>{new Date(log.cleaned_at).toLocaleString()}</OpsTableCell>
                                    <OpsTableCell>{log.washed_pad ? "Yes" : "No"}</OpsTableCell>
                                    <OpsTableCell>{log.washed_shelter ? "Yes" : "No"}</OpsTableCell>
                                    <OpsTableCell>{log.picked_up_litter ? "Yes" : "No"}</OpsTableCell>
                                    <OpsTableCell>{log.trash_volume ?? "—"}%</OpsTableCell>
                                </OpsTableRow>
                            ))}
                            {cleanLogs.length === 0 && (
                                <OpsTableRow>
                                    <OpsTableCell colSpan={5} className="text-center py-6 text-gray-500">
                                        No logs found for this stop/date.
                                    </OpsTableCell>
                                </OpsTableRow>
                            )}
                        </OpsTable>
                    )}
                </OpsCard>
            )}
        </OpsLayout>
    );
}
