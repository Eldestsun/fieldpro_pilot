import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getPoolsScoped, createAdminPool, disableAdminPool, type Pool } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";
import { OpsBadge } from "../ui/OpsBadge";
import { OpsButton } from "../ui/OpsButton";

interface AdminPoolsPanelProps {
  scope?: "admin" | "ops";
}

export function AdminPoolsPanel({ scope = "admin" }: AdminPoolsPanelProps) {
  const { getAccessToken } = useAuth();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");

  const isReadOnly = scope === "ops";

  const fetchPools = async () => {
    try {
      const token = await getAccessToken();
      const data = await getPoolsScoped(token, scope);
      // Ensure we handle both { pools: [...] } and direct array if helper changes,
      // but current getPoolsScoped returns Promise<Pool[]>.
      // Wait, let's double check routeRuns.ts helper return type.
      // getOpsPools returns data.pools (array). getAdminPools returns data.pools (array).
      // So data is Pool[].
      setPools(data);
    } catch (err: any) {
      console.error(err.message || "Failed to load pools");
    }
  };

  useEffect(() => {
    fetchPools();
  }, [getAccessToken, scope]);

  const handleCreate = async () => {
    if (!newPoolName.trim()) return;
    try {
      const token = await getAccessToken();
      await createAdminPool(token, { name: newPoolName });
      setNewPoolName("");
      setIsCreating(false);
      fetchPools();
    } catch (err: any) {
      alert(err.message || "Failed to create pool");
    }
  };

  const handleDisable = async (id: string) => {
    if (!confirm("Are you sure you want to disable this pool?")) return;
    try {
      const token = await getAccessToken();
      await disableAdminPool(token, id);
      fetchPools();
    } catch (err: any) {
      alert(err.message || "Failed to disable pool");
    }
  };

  // Define headers based on readonly status
  const headers = ["ID", "Name", "Status"];
  if (!isReadOnly) headers.push("Actions");

  return (
    <OpsLayout
      title="Route Pools"
      subtitle="View pools and defaults."
      rightActions={
        !isReadOnly ? (
          <OpsButton onClick={() => setIsCreating(true)} variant="primary">
            + Create Pool
          </OpsButton>
        ) : undefined
      }
    >
      {isCreating && (
        <OpsCard style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Create New Pool</h3>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Pool Name</label>
              <input
                type="text"
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                placeholder="e.g. Downtown Core"
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e0" }}
              />
            </div>
            <OpsButton variant="primary" onClick={handleCreate}>Save</OpsButton>
            <OpsButton variant="secondary" onClick={() => setIsCreating(false)}>Cancel</OpsButton>
          </div>
        </OpsCard>
      )}

      <OpsCard padding={0}>
        <OpsTable headers={headers}>
          {pools.map((pool) => (
            <OpsTableRow key={pool.id}>
              <OpsTableCell style={{ fontFamily: "monospace", color: "#718096" }}>{pool.id}</OpsTableCell>
              <OpsTableCell style={{ fontWeight: 600 }}>{pool.name}</OpsTableCell>
              <OpsTableCell>
                <OpsBadge variant="success" value="Active" />
              </OpsTableCell>
              {!isReadOnly && (
                <OpsTableCell>
                  <OpsButton variant="outline" size="sm" onClick={() => handleDisable(pool.id)}>
                    Disable
                  </OpsButton>
                </OpsTableCell>
              )}
            </OpsTableRow>
          ))}
          {pools.length === 0 && (
            <OpsTableRow>
              <OpsTableCell colSpan={headers.length} style={{ textAlign: "center", padding: "2rem", color: "#718096" }}>
                No pools found.
              </OpsTableCell>
            </OpsTableRow>
          )}
        </OpsTable>
      </OpsCard>
    </OpsLayout>
  );
}
