import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getStopsScoped, bulkUpdateAdminStops, updateAdminStop, fetchPools, type Pool } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsButton } from "../ui/OpsButton";
import { OpsBadge } from "../ui/OpsBadge";
import { DataTable, type DataTableColumn } from "../ui/DataTable";
import { StopHistoryDrawer } from "../StopHistoryDrawer";
import { cn } from "../../lib/utils";

interface AdminStopsPanelProps {
  scope?: "admin" | "ops";
}

function normalizeText(v: any): string {
  const s = (v ?? "").toString().trim();
  return s && s !== "—" ? s : "";
}

function getStopField(stop: any, key: string) {
  return stop?.[key] ?? stop?.[key.toUpperCase()];
}

function buildLocation(stop: any): string {
  const onStreet = normalizeText(getStopField(stop, "on_street_name"));
  const intersection = normalizeText(getStopField(stop, "intersection_loc"));
  const hastus = normalizeText(getStopField(stop, "hastus_cross_street_name"));
  const parts = [onStreet, intersection, hastus].filter(Boolean);
  return parts.length ? parts.join(" | ") : "—";
}

export function AdminStopsPanel({ scope = "admin" }: AdminStopsPanelProps) {
  const { getAccessToken } = useAuth();
  const [stops, setStops] = useState<any[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [selectedStopIds, setSelectedStopIds] = useState<string[]>([]);
  const [rowEdits, setRowEdits] = useState<Record<string, { pool_id?: string; notes?: string }>>({});
  const [savingRow, setSavingRow] = useState<Record<string, boolean>>({});
  // D5b — read-only per-stop history drawer; a read control, so it renders in
  // BOTH the ops (read-only) and admin (edit) scopes.
  const [historyStopId, setHistoryStopId] = useState<string | null>(null);

  const isReadOnly = scope === "ops";

  const fetchStops = async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const data = await getStopsScoped(token, {
        page,
        pageSize: 20,
        q: search,
        pool_id: selectedPoolId,
      }, scope);
      setStops(data?.items ?? []);
      setTotal(data?.total ?? 0);
    } catch (err: any) {
      console.error("Failed to fetch stops:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const token = await getAccessToken();
        const poolsData = await fetchPools(token);
        setPools(Array.isArray(poolsData) ? poolsData : []);
      } catch (err) {
        console.error("Failed to load pools:", err);
      }
    };
    loadInitialData();
  }, [getAccessToken]);

  useEffect(() => {
    fetchStops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedPoolId, getAccessToken, scope]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStops();
  };

  const toggleSelection = (id: string) => {
    if (isReadOnly) return;
    setSelectedStopIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkUpdate = async (patch: any) => {
    if (isReadOnly || selectedStopIds.length === 0) return;
    try {
      const token = await getAccessToken();
      await bulkUpdateAdminStops(token, { stop_ids: selectedStopIds, ...patch });
      setSelectedStopIds([]);
      fetchStops();
    } catch (err: any) {
      alert(err?.message || "Bulk update failed");
    }
  };

  const saveRow = async (stopId: string) => {
    if (isReadOnly) return;
    const patch = rowEdits[stopId];
    if (!patch) return;
    setSavingRow(m => ({ ...m, [stopId]: true }));
    try {
      const token = await getAccessToken();
      await updateAdminStop(token, stopId, patch);
      setRowEdits(m => { const c = { ...m }; delete c[stopId]; return c; });
      await fetchStops();
    } catch (e: any) {
      alert(e?.message || "Failed to save stop");
    } finally {
      setSavingRow(m => ({ ...m, [stopId]: false }));
    }
  };

  const handleToggle = async (stopId: string, field: string, currentValue: boolean) => {
    if (isReadOnly) return;
    try {
      const token = await getAccessToken();
      await updateAdminStop(token, stopId, { [field]: !currentValue });
      fetchStops();
    } catch (e: any) {
      console.error(`Failed to toggle ${field}`, e);
      alert(`Failed to toggle ${field}`);
    }
  };

  // Build columns as closures — they capture component state directly
  const columns: DataTableColumn<any>[] = [
    ...(!isReadOnly ? [{
      key: "select",
      header: "",
      headerClassName: "w-8",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        return (
          <input
            type="checkbox"
            checked={stopId ? selectedStopIds.includes(stopId) : false}
            onChange={() => stopId && toggleSelection(stopId)}
            className="w-4 h-4 accent-(--color-brand-700) cursor-pointer"
          />
        );
      },
    } as DataTableColumn<any>] : []),
    {
      key: "stop_id",
      header: "Stop #",
      sortable: true,
      mono: true,
      getValue: (stop: any) => normalizeText(getStopField(stop, "stop_id")),
      render: (stop: any) => (
        <span className="font-semibold text-(--text-heading)">
          {normalizeText(getStopField(stop, "stop_id")) || "—"}
        </span>
      ),
    },
    {
      key: "bearing",
      header: "Bearing",
      sortable: true,
      mono: true,
      getValue: (stop: any) => normalizeText(getStopField(stop, "bearing_code")),
      render: (stop: any) => normalizeText(getStopField(stop, "bearing_code")) || "—",
    },
    {
      key: "location",
      header: "Location",
      sortable: true,
      getValue: (stop: any) => buildLocation(stop),
      render: (stop: any) => (
        <span className="text-(--text-body)">{buildLocation(stop)}</span>
      ),
    },
    {
      key: "pool",
      header: "Pool",
      sortable: true,
      getValue: (stop: any) => {
        const poolId = normalizeText(getStopField(stop, "pool_id") || getStopField(stop, "route_pool_id"));
        return pools.find(p => String(p.id) === poolId)?.name ?? poolId;
      },
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        const poolId = normalizeText(getStopField(stop, "pool_id") || getStopField(stop, "route_pool_id"));
        const editState = rowEdits[stopId] || {};
        const currentPoolId = editState.pool_id !== undefined ? editState.pool_id : poolId;

        if (isReadOnly) {
          return <span>{pools.find(p => String(p.id) === poolId)?.name ?? (poolId || "—")}</span>;
        }
        return (
          <select
            value={currentPoolId}
            onChange={(e) => setRowEdits(prev => ({
              ...prev,
              [stopId]: { ...prev[stopId], pool_id: e.target.value },
            }))}
            className="max-w-[150px] px-2 py-1 rounded border border-(--border-default) text-sm bg-(--surface-card) focus:outline-none focus:ring-1 focus:ring-(--color-brand)"
          >
            <option value="">Unassigned</option>
            {pools.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        );
      },
    },
    {
      key: "notes",
      header: "Notes",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        const existingNotes = normalizeText(getStopField(stop, "notes"));
        const editState = rowEdits[stopId] || {};
        const currentNotes = editState.notes !== undefined ? editState.notes : existingNotes;

        if (isReadOnly) {
          return <span className="text-(--text-muted) text-sm">{existingNotes || "—"}</span>;
        }
        return (
          <input
            type="text"
            value={currentNotes}
            onChange={(e) => setRowEdits(prev => ({
              ...prev,
              [stopId]: { ...prev[stopId], notes: e.target.value },
            }))}
            placeholder="Add notes…"
            className="w-full px-2 py-1 rounded border border-(--border-default) text-sm focus:outline-none focus:ring-1 focus:ring-(--color-brand)"
          />
        );
      },
    },
    {
      key: "flags",
      header: "Flags",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        // Text pills, not emoji, per the DS iconography rules
        const flags: Array<{ field: string; label: string; active: boolean }> = [
          { field: "is_hotspot", label: "Hotspot", active: !!(stop?.is_hotspot ?? stop?.IS_HOTSPOT) },
          { field: "compactor", label: "Compactor", active: !!(stop?.compactor ?? stop?.COMPACTOR) },
          { field: "has_trash", label: "Trash", active: !!(stop?.has_trash ?? stop?.HAS_TRASH) },
        ];

        if (isReadOnly) {
          const active = flags.filter(f => f.active);
          if (active.length === 0) return <span className="text-(--text-muted)">—</span>;
          return (
            <div className="flex gap-1 flex-wrap">
              {active.map(f => <OpsBadge key={f.field} variant="neutral" value={f.label} />)}
            </div>
          );
        }
        return (
          <div className="flex gap-1 flex-wrap">
            {flags.map(f => (
              <button
                key={f.field}
                onClick={() => handleToggle(stopId, f.field, f.active)}
                title={`Toggle ${f.label}`}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap",
                  f.active
                    ? "bg-(--gray-100) text-(--gray-800) border-(--border-strong)"
                    : "bg-transparent text-(--text-disabled) border-(--border-default) hover:bg-(--gray-50)"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        );
      },
    },
    {
      key: "history",
      header: "History",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        if (!stopId) return null;
        return (
          <OpsButton
            size="sm"
            variant="outline"
            aria-label={`History for stop ${stopId}`}
            onClick={() => setHistoryStopId(stopId)}
          >
            History
          </OpsButton>
        );
      },
    },
    ...(!isReadOnly ? [{
      key: "actions",
      header: "Actions",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        const editState = rowEdits[stopId] || {};
        const hasChanges = editState.pool_id !== undefined || editState.notes !== undefined;
        const isSaving = savingRow[stopId];

        if (!hasChanges) return null;
        return (
          <OpsButton size="sm" onClick={() => saveRow(stopId)} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </OpsButton>
        );
      },
    } as DataTableColumn<any>] : []),
  ];

  return (
    <OpsLayout title="All Stops" subtitle="Search and filter stops.">
      {/* Search / filter toolbar */}
      <OpsCard className="p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search stop number, street…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-(--border-strong) text-sm focus:outline-none focus:ring-2 focus:ring-(--color-brand) min-h-[44px]"
            />
          </div>
          <div>
            <select
              value={selectedPoolId}
              onChange={(e) => setSelectedPoolId(e.target.value)}
              className="px-3 py-2 rounded-md border border-(--border-strong) text-sm bg-(--surface-card) focus:outline-none focus:ring-2 focus:ring-(--color-brand) min-h-[44px]"
            >
              <option value="">— All Pools —</option>
              {pools.map(p => (
                <option key={String(p.id)} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>
          <OpsButton type="submit" variant="secondary">Filter</OpsButton>
        </form>
      </OpsCard>

      {/* Bulk selection toolbar */}
      {!isReadOnly && selectedStopIds.length > 0 && (
        <div className="bg-(--color-brand-50) border border-(--color-brand-100) rounded-lg p-4 mb-6 flex gap-4 items-center flex-wrap">
          <span className="text-sm font-semibold text-(--color-brand-dark)">
            {selectedStopIds.length} stop{selectedStopIds.length !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ is_hotspot: true })}>Set Hotspot</OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ is_hotspot: false })}>Clear Hotspot</OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ compactor: true })}>Set Compactor</OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ compactor: false })}>Clear Compactor</OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ has_trash: true })}>Set Has Trash</OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ has_trash: false })}>Clear Has Trash</OpsButton>
            <OpsButton size="sm" variant="secondary" onClick={() => setSelectedStopIds([])}>Clear Selection</OpsButton>
          </div>
        </div>
      )}

      <DataTable<any>
        columns={columns}
        data={stops}
        getRowKey={(stop) => {
          const id = normalizeText(getStopField(stop, "stop_id"));
          return id || String(Math.random());
        }}
        total={total}
        pageSize={20}
        page={page}
        onPageChange={(p) => setPage(p)}
        serverPagination={true}
        isLoading={loading}
        emptyMessage="No stops found. Try adjusting your search or filter."
      />

      {historyStopId && (
        <StopHistoryDrawer stopId={historyStopId} onClose={() => setHistoryStopId(null)} />
      )}
    </OpsLayout>
  );
}
