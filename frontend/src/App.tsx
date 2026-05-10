import type { ComponentType, ReactNode } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { OpsButton } from "./components/ui/OpsButton";
import * as TodayRouteViewMod from "./components/TodayRouteView";
import * as LeadRoutesPanelMod from "./components/LeadRoutesPanel";
import * as LeadRouteDetailMod from "./components/LeadRouteDetail";
import * as AdminDashboardMod from "./components/admin/AdminDashboard";
import * as AdminPoolsPanelMod from "./components/admin/AdminPoolsPanel";
import * as AdminStopsPanelMod from "./components/admin/AdminStopsPanel";
import * as AdminControlCenterMod from "./components/admin/AdminControlCenter";
import * as LoginPageMod from "./auth/LoginPage";
import { OfflineSyncManager } from "./offline/OfflineSyncManager";
import { OfflineStatusBar } from "./components/ui/OfflineStatusBar";

function resolveComponent(mod: any, named: string): ComponentType<any> {
  return (mod?.[named] ?? mod?.default) as ComponentType<any>;
}

const TodayRouteView = resolveComponent(TodayRouteViewMod, "TodayRouteView");
const LeadRoutesPanel = resolveComponent(LeadRoutesPanelMod, "LeadRoutesPanel");
const LeadRouteDetailComp = resolveComponent(LeadRouteDetailMod, "LeadRouteDetail");
const AdminDashboard = resolveComponent(AdminDashboardMod, "AdminDashboard");
const AdminPoolsPanel = resolveComponent(AdminPoolsPanelMod, "AdminPoolsPanel");
const AdminStopsPanel = resolveComponent(AdminStopsPanelMod, "AdminStopsPanel");
const AdminControlCenter = resolveComponent(AdminControlCenterMod, "AdminControlCenter");
const LoginPage = resolveComponent(LoginPageMod, "LoginPage");

function DefaultRedirect() {
  const { me } = useAuth();
  const roles = me?.roles || [];
  if (roles.includes("Admin")) return <Navigate to="/admin/dashboard" replace />;
  if (roles.includes("Lead")) return <Navigate to="/routes" replace />;
  return <Navigate to="/work" replace />;
}

function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { me } = useAuth();
  const userRoles = me?.roles || [];
  const allowed = roles.some(r => userRoles.includes(r));
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LeadRouteDetailRoute() {
  const { routeRunId } = useParams<{ routeRunId: string }>();
  const navigate = useNavigate();
  return <LeadRouteDetailComp id={Number(routeRunId)} onBack={() => navigate("/routes")} />;
}

export default function App() {
  const { isSignedIn, signIn, signOut, me, isLoading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const roles = me?.roles || [];
  const isAdmin = roles.includes("Admin");
  const isLead = roles.includes("Lead");
  const isUL = roles.includes("UL");

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

          <div>
            <span style={{ marginRight: "1rem", fontSize: "0.9rem" }}>
              {me?.user?.name || me?.user?.preferred_username}
              {isAdmin && <span style={{ marginLeft: "0.5rem", background: "red", color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "0.7rem" }}>Operations</span>}
            </span>
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
        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem" }}>
            {(isUL || isLead) && (
              <button
                onClick={() => navigate("/work")}
                style={navButtonStyle(pathname === "/work")}
              >
                My Work
              </button>
            )}
            {isLead && (
              <button
                onClick={() => navigate("/routes")}
                style={navButtonStyle(pathname === "/routes" || pathname.startsWith("/routes/"))}
              >
                Routes
              </button>
            )}

            {/* Ops Tabs (Read-only for Lead) */}
            {isLead && !isAdmin && (
              <>
                <div style={{ width: "1px", background: "#cbd5e0", margin: "0 0.5rem" }}></div>
                <button
                  onClick={() => navigate("/ops/dashboard")}
                  style={navButtonStyle(pathname === "/ops/dashboard")}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate("/ops/pools")}
                  style={navButtonStyle(pathname === "/ops/pools")}
                >
                  Pools
                </button>
                <button
                  onClick={() => navigate("/ops/stops")}
                  style={navButtonStyle(pathname === "/ops/stops")}
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
                  onClick={() => navigate("/admin/dashboard")}
                  style={navButtonStyle(pathname === "/admin/dashboard")}
                >
                  Admin Dashboard
                </button>
                <button
                  onClick={() => navigate("/admin/pools")}
                  style={navButtonStyle(pathname === "/admin/pools")}
                >
                  Pools
                </button>
                <button
                  onClick={() => navigate("/admin/stops")}
                  style={navButtonStyle(pathname === "/admin/stops")}
                >
                  Stops
                </button>
                <button
                  onClick={() => navigate("/admin/control-center")}
                  style={navButtonStyle(pathname === "/admin/control-center")}
                >
                  Control Center
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <section>
          <Routes>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/work" element={
              <RequireRole roles={["UL", "Lead"]}><TodayRouteView /></RequireRole>
            } />
            <Route path="/routes" element={
              <RequireRole roles={["Lead", "Admin"]}><LeadRoutesPanel /></RequireRole>
            } />
            <Route path="/routes/:routeRunId" element={
              <RequireRole roles={["Lead", "Admin"]}><LeadRouteDetailRoute /></RequireRole>
            } />
            <Route path="/admin/dashboard" element={
              <RequireRole roles={["Admin"]}><AdminDashboard scope="admin" /></RequireRole>
            } />
            <Route path="/admin/pools" element={
              <RequireRole roles={["Admin"]}><AdminPoolsPanel scope="admin" /></RequireRole>
            } />
            <Route path="/admin/stops" element={
              <RequireRole roles={["Admin"]}><AdminStopsPanel scope="admin" /></RequireRole>
            } />
            <Route path="/admin/control-center" element={
              <RequireRole roles={["Admin"]}><AdminControlCenter /></RequireRole>
            } />
            <Route path="/ops/dashboard" element={
              <RequireRole roles={["Lead", "Admin"]}><AdminDashboard scope="ops" /></RequireRole>
            } />
            <Route path="/ops/pools" element={
              <RequireRole roles={["Lead", "Admin"]}><AdminPoolsPanel scope="ops" /></RequireRole>
            } />
            <Route path="/ops/stops" element={
              <RequireRole roles={["Lead", "Admin"]}><AdminStopsPanel scope="ops" /></RequireRole>
            } />
          </Routes>
        </section>
      </div>

      {/* Offline Sync Manager — provides OfflineSyncContext + headless replay engine */}
      <OfflineSyncManager>
        <OfflineStatusBar />
      </OfflineSyncManager>
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
