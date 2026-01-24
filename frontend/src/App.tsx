import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import type { ComponentType } from "react";
import { OpsButton } from "./components/ui/OpsButton";
import * as TodayRouteViewMod from "./components/TodayRouteView";
import * as LeadRoutesPanelMod from "./components/LeadRoutesPanel";
import * as AdminDashboardMod from "./components/admin/AdminDashboard";
import * as AdminPoolsPanelMod from "./components/admin/AdminPoolsPanel";
import * as AdminStopsPanelMod from "./components/admin/AdminStopsPanel";
import * as LoginPageMod from "./auth/LoginPage";
import { OfflineSyncManager } from "./offline/OfflineSyncManager";

function resolveComponent(mod: any, named: string): ComponentType<any> {
  return (mod?.[named] ?? mod?.default) as ComponentType<any>;
}

const TodayRouteView = resolveComponent(TodayRouteViewMod, "TodayRouteView");
const LeadRoutesPanel = resolveComponent(LeadRoutesPanelMod, "LeadRoutesPanel");
const AdminDashboard = resolveComponent(AdminDashboardMod, "AdminDashboard");
const AdminPoolsPanel = resolveComponent(AdminPoolsPanelMod, "AdminPoolsPanel");
const AdminStopsPanel = resolveComponent(AdminStopsPanelMod, "AdminStopsPanel");
const LoginPage = resolveComponent(LoginPageMod, "LoginPage");

export default function App() {
  // ---- Auth/RBAC via context ----
  const { isSignedIn, signIn, signOut, me, isLoading } = useAuth();

  // ---- View State ----
  const [activeView, setActiveView] = useState<"work" | "routes" | "admin_dash" | "admin_pools" | "admin_stops" | "ops_dash" | "ops_pools" | "ops_stops">("work");

  // ---- Role Logic ----
  const roles = me?.roles || [];
  const isAdmin = roles.includes("Admin");
  const isLead = roles.includes("Lead");
  const isUL = roles.includes("UL");

  // Determine default view on login
  useEffect(() => {
    if (isSignedIn && !isLoading) {
      if (isAdmin) setActiveView("admin_dash");
      // Lead defaults to routes, or ops_dash if they prefer, but per requirements: "Lead -> routes"
      else if (isLead) setActiveView("routes");
      else setActiveView("work");
    }
  }, [isSignedIn, isAdmin, isLead, isLoading]);

  // ---- Security Guard ----
  useEffect(() => {
    if (!isSignedIn || isLoading) return;

    const isAdminView = activeView.startsWith("admin_");
    const isOpsView = activeView.startsWith("ops_");

    if (isAdminView && !isAdmin) {
      // Boot them out
      if (isLead) setActiveView("routes");
      else setActiveView("work");
    }

    if (isOpsView && !(isLead || isAdmin)) {
      // Boot them out
      setActiveView("work");
    }
  }, [activeView, isAdmin, isLead, isSignedIn, isLoading]);

  if (isLoading) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Loading identity...</h1>
      </div>
    );
  }

  if (!isSignedIn) {
    return <LoginPage onSignIn={signIn} />;
  }


  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem 2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div className="app-brand">BASELINE</div>

          {/* Auth controls */}
          <div>
            <span style={{ marginRight: "1rem", fontSize: "0.9rem" }}>
              {me?.user?.name || me?.user?.preferred_username}
              {isAdmin && <span style={{ marginLeft: "0.5rem", background: "red", color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "0.7rem" }}>Operations</span>}
            </span>
            {/* <OpsButton variant="secondary" size="sm" onClick={refreshMe}>Refresh identity</OpsButton> */}
            <OpsButton
              variant="danger"
              size="sm"
              onClick={signOut}
              style={{ marginLeft: 8 }}
            >
              Sign out
            </OpsButton>
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

              {/* Ops Tabs (Read-only for Lead) */}
              {isLead && !isAdmin && (
                <>
                  <div style={{ width: "1px", background: "#cbd5e0", margin: "0 0.5rem" }}></div>
                  <button
                    onClick={() => setActiveView("ops_dash")}
                    style={navButtonStyle(activeView === "ops_dash")}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => setActiveView("ops_pools")}
                    style={navButtonStyle(activeView === "ops_pools")}
                  >
                    Pools
                  </button>
                  <button
                    onClick={() => setActiveView("ops_stops")}
                    style={navButtonStyle(activeView === "ops_stops")}
                  >
                    Stops
                  </button>
                </>
              )}

              {/* Admin Tabs (Write access) */}
              {isAdmin && (
                <>
                  <div style={{ width: "1px", background: "#cbd5e0", margin: "0 0.5rem" }}></div>
                  <button
                    onClick={() => setActiveView("admin_dash")}
                    style={navButtonStyle(activeView === "admin_dash")}
                  >
                    Admin Dashboard
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

                // Shared Components with Scope
                if (activeView === "ops_dash") return <AdminDashboard scope="ops" />;
                if (activeView === "ops_pools") return <AdminPoolsPanel scope="ops" />;
                if (activeView === "ops_stops") return <AdminStopsPanel scope="ops" />;

                if (activeView === "admin_dash") return <AdminDashboard scope="admin" />;
                if (activeView === "admin_pools") return <AdminPoolsPanel scope="admin" />;
                if (activeView === "admin_stops") return <AdminStopsPanel scope="admin" />;

                return <div>Select a view</div>;
              };
              return renderView();
            })()}
          </section>
        )}

        {/* Debug Footer 
            <div style={{ marginTop: "3rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem", color: "#a0aec0", fontSize: "0.75rem", textAlign: "center" }}>
              Backend Health: {health}
            </div>*/}
      </div>

      {/* Offline Sync Manager */}
      {isSignedIn && <OfflineSyncManager />}
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
