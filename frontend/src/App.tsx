import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";

import { TodayRouteView } from "./components/TodayRouteView";
import { LeadRoutesPanel } from "./components/LeadRoutesPanel";
import { AdminDashboard } from "./components/admin/AdminDashboard";
import { AdminPoolsPanel } from "./components/admin/AdminPoolsPanel";
import { AdminStopsPanel } from "./components/admin/AdminStopsPanel";

export default function App() {
  // ---- Auth/RBAC via context ----
  const { isSignedIn, signIn, signOut, me, refreshMe, isLoading } = useAuth();

  // ---- Day-0 health check state ----
  const [health, setHealth] = useState<string>("Loading…");

  // ---- View State ----
  const [activeView, setActiveView] = useState<"work" | "routes" | "admin_dash" | "admin_pools" | "admin_stops">("work");

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

  // ---- Role Logic ----
  const roles = me?.roles || [];
  const isAdmin = roles.includes("Admin");
  const isLead = roles.includes("Lead");
  const isUL = roles.includes("UL");

  // Determine default view on login
  useEffect(() => {
    if (isSignedIn && !isLoading) {
      if (isAdmin) setActiveView("admin_dash");
      else if (isLead) setActiveView("routes");
      else setActiveView("work");
    }
  }, [isSignedIn, isAdmin, isLead, isLoading]);

  if (isLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Loading identity...</h1>
      </div>
    );
  }


  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div className="app-brand">BASELINE</div>

        {/* Auth controls */}
        <div>
          {!isSignedIn ? (
            <button onClick={signIn}>Sign in with Microsoft</button>
          ) : (
            <>
              <span style={{ marginRight: "1rem", fontSize: "0.9rem" }}>
                {me?.user?.name || me?.user?.preferred_username}
                {isAdmin && <span style={{ marginLeft: "0.5rem", background: "red", color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "0.7rem" }}>Operations</span>}
              </span>
              <button onClick={refreshMe}>Refresh identity</button>
              <button onClick={signOut} style={{ marginLeft: 8 }}>
                Sign out
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Bar */}
      {isSignedIn && (
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem" }}>
            {/* Everyone (UL/Lead) sees "Work" (Today's Route) usually? 
                Actually, Admin doesn't need "Work". 
                Lead needs "Work" and "Routes".
                UL needs "Work".
             */}
            {(isUL || isLead) && (
              <button
                onClick={() => setActiveView("work")}
                style={navButtonStyle(activeView === "work")}
              >
                My Work
              </button>
            )}
            {isLead && (
              <button
                onClick={() => setActiveView("routes")}
                style={navButtonStyle(activeView === "routes")}
              >
                Routes
              </button>
            )}

            {/* Unified Ops / Admin Tabs */}
            {(isAdmin || isLead) && (
              <>
                <div style={{ width: "1px", background: "#cbd5e0", margin: "0 0.5rem" }}></div>
                <button
                  onClick={() => setActiveView("admin_dash")}
                  style={navButtonStyle(activeView === "admin_dash")}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setActiveView("admin_pools")}
                  style={navButtonStyle(activeView === "admin_pools")}
                >
                  Pools
                </button>
                <button
                  onClick={() => setActiveView("admin_stops")}
                  style={navButtonStyle(activeView === "admin_stops")}
                >
                  Stops
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isSignedIn && (
        <section>
          {/* Original content replaced by renderView */}
          {(() => {
            // View Switching
            const renderView = () => {
              if (activeView === "work") {
                // "Console" or "Ops" dashboard
                if (isAdmin) {
                  // Admin might default to dashboard if they clicked "Console" tab?
                  // Actually, let's keep "work" as the default UL view "Today's Route".
                  // But if they are purely admin, they might not have a route.
                  // Existing logic: "work" -> TodayRouteView (if UL/Lead).
                  return <TodayRouteView />;
                } else {
                  return <TodayRouteView />;
                }
              }
              if (activeView === "routes") return <LeadRoutesPanel />; // Lead "Routes" list (changed from LeadRouteView to LeadRoutesPanel to match existing import)

              // Unified Ops/Admin Views
              const adminMode = isAdmin ? "admin" : "ops";
              if (activeView === "admin_dash") return <AdminDashboard mode={adminMode} />;
              if (activeView === "admin_pools") return <AdminPoolsPanel mode={adminMode} />;
              if (activeView === "admin_stops") return <AdminStopsPanel mode={adminMode} />;

              return <div>Select a view</div>;
            };
            return renderView();
          })()}
        </section>
      )}

      {/* Debug Footer */}
      <div style={{ marginTop: "3rem", borderTop: "1px solid #eee", paddingTop: "1rem", color: "#aaa", fontSize: "0.8rem" }}>
        Backend Health: {health}
      </div>
    </div>
  );
}

function navButtonStyle(isActive: boolean) {
  return {
    padding: "0.5rem 1rem",
    background: isActive ? "#2b6cb0" : "transparent",
    color: isActive ? "white" : "#4a5568",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: isActive ? "bold" : "normal",
  };
}

