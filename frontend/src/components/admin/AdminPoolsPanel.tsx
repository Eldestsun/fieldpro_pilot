import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getOpsPools } from "../../api/routeRuns";

export function AdminPoolsPanel({ mode }: { mode: "admin" | "ops" }) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      const d = await getOpsPools(token);
      setRows(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load pools.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={page}>
      <div style={topRow}>
        <div>
          <div style={h1}>Pools</div>
          <div style={subtle}>{mode === "admin" ? "Manage route pools" : "View route pools"}</div>
        </div>
        <button onClick={load} style={btn}>Refresh</button>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={subtle}>Loading…</div>}

      {!loading && (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>Name</th>
                  <th style={th}>Base</th>
                  <th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={String(r?.id ?? i)} style={tr}>
                    <td style={td}>{r?.id ?? "—"}</td>
                    <td style={td}>{r?.name ?? r?.display_name ?? "—"}</td>
                    <td style={td}>{r?.base_id ?? r?.base ?? "—"}</td>
                    <td style={td}>{r?.notes ?? ""}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td style={td} colSpan={4}>No pools found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const topRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };
const h1: React.CSSProperties = { fontSize: 18, fontWeight: 1000, color: "#111827" };
const subtle: React.CSSProperties = { fontSize: 12, color: "#6b7280" };

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const btn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const errBox: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 13,
};

const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", fontSize: 12, color: "#6b7280", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" };
const td: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#111827" };
const tr: React.CSSProperties = {};
