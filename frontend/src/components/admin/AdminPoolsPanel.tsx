import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getPoolsScoped, createAdminPool, disableAdminPool, type Pool } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsButton } from "../ui/OpsButton";
import { OpsBadge } from "../ui/OpsBadge";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const PAGE_SIZE = 20;

interface AdminPoolsPanelProps {
  scope?: "admin" | "ops";
}

export function AdminPoolsPanel({ scope = "admin" }: AdminPoolsPanelProps) {
  const { getAccessToken } = useAuth();
  const [pools, setPools] = useState<Pool[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDisableId, setConfirmDisableId] = useState<string | null>(null);

  const isReadOnly = scope === "ops";

  const fetchPools = async () => {
    try {
      const token = await getAccessToken();
      const data = await getPoolsScoped(token, scope);
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

  const handleDisableConfirmed = async () => {
    if (!confirmDisableId) return;
    const id = confirmDisableId;
    setConfirmDisableId(null);
    try {
      const token = await getAccessToken();
      await disableAdminPool(token, id);
      fetchPools();
    } catch (err: any) {
      alert(err.message || "Failed to disable pool");
    }
  };

  const poolToDisable = pools.find(p => p.id === confirmDisableId);

  const columns: DataTableColumn<Pool>[] = [
    {
      key: "id",
      header: "ID",
      sortable: true,
      getValue: p => String(p.id),
      render: p => <span className="font-mono text-(--text-muted) text-xs">{p.id}</span>,
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      getValue: p => p.name,
      render: p => <span className="font-semibold text-(--text-heading)">{p.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: () => <OpsBadge variant="success" value="Active" />,
    },
    ...(!isReadOnly ? [{
      key: "actions",
      header: "Actions",
      render: (p: Pool) => (
        <OpsButton
          variant="outline"
          size="sm"
          onClick={() => setConfirmDisableId(p.id)}
        >
          Disable
        </OpsButton>
      ),
    } as DataTableColumn<Pool>] : []),
  ];

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
        <OpsCard className="mb-6">
          <h3 className="mt-0 mb-4 text-base font-semibold text-(--text-heading)">Create New Pool</h3>
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-semibold text-(--text-body) mb-1">Pool Name</label>
              <input
                type="text"
                value={newPoolName}
                onChange={(e) => setNewPoolName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Downtown Core"
                className="w-full px-3 py-2 rounded-md border border-(--border-strong) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-brand) min-h-[44px]"
              />
            </div>
            <OpsButton variant="primary" onClick={handleCreate}>Save</OpsButton>
            <OpsButton variant="secondary" onClick={() => setIsCreating(false)}>Cancel</OpsButton>
          </div>
        </OpsCard>
      )}

      <DataTable<Pool>
        columns={columns}
        data={pools}
        getRowKey={p => String(p.id)}
        total={pools.length}
        pageSize={PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        emptyMessage="No pools found."
      />

      <ConfirmDialog
        isOpen={confirmDisableId !== null}
        title="Disable Pool"
        message={`Are you sure you want to disable "${poolToDisable?.name ?? ""}"? This cannot be undone from this panel.`}
        confirmLabel="Disable"
        variant="danger"
        onConfirm={handleDisableConfirmed}
        onCancel={() => setConfirmDisableId(null)}
      />
    </OpsLayout>
  );
}
