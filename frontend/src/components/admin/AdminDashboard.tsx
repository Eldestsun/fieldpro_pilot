import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { getOpsDashboard } from "../../api/routeRuns";

export function AdminDashboard({ mode }: { mode: "admin" | "ops" }) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      const d = await getOpsDashboard(token);
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = [
    { label: "Pools", value: data?.pools_count ?? data?.pools ?? "—" },
    { label: "Stops", value: data?.stops_count ?? data?.stops ?? "—" },
    { label: "Route Runs (today)", value: data?.todays_runs_count ?? data?.todays_runs ?? "—" },
    { label: "Last refresh", value: data?.as_of ?? data?.ts ?? "—" },
  ];

  return (
    <div style={page}>
      <div style={topRow}>
        <div>
          <div style={h1}>Dashboard</div>
          <div style={subtle}>{mode === "admin" ? "Operations view" : "Lead/ops view"}</div>
        </div>
        <button onClick={load} style={btn}>Refresh</button>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={subtle}>Loading…</div>}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12 }}>
          {metrics.map((m) => (
            <div key={m.label} style={card}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#111827", marginTop: 6 }}>
                {String(m.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && data && (
        <div style={{ marginTop: 16, ...card }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Raw payload (for now)</div>
          <pre style={{ margin: 0, fontSize: 12, color: "#111827", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
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
