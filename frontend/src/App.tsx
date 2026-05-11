import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
    isActive
      ? "bg-blue-700 text-white"
      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 text-base font-medium rounded-md transition-colors ${
    isActive
      ? "bg-blue-700 text-white"
      : "text-gray-700 hover:text-gray-900 hover:bg-gray-100"
  }`;

export default function App() {
  const { isSignedIn, signIn, signOut, me, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const roles = me?.roles || [];
  const isAdmin = roles.includes("Admin");
  const isLead = roles.includes("Lead");
  const isUL = roles.includes("UL");

  const userName = me?.user?.name || me?.user?.preferred_username || "";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading identity…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <LoginPage onSignIn={signIn} />;
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* Fixed top navigation bar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

          {/* Left: wordmark + desktop nav */}
          <div className="flex items-center gap-6 min-w-0">
            <span className="font-semibold tracking-widest text-gray-800 text-sm uppercase shrink-0">
              BASELINE
            </span>

            {/* Desktop navigation links */}
            <div className="hidden md:flex items-center gap-1">
              {(isUL || isLead) && (
                <NavLink to="/work" end className={navLinkClass}>My Work</NavLink>
              )}
              {isLead && (
                <NavLink to="/routes" className={navLinkClass}>Routes</NavLink>
              )}
              {isLead && !isAdmin && (
                <>
                  <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" aria-hidden />
                  <NavLink to="/ops/dashboard" end className={navLinkClass}>Dashboard</NavLink>
                  <NavLink to="/ops/pools" end className={navLinkClass}>Pools</NavLink>
                  <NavLink to="/ops/stops" end className={navLinkClass}>Stops</NavLink>
                </>
              )}
              {isAdmin && (
                <>
                  <NavLink to="/admin/dashboard" end className={navLinkClass}>Dashboard</NavLink>
                  <NavLink to="/admin/pools" end className={navLinkClass}>Pools</NavLink>
                  <NavLink to="/admin/stops" end className={navLinkClass}>Stops</NavLink>
                  <NavLink to="/admin/control-center" end className={navLinkClass}>Control Center</NavLink>
                </>
              )}
            </div>
          </div>

          {/* Right: user identity + sign out + mobile toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-gray-600 max-w-[180px] truncate">{userName}</span>
              {isAdmin && (
                <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
                  Operations
                </span>
              )}
              {isLead && !isAdmin && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                  Lead
                </span>
              )}
            </div>
            <button
              onClick={signOut}
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>

            {/* Mobile hamburger toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{userName}</p>
              <div className="flex items-center gap-2 mt-1">
                {isAdmin && (
                  <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-medium rounded">
                    Operations
                  </span>
                )}
                {isLead && !isAdmin && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                    Lead
                  </span>
                )}
              </div>
            </div>
            <div className="px-3 py-3 flex flex-col gap-1">
              {(isUL || isLead) && (
                <NavLink to="/work" end className={mobileNavLinkClass} onClick={closeMenu}>
                  My Work
                </NavLink>
              )}
              {isLead && (
                <NavLink to="/routes" className={mobileNavLinkClass} onClick={closeMenu}>
                  Routes
                </NavLink>
              )}
              {isLead && !isAdmin && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <NavLink to="/ops/dashboard" end className={mobileNavLinkClass} onClick={closeMenu}>Dashboard</NavLink>
                  <NavLink to="/ops/pools" end className={mobileNavLinkClass} onClick={closeMenu}>Pools</NavLink>
                  <NavLink to="/ops/stops" end className={mobileNavLinkClass} onClick={closeMenu}>Stops</NavLink>
                </>
              )}
              {isAdmin && (
                <>
                  <NavLink to="/admin/dashboard" end className={mobileNavLinkClass} onClick={closeMenu}>Dashboard</NavLink>
                  <NavLink to="/admin/pools" end className={mobileNavLinkClass} onClick={closeMenu}>Pools</NavLink>
                  <NavLink to="/admin/stops" end className={mobileNavLinkClass} onClick={closeMenu}>Stops</NavLink>
                  <NavLink to="/admin/control-center" end className={mobileNavLinkClass} onClick={closeMenu}>Control Center</NavLink>
                </>
              )}
              <div className="mt-2 pt-2 border-t border-gray-100">
                <button
                  onClick={signOut}
                  className="w-full text-left px-3 py-2 text-base font-medium text-red-600 rounded-md hover:bg-red-50 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main content — offset by fixed nav height */}
      <div className="pt-16 min-h-screen bg-gray-50">
        <main className="max-w-screen-xl mx-auto px-4 py-6">
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
        </main>
      </div>

      {/* Offline Sync Manager — headless replay engine + status UI */}
      <OfflineSyncManager>
        <OfflineStatusBar />
      </OfflineSyncManager>
    </>
  );
}
