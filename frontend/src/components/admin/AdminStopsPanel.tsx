import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getStopsScoped, bulkUpdateAdminStops, updateAdminStop, fetchPools, type Pool } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsButton } from "../ui/OpsButton";
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
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
        );
      },
    } as DataTableColumn<any>] : []),
    {
      key: "stop_id",
      header: "Stop #",
      sortable: true,
      getValue: (stop: any) => normalizeText(getStopField(stop, "stop_id")),
      render: (stop: any) => (
        <span className="font-semibold text-gray-900">
          {normalizeText(getStopField(stop, "stop_id")) || "—"}
        </span>
      ),
    },
    {
      key: "bearing",
      header: "Bearing",
      sortable: true,
      getValue: (stop: any) => normalizeText(getStopField(stop, "bearing_code")),
      render: (stop: any) => normalizeText(getStopField(stop, "bearing_code")) || "—",
    },
    {
      key: "location",
      header: "Location",
      sortable: true,
      getValue: (stop: any) => buildLocation(stop),
      render: (stop: any) => (
        <span className="text-gray-700">{buildLocation(stop)}</span>
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
            className="max-w-[150px] px-2 py-1 rounded border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
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
          return <span className="text-gray-500 text-sm">{existingNotes || "—"}</span>;
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
            className="w-full px-2 py-1 rounded border border-gray-200 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        );
      },
    },
    {
      key: "flags",
      header: "Flags",
      render: (stop: any) => {
        const stopId = normalizeText(getStopField(stop, "stop_id"));
        const isHotspot = !!(stop?.is_hotspot ?? stop?.IS_HOTSPOT);
        const isCompactor = !!(stop?.compactor ?? stop?.COMPACTOR);
        const hasTrash = !!(stop?.has_trash ?? stop?.HAS_TRASH);

        if (isReadOnly) {
          return (
            <div className="flex gap-1">
              {isHotspot && <span title="Hotspot">🔥</span>}
              {isCompactor && <span title="Compactor">📦</span>}
              {hasTrash && <span title="Has Trash">🗑️</span>}
            </div>
          );
        }
        return (
          <div className="flex gap-1">
            <button
              onClick={() => handleToggle(stopId, "is_hotspot", isHotspot)}
              className={cn(
                "bg-transparent border-0 cursor-pointer text-xl transition-opacity p-0.5 rounded",
                isHotspot ? "opacity-100" : "opacity-25 hover:opacity-50"
              )}
              title="Toggle Hotspot"
            >🔥</button>
            <button
              onClick={() => handleToggle(stopId, "compactor", isCompactor)}
              className={cn(
                "bg-transparent border-0 cursor-pointer text-xl transition-opacity p-0.5 rounded",
                isCompactor ? "opacity-100" : "opacity-25 hover:opacity-50"
              )}
              title="Toggle Compactor"
            >📦</button>
            <button
              onClick={() => handleToggle(stopId, "has_trash", hasTrash)}
              className={cn(
                "bg-transparent border-0 cursor-pointer text-xl transition-opacity p-0.5 rounded",
                hasTrash ? "opacity-100" : "opacity-25 hover:opacity-50"
              )}
              title="Toggle Has Trash"
            >🗑️</button>
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
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search stop number, street…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            />
          </div>
          <div>
            <select
              value={selectedPoolId}
              onChange={(e) => setSelectedPoolId(e.target.value)}
              className="px-3 py-2 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            >
              <option value="">— All Pools —</option>
              {pools.map(p => (
                <option key={String(p.id)} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>
          <OpsButton type="submit" variant="secondary">Filter</OpsButton>
        </form>
      </div>

      {/* Bulk selection toolbar */}
      {!isReadOnly && selectedStopIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-4 items-center flex-wrap">
          <span className="text-sm font-semibold text-blue-800">
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
