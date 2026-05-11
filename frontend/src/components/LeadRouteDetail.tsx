import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getLeadRouteRunById, type RouteRun } from "../api/routeRuns";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsBadge } from "./ui/OpsBadge";
import { OpsButton } from "./ui/OpsButton";

interface LeadRouteDetailProps {
    id: number;
    onBack: () => void;
}

export function LeadRouteDetail({ id, onBack }: LeadRouteDetailProps) {
    const { getAccessToken } = useAuth();
    const [routeRun, setRouteRun] = useState<RouteRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const token = await getAccessToken();
                const data = await getLeadRouteRunById(token, id);
                setRouteRun(data);
            } catch (err: any) {
                setError(err.message || "Failed to load route detail");
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [id, getAccessToken]);

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
                        <div className="mt-1 font-semibold text-gray-900">{routeRun.route_pool_id}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Date</div>
                        <div className="mt-1 font-semibold text-gray-900">
                            {new Date(routeRun.run_date).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </OpsCard>

            <OpsCard className="p-0">
                <OpsTable headers={["Seq", "Stop #", "Location", "Status"]}>
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
                        </OpsTableRow>
                    ))}
                    {routeRun.stops.length === 0 && (
                        <OpsTableRow>
                            <OpsTableCell colSpan={4} className="text-center py-8 text-gray-500">
                                No stops in this route.
                            </OpsTableCell>
                        </OpsTableRow>
                    )}
                </OpsTable>
            </OpsCard>
        </OpsLayout>
    );
}
