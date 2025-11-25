// frontend/src/App.tsx
import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import RequireRole from "./auth/RequireRole";
import { UlTodayRoute } from "./UlTodayRoute";

export default function App() {
  // ---- Auth/RBAC via context ----
  const { isSignedIn, signIn, signOut, me, refreshMe, getAccessToken } = useAuth();

  // ---- Day-0 health check state ----
  const [health, setHealth] = useState<string>("Loading…");

  // ---- Admin test state ----
  const [adminResp, setAdminResp] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // ---- Day-0: verify proxy → backend works ----
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/health");
        if (!r.ok) {
          setHealth(`HTTP ${r.status}`);
          return;
        }
        const text = await r.text();
        try {
          setHealth(JSON.stringify(JSON.parse(text)));
        } catch {
          setHealth(text || "(empty body)");
        }
      } catch (e: any) {
        setHealth("Error: " + String(e));
      }
    })();
  }, []);

  // Optional: direct call bypassing proxy (debug helper)
  const tryDirect = async () => {
    try {
      const r = await fetch("http://localhost:4000/api/health");
      setHealth(JSON.stringify(await r.json()));
    } catch (e: any) {
      setHealth("Direct error: " + String(e));
    }
  };

  // Admin-only API call
  const callAdmin = async () => {
    try {
      setError(null);
      const t = await getAccessToken();
      const r = await fetch("/api/admin/secret", {
        headers: { Authorization: `Bearer ${t}` },
      });
      const body = await r.text();
      setAdminResp(`${r.status}: ${body}`);
    } catch (e: any) {
      setAdminResp("Error: " + String(e));
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>FieldPro Pilot</h1>

      {/* Auth controls */}
      <div style={{ marginBottom: 12 }}>
        {!isSignedIn ? (
          <button onClick={signIn}>Sign in with Microsoft</button>
        ) : (
          <>
            <button onClick={refreshMe}>Refresh identity</button>
            <button onClick={signOut} style={{ marginLeft: 8 }}>
              Sign out
            </button>
          </>
        )}
      </div>

      {/* Status / errors */}
      {error && (
        <div style={{ color: "crimson", marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Health check (Day-0) */}
      <section>
        <h3>Backend health</h3>
        <pre>{health}</pre>
        <button onClick={tryDirect} style={{ padding: 6, marginTop: 6 }}>
          Try direct (4000)
        </button>
      </section>

      {/* Identity from backend (Day-1) */}
      <section style={{ marginTop: 16 }}>
        <h3>Identity (/api/secure/ping)</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {me ? JSON.stringify(me, null, 2) : "No identity loaded yet."}
        </pre>
      </section>

      {/* Admin-only test */}
      <section style={{ marginTop: 16 }}>
        <h3>Admin test</h3>
        <RequireRole anyOf={["Admin"]}>
          <button onClick={callAdmin}>Call /api/admin/secret</button>
        </RequireRole>
        <pre>{adminResp}</pre>
      </section>

      {/* UL Today's Route */}
      <section style={{ marginTop: 16 }}>
        <RequireRole anyOf={["UL", "Admin"]}>
          <UlTodayRoute />
        </RequireRole>
      </section>
    </div>
  );
}
