import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getStopsScoped, bulkUpdateAdminStops, updateAdminStop, fetchPools, type Pool } from "../../api/routeRuns";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsCard } from "../ui/OpsCard";
import { OpsTable, OpsTableRow, OpsTableCell } from "../ui/OpsTable";
import { OpsButton } from "../ui/OpsButton";

interface AdminStopsPanelProps {
  scope?: "admin" | "ops";
}

function normalizeText(v: any): string {
  const s = (v ?? "").toString().trim();
  return s && s !== "—" ? s : "";
}

function getStopField(stop: any, key: string) {
  // supports both camel and DB-style keys
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

  // Inline editing state
  const [rowEdits, setRowEdits] = useState<Record<string, { pool_id?: string; notes?: string }>>({});
  const [savingRow, setSavingRow] = useState<Record<string, boolean>>({});

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
    setSelectedStopIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkUpdate = async (patch: any) => {
    if (isReadOnly) return;
    if (selectedStopIds.length === 0) return;
    try {
      const token = await getAccessToken();
      await bulkUpdateAdminStops(token, {
        stop_ids: selectedStopIds,
        ...patch,
      });
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

    setSavingRow((m) => ({ ...m, [stopId]: true }));
    try {
      const token = await getAccessToken();
      await updateAdminStop(token, stopId, patch);
      setRowEdits((m) => {
        const copy = { ...m };
        delete copy[stopId];
        return copy;
      });
      await fetchStops();
    } catch (e: any) {
      alert(e?.message || "Failed to save stop");
    } finally {
      setSavingRow((m) => ({ ...m, [stopId]: false }));
    }
  };

  const handleToggle = async (stopId: string, field: string, currentValue: boolean) => {
    if (isReadOnly) return;
    try {
      const token = await getAccessToken();
      await updateAdminStop(token, stopId, { [field]: !currentValue });
      // Optimistic update or refetch
      fetchStops();
    } catch (e: any) {
      console.error(`Failed to toggle ${field}`, e);
      alert(`Failed to toggle ${field}`);
    }
  };

  const headers = ["Stop #", "Bearing", "Location", "Pool", "Notes", "Flags"];
  if (!isReadOnly) headers.unshift(""); // Checkbox column
  if (!isReadOnly) headers.push("Actions"); // Save button column

  return (
    <OpsLayout title="All Stops" subtitle="Search and filter stops.">
      {loading && <div style={{ color: "#718096", marginBottom: "1rem" }}>Loading stops...</div>}

      <OpsCard style={{ marginBottom: "1.5rem" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <input
              type="text"
              placeholder="Search stop number, street..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e0" }}
            />
          </div>
          <div>
            <select
              value={selectedPoolId}
              onChange={(e) => setSelectedPoolId(e.target.value)}
              style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e0" }}
            >
              <option value="">-- All Pools --</option>
              {pools.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <OpsButton type="submit" variant="secondary">
            Filter
          </OpsButton>
        </form>
      </OpsCard>

      {!isReadOnly && selectedStopIds.length > 0 && (
        <OpsCard
          style={{
            marginBottom: "1.5rem",
            backgroundColor: "#ebf8ff",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{selectedStopIds.length} stops selected</span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ is_hotspot: true })}>
              Set Hotspot
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ is_hotspot: false })}>
              Clear Hotspot
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ compactor: true })}>
              Set Compactor
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ compactor: false })}>
              Clear Compactor
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ has_trash: true })}>
              Set Has Trash
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => handleBulkUpdate({ has_trash: false })}>
              Clear Has Trash
            </OpsButton>
            <OpsButton size="sm" variant="outline" onClick={() => setSelectedStopIds([])}>
              Clear Selection
            </OpsButton>
          </div>
        </OpsCard>
      )}

      <OpsCard padding={0}>
        <OpsTable headers={headers}>
          {stops.map((stop, idx) => {
            const stopId = normalizeText(getStopField(stop, "stop_id"));
            const poolId = normalizeText(getStopField(stop, "pool_id") || getStopField(stop, "route_pool_id"));
            const bearing = normalizeText(getStopField(stop, "bearing_code")) || "—";
            const location = buildLocation(stop);

            const isSelected = stopId ? selectedStopIds.includes(stopId) : false;

            // Edit state
            const editState = rowEdits[stopId] || {};
            const currentPoolId = editState.pool_id !== undefined ? editState.pool_id : poolId;

            const existingNotes = normalizeText(getStopField(stop, "notes"));
            const currentNotes = editState.notes !== undefined ? editState.notes : existingNotes;

            const isSaving = savingRow[stopId];
            const hasChanges = editState.pool_id !== undefined || editState.notes !== undefined;

            return (
              <OpsTableRow
                key={`stop-row-${stopId || `idx-${idx}`}`}
              >
                {!isReadOnly && (
                  <OpsTableCell>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => stopId && toggleSelection(stopId)}
                    />
                  </OpsTableCell>
                )}
                <OpsTableCell style={{ fontWeight: 600 }}>{stopId || "—"}</OpsTableCell>
                <OpsTableCell>{bearing}</OpsTableCell>
                <OpsTableCell>{location}</OpsTableCell>

                {/* Pool Column */}
                <OpsTableCell>
                  {isReadOnly ? (
                    pools.find((p) => String(p.id) === poolId)?.name ?? (poolId || "—")
                  ) : (
                    <select
                      value={currentPoolId}
                      onChange={(e) => setRowEdits(prev => ({
                        ...prev,
                        [stopId]: { ...prev[stopId], pool_id: e.target.value }
                      }))}
                      style={{ maxWidth: "150px", padding: "0.25rem", borderRadius: "4px", border: "1px solid #e2e8f0" }}
                    >
                      <option value="">Unassigned</option>
                      {pools.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </OpsTableCell>

                {/* Notes Column */}
                <OpsTableCell>
                  {isReadOnly ? (
                    <span style={{ color: "#718096", fontSize: "0.875rem" }}>{existingNotes || "—"}</span>
                  ) : (
                    <input
                      type="text"
                      value={currentNotes}
                      onChange={(e) => setRowEdits(prev => ({
                        ...prev,
                        [stopId]: { ...prev[stopId], notes: e.target.value }
                      }))}
                      placeholder="Add notes..."
                      style={{ width: "100%", padding: "0.25rem", borderRadius: "4px", border: "1px solid #e2e8f0" }}
                    />
                  )}
                </OpsTableCell>

                {/* Flags Column */}
                <OpsTableCell>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {isReadOnly ? (
                      <>
                        {(stop?.is_hotspot ?? stop?.IS_HOTSPOT) && <span title="Hotspot">🔥</span>}
                        {(stop?.compactor ?? stop?.COMPACTOR) && <span title="Compactor">📦</span>}
                        {(stop?.has_trash ?? stop?.HAS_TRASH) && <span title="Has Trash">🗑️</span>}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleToggle(stopId, 'is_hotspot', !!(stop?.is_hotspot ?? stop?.IS_HOTSPOT))}
                          style={{
                            opacity: (stop?.is_hotspot ?? stop?.IS_HOTSPOT) ? 1 : 0.3,
                            border: "none", background: "none", cursor: "pointer", fontSize: "1.2rem"
                          }}
                          title="Toggle Hotspot"
                        >🔥</button>
                        <button
                          onClick={() => handleToggle(stopId, 'compactor', !!(stop?.compactor ?? stop?.COMPACTOR))}
                          style={{
                            opacity: (stop?.compactor ?? stop?.COMPACTOR) ? 1 : 0.3,
                            border: "none", background: "none", cursor: "pointer", fontSize: "1.2rem"
                          }}
                          title="Toggle Compactor"
                        >📦</button>
                        <button
                          onClick={() => handleToggle(stopId, 'has_trash', !!(stop?.has_trash ?? stop?.HAS_TRASH))}
                          style={{
                            opacity: (stop?.has_trash ?? stop?.HAS_TRASH) ? 1 : 0.3,
                            border: "none", background: "none", cursor: "pointer", fontSize: "1.2rem"
                          }}
                          title="Toggle Has Trash"
                        >🗑️</button>
                      </>
                    )}
                  </div>
                </OpsTableCell>

                {/* Actions Column */}
                {!isReadOnly && (
                  <OpsTableCell>
                    {hasChanges && (
                      <OpsButton
                        size="sm"
                        onClick={() => saveRow(stopId)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </OpsButton>
                    )}
                  </OpsTableCell>
                )}
              </OpsTableRow>
            );
          })}
        </OpsTable>

        <div
          style={{
            padding: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: "0.875rem", color: "#718096" }}>
            Showing {stops.length} of {total} stops
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <OpsButton size="sm" variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Prev
            </OpsButton>
            <span style={{ alignSelf: "center", padding: "0 0.5rem" }}>Page {page}</span>
            <OpsButton size="sm" variant="secondary" onClick={() => setPage((p) => p + 1)} disabled={stops.length < 20}>
              Next
            </OpsButton>
          </div>
        </div>
      </OpsCard>
    </OpsLayout>
  );
}
