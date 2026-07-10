import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getOpsRouteRuns, type OpsRouteRun } from "../api/routeRuns";
import { useCreateRoute } from "../hooks/useCreateRoute";
import { OpsLayout } from "./ui/OpsLayout";
import { OpsCard } from "./ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";
import { OpsBadge } from "./ui/OpsBadge";
import { OpsButton } from "./ui/OpsButton";
import { LeadRouteDetail } from "./LeadRouteDetail";
import { LeadCompletedRouteDetail } from "./LeadCompletedRouteDetail";
import { RouteCreatePanel } from "./RouteCreatePanel";

export function LeadRoutesPanel() {
  const { getAccessToken } = useAuth();
  const [runs, setRuns] = useState<OpsRouteRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedActiveRunId, setSelectedActiveRunId] = useState<number | null>(null);
  const [selectedCompletedRunId, setSelectedCompletedRunId] = useState<number | null>(null);

  const createRouteHook = useCreateRoute({
    onCreated: () => fetchRuns()
  });

  const fetchRuns = async () => {
    try {
      const token = await getAccessToken();
      const allRuns = await getOpsRouteRuns(token, { page: 1, pageSize: 50 });
      setRuns(allRuns);
    } catch (err: any) {
      setError(err.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [getAccessToken]);

  if (selectedActiveRunId) {
    return <LeadRouteDetail id={selectedActiveRunId} onBack={() => setSelectedActiveRunId(null)} />;
  }

  if (selectedCompletedRunId) {
    return <LeadCompletedRouteDetail id={selectedCompletedRunId} onBack={() => setSelectedCompletedRunId(null)} />;
  }

  const isCompletedStatus = (s?: string) => {
    const v = (s || "").toLowerCase();
    return v === "finished" || v === "completed";
  };

  const completedRuns = runs.filter(r => isCompletedStatus(r.status));
  const activeRuns = runs.filter(r => !isCompletedStatus(r.status));

  const rightActions = (
    <OpsButton onClick={createRouteHook.open} variant="primary">
      + Create Route
    </OpsButton>
  );

  return (
    <OpsLayout
      title="Routes"
      subtitle="Today's route runs."
      rightActions={rightActions}
    >
      {error && (
        <OpsCard className="bg-red-50 border-red-200 mb-6 p-3">
          <p className="m-0 text-red-700 text-sm">{error}</p>
        </OpsCard>
      )}

      <OpsCard className="mb-6">
        <h3 className="mt-0 mb-3 text-lg font-semibold text-gray-800">Active Routes</h3>
        <OpsTable headers={["ID", "Pool", "Status", "Stops", "Date"]}>
          {activeRuns.map((run) => (
            <OpsTableRow key={run.id} onClick={() => setSelectedActiveRunId(run.id)}>
              <OpsTableCell className="font-mono text-gray-500">#{run.id}</OpsTableCell>
              <OpsTableCell>{run.pool_label || run.route_pool_id}</OpsTableCell>
              <OpsTableCell>
                <OpsBadge
                  variant={run.status === "in_progress" ? "status" : "neutral"}
                  value={(run.status || "unknown").replaceAll("_", " ")}
                />
              </OpsTableCell>
              <OpsTableCell>{run.completed_stops} of {run.stop_count}</OpsTableCell>
              <OpsTableCell>{new Date(run.run_date).toLocaleDateString()}</OpsTableCell>
            </OpsTableRow>
          ))}
          {activeRuns.length === 0 && !loading && (
            <OpsTableRow>
              <OpsTableCell colSpan={5} className="text-center py-6 text-gray-500">
                No active routes.
              </OpsTableCell>
            </OpsTableRow>
          )}
        </OpsTable>
      </OpsCard>

      <OpsCard>
        <h3 className="mt-0 mb-3 text-lg font-semibold text-gray-800">Completed Routes</h3>
        <OpsTable headers={["ID", "Pool", "Status", "Stops", "Date"]}>
          {completedRuns.map((run) => (
            <OpsTableRow key={run.id} onClick={() => setSelectedCompletedRunId(run.id)}>
              <OpsTableCell className="font-mono text-gray-500">#{run.id}</OpsTableCell>
              <OpsTableCell>{run.pool_label || run.route_pool_id}</OpsTableCell>
              <OpsTableCell>
                <OpsBadge
                  variant="success"
                  value={(run.status || "completed").replaceAll("_", " ")}
                />
              </OpsTableCell>
              <OpsTableCell>{run.completed_stops} of {run.stop_count}</OpsTableCell>
              <OpsTableCell>{new Date(run.run_date).toLocaleDateString()}</OpsTableCell>
            </OpsTableRow>
          ))}
          {completedRuns.length === 0 && !loading && (
            <OpsTableRow>
              <OpsTableCell colSpan={5} className="text-center py-6 text-gray-500">
                No completed routes.
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
