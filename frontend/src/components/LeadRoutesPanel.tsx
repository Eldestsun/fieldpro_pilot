import { useEffect, useState, useRef, useCallback } from "react";
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

// SEAM-A A2 — per-run exception badges. Only non-zero counts render (silence = clean;
// "0 hazards" would be assumed-dirty framing). Counts attach to the run, never a worker.
// "emergency_count" is the historical field name; it is displayed as "unplanned".
function RunExceptionBadges({ run }: { run: OpsRouteRun }) {
  const badges: Array<{ key: string; variant: "danger" | "warning" | "info"; label: string }> = [];
  if (run.hazard_count > 0) badges.push({ key: "haz", variant: "danger", label: `${run.hazard_count} hazard${run.hazard_count === 1 ? "" : "s"}` });
  if (run.skipped_count > 0) badges.push({ key: "skip", variant: "warning", label: `${run.skipped_count} skipped` });
  if (run.emergency_count > 0) badges.push({ key: "unpl", variant: "info", label: `${run.emergency_count} unplanned` });
  if (badges.length === 0) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {badges.map((b) => <OpsBadge key={b.key} variant={b.variant} value={b.label} />)}
    </span>
  );
}

export function LeadRoutesPanel() {
  const { getAccessToken } = useAuth();
  const [runs, setRuns] = useState<OpsRouteRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedActiveRunId, setSelectedActiveRunId] = useState<number | null>(null);
  const [selectedCompletedRunId, setSelectedCompletedRunId] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const allRuns = await getOpsRouteRuns(token, { page: 1, pageSize: 50 });
      setRuns(allRuns);
    } catch (err: any) {
      setError(err.message || "Failed to load routes");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  const createRouteHook = useCreateRoute({
    onCreated: () => fetchRuns()
  });

  // SEAM-A A3 — near-real-time refresh: initial fetch + 30s polling, mirroring the
  // Control Center pattern (AdminControlCenter). Interval is cleared on unmount.
  const POLL_INTERVAL_MS = 30_000;
  useEffect(() => {
    fetchRuns();
    intervalRef.current = setInterval(fetchRuns, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [fetchRuns]);

  // Pause polling when the tab is hidden; resume and immediately refresh when visible.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchRuns();
        if (intervalRef.current !== null) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchRuns, POLL_INTERVAL_MS);
      } else if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchRuns]);

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
        <OpsTable headers={["ID", "Pool", "Status", "Stops", "Exceptions", "Date"]}>
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
              <OpsTableCell><RunExceptionBadges run={run} /></OpsTableCell>
              <OpsTableCell>{new Date(run.run_date).toLocaleDateString()}</OpsTableCell>
            </OpsTableRow>
          ))}
          {activeRuns.length === 0 && !loading && (
            <OpsTableRow>
              <OpsTableCell colSpan={6} className="text-center py-6 text-gray-500">
                No active routes.
              </OpsTableCell>
            </OpsTableRow>
          )}
        </OpsTable>
      </OpsCard>

      <OpsCard>
        <h3 className="mt-0 mb-3 text-lg font-semibold text-gray-800">Completed Routes</h3>
        <OpsTable headers={["ID", "Pool", "Status", "Stops", "Exceptions", "Date"]}>
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
              <OpsTableCell><RunExceptionBadges run={run} /></OpsTableCell>
              <OpsTableCell>{new Date(run.run_date).toLocaleDateString()}</OpsTableCell>
            </OpsTableRow>
          ))}
          {completedRuns.length === 0 && !loading && (
            <OpsTableRow>
              <OpsTableCell colSpan={6} className="text-center py-6 text-gray-500">
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
