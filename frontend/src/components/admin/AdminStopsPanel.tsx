import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getOpsStops } from "../../api/routeRuns";

export type AdminStopsPanelProps = { mode: "admin" | "ops" };

const AdminStopsPanel = ({ mode }: AdminStopsPanelProps) => {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  async function load(p = page) {
    setLoading(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      const d = await getOpsStops(token, { page: p, pageSize });
      const list = Array.isArray(d) ? d : d.items || [];
      setRows(list);
      if (typeof d.total === "number") setTotal(d.total);
    } catch (e: any) {
      setErr(e?.message || "Failed to load stops.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={container}>
      <div style={topRow}>
        <div>
          <div style={h1}>Stops</div>
          <div style={subtle}>{mode === "admin" ? "Stop registry" : "Stop view"}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              load(next);
            }}
            style={btn}
            disabled={page <= 1 || loading}
          >
            Prev
          </button>
          <div style={subtle}>
            Page {page}{total != null ? ` • Total ${total}` : ""}
          </div>
          <button
            onClick={() => {
              const next = page + 1;
              setPage(next);
              load(next);
            }}
            style={btn}
            disabled={loading}
          >
            Next
          </button>
          <button onClick={() => load(page)} style={btn} disabled={loading}>Refresh</button>
        </div>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={subtle}>Loading…</div>}

      {!loading && (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>STOP_ID</th>
                  <th style={th}>Pool</th>
                  <th style={th}>Lon</th>
                  <th style={th}>Lat</th>
                  <th style={th}>Street</th>
                  <th style={th}>Bearing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={String(r?.STOP_ID ?? r?.stop_id ?? i)}>
                    <td style={td}>{r?.STOP_ID ?? r?.stop_id ?? "—"}</td>
                    <td style={td}>{r?.pool_id ?? "—"}</td>
                    <td style={td}>{r?.lon ?? "—"}</td>
                    <td style={td}>{r?.lat ?? "—"}</td>
                    <td style={td}>{r?.ON_STREET_NAME ?? r?.on_street_name ?? "—"}</td>
                    <td style={td}>{r?.BEARING_CODE ?? r?.bearing_code ?? "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td style={td} colSpan={6}>No stops found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export { AdminStopsPanel };
export default AdminStopsPanel;

const container: CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const topRow: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const h1: CSSProperties = { fontSize: 18, fontWeight: 1000, color: "#111827" };
const subtle: CSSProperties = { fontSize: 12, color: "#6b7280" };

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const btn: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const errBox: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 13,
};

const table: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: CSSProperties = { textAlign: "left", fontSize: 12, color: "#6b7280", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" };
const td: CSSProperties = { padding: "10px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#111827" };
