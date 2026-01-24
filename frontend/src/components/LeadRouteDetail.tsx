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
                    <p style={{ textAlign: "center", color: "#718096" }}>Loading stop list...</p>
                </OpsCard>
            </OpsLayout>
        );
    }

    if (error || !routeRun) {
        return (
            <OpsLayout title={`Route Run #${id}`} subtitle="Error">
                <OpsCard>
                    <p style={{ color: "#e53e3e", textAlign: "center" }}>{error || "Route not found"}</p>
                    <div style={{ textAlign: "center", marginTop: "1rem" }}>
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
            <OpsCard style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", gap: "2rem" }}>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Status</div>
                        <div style={{ marginTop: "0.25rem" }}>
                            <OpsBadge variant={routeRun.status === "completed" ? "success" : "status"} value={routeRun.status.replace("_", " ")} />
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Pool</div>
                        <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{routeRun.route_pool_id}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Worker</div>
                        <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>UID:{routeRun.user_id}</div>
                    </div>
                </div>
            </OpsCard>

            <OpsCard padding={0}>
                <OpsTable headers={["Seq", "Stop #", "Location", "Status"]}>
                    {routeRun.stops.map((stop) => (
                        <OpsTableRow key={stop.route_run_stop_id}>
                            <OpsTableCell style={{ color: "#718096" }}>{stop.sequence}</OpsTableCell>
                            <OpsTableCell style={{ fontWeight: 600 }}>{stop.stopNumber || stop.stop_id.slice(0, 8)}</OpsTableCell>
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
                            <OpsTableCell colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "#718096" }}>
                                No stops in this route.
                            </OpsTableCell>
                        </OpsTableRow>
                    )}
                </OpsTable>
            </OpsCard>
        </OpsLayout>
    );
}
