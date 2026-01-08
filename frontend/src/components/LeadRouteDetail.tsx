import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getLeadRouteRunById, assignRouteRun, fetchUlUsers, type RouteRun, type UlUser } from "../api/routeRuns";
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
    const [assignableUsers, setAssignableUsers] = useState<UlUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [reassigning, setReassigning] = useState(false);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const token = await getAccessToken();
                const [runData, usersData] = await Promise.all([
                    getLeadRouteRunById(token, id),
                    fetchUlUsers(token)
                ]);
                setRouteRun(runData);

                // Filter for assignable users (non-Admins)
                const assignableUsers = usersData.filter(u => u.role !== "Admin");
                setAssignableUsers(assignableUsers);

                // Preselect current user if found in list
                const assignedOid = runData.assigned_user_oid; // Note: Ensure interface has this field
                if (assignedOid) {
                    setSelectedUser(assignedOid);
                }

            } catch (err: any) {
                setError(err.message || "Failed to load route detail");
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [id, getAccessToken]);

    const handleReassign = async () => {
        if (!routeRun || reassigning) return;
        setReassigning(true);
        try {
            const token = await getAccessToken();
            // Handle "unassigned" as potential empty string from select, convert to null
            const targetOid = selectedUser === "" ? null : selectedUser;

            const updatedRun = await assignRouteRun(token, routeRun.id, targetOid);
            setRouteRun(updatedRun);
            // Reset local selection to match actual result
            if (updatedRun.assigned_user_oid) {
                setSelectedUser(updatedRun.assigned_user_oid);
            } else {
                setSelectedUser("");
            }
        } catch (err: any) {
            alert(err.message || "Reassignment failed");
        } finally {
            setReassigning(false);
        }
    };

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
                            {routeRun.status !== "completed" && routeRun.status !== "finished" && routeRun.stops.filter(s => s.status === "done" || s.status === "skipped").length > 0 ? (
                                <OpsBadge variant="warning" value="Partially completed" />
                            ) : (
                                <OpsBadge variant={routeRun.status === "completed" ? "success" : "status"} value={routeRun.status.replace("_", " ")} />
                            )}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Created By</div>
                        <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{routeRun.created_by?.display_name ?? "—"}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Pool</div>
                        <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>{routeRun.route_pool_id}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase" }}>Operator</div>
                        <div style={{ marginTop: "0.25rem", fontWeight: 600 }}>
                            {routeRun.assigned_user?.display_name ?? "Unassigned"}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                    <label style={{ fontSize: "0.75rem", color: "#718096", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "0.5rem" }}>
                        Reassign Route
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <select
                            value={selectedUser}
                            onChange={(e) => setSelectedUser(e.target.value)}
                            style={{
                                padding: "0.5rem",
                                border: "1px solid #e2e8f0",
                                borderRadius: "0.25rem",
                                background: "white",
                                minWidth: "200px"
                            }}
                            disabled={reassigning}
                        >
                            <option value="">Select New Operator</option>
                            {assignableUsers.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.displayName}
                                </option>
                            ))}
                        </select>
                        <OpsButton
                            onClick={handleReassign}
                            disabled={reassigning || selectedUser === (routeRun.assigned_user_oid || "")}
                            size="sm"
                        >
                            {reassigning ? "Saving..." : "Reassign"}
                        </OpsButton>
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
