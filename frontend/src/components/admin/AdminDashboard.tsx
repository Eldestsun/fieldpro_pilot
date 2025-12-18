import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getDashboard, type AdminDashboardStats } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";

interface AdminDashboardProps {
  scope?: "admin" | "ops";
}

export function AdminDashboard({ scope = "admin" }: AdminDashboardProps) {
  const { getAccessToken } = useAuth();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = await getAccessToken();
        // Use the new scoped helper from routeRuns
        // Note: we need to import getDashboard first, which we will do in next step or assume user imports are updated usually?
        // Wait, I need to update imports.
        // Let's do the import update in the same file if possible or use full replace if easier.
        // The file is small (58 lines). I'll use replace_file_content for the body first.
        const data = await getDashboard(token, scope);
        setStats(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard stats");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [getAccessToken, scope]);

  if (loading) return <OpsLayout title="Operations Dashboard" subtitle="Loading overview..."><p>Loading...</p></OpsLayout>;
  if (error) return <OpsLayout title="Operations Dashboard" subtitle="Error loading stats"><p style={{ color: "red" }}>{error}</p></OpsLayout>;

  return (
    <OpsLayout title="Operations Dashboard" subtitle="Read-only overview.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.5rem" }}>
        <OpsCard>
          <div style={{ color: "#718096", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Total Stops</div>
          <div style={{ fontSize: "2.25rem", fontWeight: 700, color: "#2d3748" }}>{stats?.total_stops || 0}</div>
        </OpsCard>
        <OpsCard>
          <div style={{ color: "#718096", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Total Pools</div>
          <div style={{ fontSize: "2.25rem", fontWeight: 700, color: "#2d3748" }}>{stats?.total_pools || 0}</div>
        </OpsCard>
        <OpsCard>
          <div style={{ color: "#718096", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Active Runs Today</div>
          <div style={{ fontSize: "2.25rem", fontWeight: 700, color: "#2b6cb0" }}>{stats?.active_runs_today || 0}</div>
        </OpsCard>
        <OpsCard>
          <div style={{ color: "#718096", fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", marginBottom: "0.5rem" }}>Completed Runs Today</div>
          <div style={{ fontSize: "2.25rem", fontWeight: 700, color: "#2f855a" }}>{stats?.completed_runs_today || 0}</div>
        </OpsCard>
      </div>
    </OpsLayout>
  );
}
