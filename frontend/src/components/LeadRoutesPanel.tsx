import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchLeadTodaysRuns, type LeadRouteRunSummary } from "../api/routeRuns";
import { useCreateRoute } from "../hooks/useCreateRoute";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsBadge } from "./ui/OpsBadge";
import { OpsButton } from "./ui/OpsButton";
import { LeadRouteDetail } from "./LeadRouteDetail";
import { RouteCreatePanel } from "./RouteCreatePanel";

export function LeadRoutesPanel() {
  const { getAccessToken } = useAuth();
  const [runs, setRuns] = useState<LeadRouteRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const createRouteHook = useCreateRoute({
    onCreated: () => fetchRuns()
  });

  const fetchRuns = async () => {
    try {
      const token = await getAccessToken();
      const data = await fetchLeadTodaysRuns(token);
      setRuns(data);
    } catch (err: any) {
      setError(err.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [getAccessToken]);

  if (selectedRunId) {
    return <LeadRouteDetail id={selectedRunId} onBack={() => setSelectedRunId(null)} />;
  }

  const rightActions = (
    <OpsButton onClick={createRouteHook.open} variant="primary">
      + Create Route
    </OpsButton>
  );

  return (
    <OpsLayout
      title="Active Routes"
      subtitle="Lead view — today's route runs."
      rightActions={rightActions}
    >
      {error && (
        <OpsCard style={{ backgroundColor: "#fff5f5", borderColor: "#feb2b2", marginBottom: "1.5rem" }} padding="0.75rem">
          <p style={{ margin: 0, color: "#c53030", fontSize: "0.875rem" }}>{error}</p>
        </OpsCard>
      )}
      <OpsCard padding={0}>
        <OpsTable headers={["ID", "UL Worker", "Pool", "Status", "Stops", "Date"]}>
          {runs.map((run) => (
            <OpsTableRow key={run.id} onClick={() => setSelectedRunId(run.id)}>
              <OpsTableCell style={{ fontFamily: "monospace", color: "#718096" }}>#{run.id}</OpsTableCell>
              <OpsTableCell style={{ fontWeight: 600 }}>UID:{run.user_id}</OpsTableCell>
              <OpsTableCell>{run.route_pool_id}</OpsTableCell>
              <OpsTableCell>
                <OpsBadge
                  variant={run.status === "completed" ? "success" : "status"}
                  value={run.status.replace("_", " ")}
                />
              </OpsTableCell>
              <OpsTableCell>{run.stopCount}</OpsTableCell>
              <OpsTableCell>{new Date(run.run_date).toLocaleDateString()}</OpsTableCell>
            </OpsTableRow>
          ))}
          {runs.length === 0 && !loading && (
            <OpsTableRow>
              <OpsTableCell colSpan={6} style={{ textAlign: "center", padding: "3rem", color: "#718096" }}>
                No routes found for today.
              </OpsTableCell>
            </OpsTableRow>
          )}
        </OpsTable>
      </OpsCard>

      <RouteCreatePanel
        isOpen={createRouteHook.isOpen}
        onClose={createRouteHook.close}
        hook={createRouteHook}
      />
    </OpsLayout>
  );
}
