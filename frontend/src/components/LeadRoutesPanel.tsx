import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchLeadTodaysRuns, getLeadRouteRunById } from "../api/routeRuns";

export function LeadRoutesPanel() {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [runs, setRuns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      const data = await fetchLeadTodaysRuns(token);
      setRuns(data);
      if (data.length && selectedId == null) {
        const id = data[0]?.id ?? 1;
        setSelectedId(id);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load lead runs.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: any) {
    if (id == null) return;
    try {
      setSelected(null);
      const token = await getAccessToken();
      const d = await getLeadRouteRunById(token, Number(id));
      setSelected(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load route detail.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId != null) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
      <div style={cardStyle}>
        <div style={headerRow}>
          <div>
            <div style={titleStyle}>Routes</div>
            <div style={subtle}>Today’s runs</div>
          </div>
          <button onClick={load} style={btnStyle}>Refresh</button>
        </div>

        {loading && <div style={subtle}>Loading…</div>}
        {err && <div style={errStyle}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {runs.map((r, idx) => {
            const id = r?.route_run_id ?? r?.id ?? r?.routeRunId ?? idx;
            const label =
              r?.name ||
              r?.pool_name ||
              r?.route_pool_id ||
              r?.pool_id ||
              `Route Run ${id}`;
            const meta =
              r?.status ||
              r?.run_date ||
              r?.created_at ||
              "";

            const active = String(id) === String(selectedId);

            return (
              <button
                key={String(id)}
                onClick={() => setSelectedId(id)}
                style={{
                  ...listItemBtn,
                  borderColor: active ? "#111827" : "#e5e7eb",
                  background: active ? "#f9fafb" : "#fff",
                }}
              >
                <div style={{ fontWeight: 700, color: "#111827" }}>{label}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {meta}
                </div>
              </button>
            );
          })}

          {!loading && runs.length === 0 && (
            <div style={subtle}>No runs found.</div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={headerRow}>
          <div>
            <div style={titleStyle}>Route Detail</div>
            <div style={subtle}>
              {selectedId != null ? `Run ID: ${selectedId}` : "Select a run"}
            </div>
          </div>
        </div>

        {!selected && selectedId != null && <div style={subtle}>Loading detail…</div>}
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Stat label="Distance (m)" value={selected?.distance_m ?? selected?.route_run?.distance_m ?? "—"} />
              <Stat label="Duration (s)" value={selected?.duration_s ?? selected?.route_run?.duration_s ?? "—"} />
              <Stat label="Stops" value={(selected?.stops?.length ?? selected?.ordered_stops?.length) ?? "—"} />
            </div>

            <div style={{ borderTop: "1px solid #eee", paddingTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Stops</div>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Stop</th>
                      <th style={thStyle}>On Street</th>
                      <th style={thStyle}>Bearing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected?.ordered_stops || selected?.stops || []).map((s: any, i: number) => (
                      <tr key={String(s?.stop_id ?? s?.STOP_ID ?? i)} style={trStyle}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={tdStyle}>{s?.stop_id ?? s?.STOP_ID ?? "—"}</td>
                        <td style={tdStyle}>{s?.on_street_name ?? s?.ON_STREET_NAME ?? "—"}</td>
                        <td style={tdStyle}>{s?.bearing_code ?? s?.BEARING_CODE ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {selectedId == null && <div style={subtle}>Select a run from the left.</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginTop: 4 }}>{String(value)}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 900, color: "#111827" };
const subtle: React.CSSProperties = { fontSize: 12, color: "#6b7280" };

const btnStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const listItemBtn: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};

const errStyle: React.CSSProperties = {
  marginBottom: 10,
  padding: "10px 12px",
  borderRadius: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 13,
};

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#6b7280", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" };
const tdStyle: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#111827" };
const trStyle: React.CSSProperties = { background: "transparent" };
