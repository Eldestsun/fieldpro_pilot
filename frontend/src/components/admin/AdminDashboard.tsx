import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getDashboard, type AdminDashboardStats } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { StatCard } from "../ui/StatCard";

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

  if (loading) {
    return (
      <OpsLayout title="Operations Dashboard" subtitle="Loading overview…">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <OpsCard key={i}>
              <div className="h-4 bg-gray-200 rounded animate-pulse mb-3 w-24" />
              <div className="h-10 bg-gray-200 rounded animate-pulse w-16" />
            </OpsCard>
          ))}
        </div>
      </OpsLayout>
    );
  }

  if (error) {
    return (
      <OpsLayout title="Operations Dashboard" subtitle="Error loading stats">
        <OpsCard className="border-(--color-danger)/20 bg-(--color-danger-tint)">
          <p className="text-(--color-danger) text-sm">{error}</p>
        </OpsCard>
      </OpsLayout>
    );
  }

  return (
    <OpsLayout title="Operations Dashboard" subtitle="Read-only overview.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Stops"
          value={stats?.total_stops ?? 0}
        />
        <StatCard
          label="Total Pools"
          value={stats?.total_pools ?? 0}
        />
        <StatCard
          label="Active Runs Today"
          value={stats?.active_runs_today ?? 0}
          tone="brand"
        />
        <StatCard
          label="Completed Runs Today"
          value={stats?.completed_runs_today ?? 0}
          tone="success"
        />
      </div>
    </OpsLayout>
  );
}
