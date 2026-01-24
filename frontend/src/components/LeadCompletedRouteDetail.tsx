import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getLeadRouteRunById, getOpsCleanLogs, type RouteRun, type OpsCleanLog } from "../api/routeRuns";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsButton } from "./ui/OpsButton";

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
                // Fetch logs for this specific stop on this run's date (or generally for this stop)
                // User requested: "stops from route-run detail... click a stop loads its clean logs"
                // And suggested: "/api/ops/clean-logs?stop_id=...&run_date=..."
                // We know run_date from route.run_date.
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

    if (loading) return <OpsLayout title="Loading..."><OpsCard>Loading route details...</OpsCard></OpsLayout>;
    if (!route) return <OpsLayout title="Error"><OpsCard><p>Route not found.</p><OpsButton onClick={onBack}>Back</OpsButton></OpsCard></OpsLayout>;

    return (
        <OpsLayout
            title={`Completed Route #${route.id}`}
            subtitle={`${route.run_date} • ${route.route_pool_id}`}
            onBack={onBack}
        >
            <OpsCard style={{ marginBottom: "1.5rem" }}>
                <h3 style={{ marginTop: 0 }}>Stops List</h3>
                <p style={{ color: "#718096", fontSize: "0.875rem" }}>Click a stop to view clean logs.</p>
                <OpsTable headers={["#", "Location", "Status", "Actions"]}>
                    {route.stops.map((stop) => (
                        <OpsTableRow
                            key={stop.stop_id}
                            onClick={() => setSelectedStopId(stop.stop_id)}
                            style={selectedStopId === stop.stop_id ? { backgroundColor: "#ebf8ff" } : {}}
                        >
                            <OpsTableCell>{stop.stopNumber}</OpsTableCell>
                            <OpsTableCell>{stop.on_street_name} {stop.cross_street ? `/ ${stop.cross_street}` : ""}</OpsTableCell>
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
                    <h3 style={{ marginTop: 0 }}>Clean Logs: Stop {selectedStopId}</h3>
                    {loadingLogs ? <p>Loading logs...</p> : (
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
                            {cleanLogs.length === 0 && <OpsTableRow><OpsTableCell colSpan={4}>No logs found for this stop/date.</OpsTableCell></OpsTableRow>}
                        </OpsTable>
                    )}
                </OpsCard>
            )}
        </OpsLayout>
    );
}
