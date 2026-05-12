# R3 — Frontend Router

> **Goal**: Replace `App.tsx`'s flat view-switch state machine with `react-router-dom` v6, enabling deeplinking, browser back/forward, and a scalable navigation foundation for the UI rebuild.
>
> **Status**: 🟢 Done — 2026-05-10. Changelog: `docs/changelog/2026-05-10-r3-frontend-router.md`
> **Depends on**: Nothing (unblocked)
> **Blocks**: R5 (Enterprise UI rebuild — must not redesign navigation on top of a state machine)

---

## Context

`App.tsx` manages navigation with a `useState` string union:
```typescript
const [activeView, setActiveView] = useState<"work" | "routes" | "admin_dash" | ...>("work")
```

Every navigation event is a `setActiveView()` call. Every view guard is a `useEffect` on `activeView`. Consequences:
- No deeplinking — you can't share a URL to a specific stop or route
- No browser back/forward — pressing back navigates away from the app entirely
- No per-stop or per-route direct navigation — every route detail requires state passed through the tree
- Adding a new view requires editing the state union, multiple `useEffect` guards, and `renderView()`
- The UI rebuild (R5) cannot properly implement mobile nav patterns without a real router

This is a structural refactor of the shell only. Zero component logic changes.

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/package.json` | Add `react-router-dom` dependency |
| `frontend/src/main.tsx` | Wrap app in `<BrowserRouter>` |
| `frontend/src/App.tsx` | Replace `useState` view-switch with `<Routes>` + `<Route>` declarations; replace `setActiveView()` calls with `useNavigate()` |
| `frontend/src/components/today-route/StopDetail.tsx` | If stop ID is passed via URL param (`:stopId`), read from `useParams` |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All backend files | Frontend-only change |
| All auth files | Auth is frozen |
| All offline queue files | Offline contract is frozen |
| All component internal logic | No component logic changes — only how they're rendered changes |

---

## Route Map

Define these URL paths:

| Path | Component | Role guard |
|------|-----------|------------|
| `/` | Redirect to role default | — |
| `/work` | `TodayRouteView` | UL, Lead |
| `/work/stop/:stopId` | `StopDetail` | UL, Lead |
| `/routes` | `LeadRoutesPanel` | Lead, Admin |
| `/routes/:routeRunId` | `LeadRouteDetail` | Lead, Admin |
| `/admin/dashboard` | `AdminDashboard scope="admin"` | Admin |
| `/admin/pools` | `AdminPoolsPanel scope="admin"` | Admin |
| `/admin/stops` | `AdminStopsPanel scope="admin"` | Admin |
| `/admin/control-center` | `AdminControlCenter` | Admin |
| `/ops/dashboard` | `AdminDashboard scope="ops"` | Lead, Admin |
| `/ops/pools` | `AdminPoolsPanel scope="ops"` | Lead, Admin |
| `/ops/stops` | `AdminStopsPanel scope="ops"` | Lead, Admin |

---

## Change 1 — Install react-router-dom

```bash
cd frontend && npm install react-router-dom
```

---

## Change 2 — Wrap in BrowserRouter

### `frontend/src/main.tsx`

```tsx
import { BrowserRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

---

## Change 3 — Replace View-Switch in App.tsx

### Before (pattern)

```tsx
const [activeView, setActiveView] = useState<"work" | "routes" | ...>("work")

useEffect(() => {
  if (isAdmin) setActiveView("admin_dash")
  else if (isLead) setActiveView("routes")
  else setActiveView("work")
}, [isSignedIn, ...])

// nav buttons
<button onClick={() => setActiveView("work")}>My Work</button>

// renderView
if (activeView === "work") return <TodayRouteView />
if (activeView === "routes") return <LeadRoutesPanel />
// etc.
```

### After (pattern)

```tsx
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'

// Role-based default redirect
function DefaultRedirect() {
  const { me } = useAuth()
  const roles = me?.roles || []
  if (roles.includes('Admin')) return <Navigate to="/admin/dashboard" replace />
  if (roles.includes('Lead')) return <Navigate to="/routes" replace />
  return <Navigate to="/work" replace />
}

// Protected route wrapper
function RequireRole({ roles, children }: { roles: string[], children: ReactNode }) {
  const { me } = useAuth()
  const userRoles = me?.roles || []
  const allowed = roles.some(r => userRoles.includes(r))
  if (!allowed) return <Navigate to="/" replace />
  return <>{children}</>
}

// In App return:
<Routes>
  <Route path="/" element={<DefaultRedirect />} />
  <Route path="/work" element={
    <RequireRole roles={['UL', 'Lead']}><TodayRouteView /></RequireRole>
  } />
  <Route path="/routes" element={
    <RequireRole roles={['Lead', 'Admin']}><LeadRoutesPanel /></RequireRole>
  } />
  <Route path="/admin/dashboard" element={
    <RequireRole roles={['Admin']}><AdminDashboard scope="admin" /></RequireRole>
  } />
  <Route path="/admin/pools" element={
    <RequireRole roles={['Admin']}><AdminPoolsPanel scope="admin" /></RequireRole>
  } />
  <Route path="/admin/stops" element={
    <RequireRole roles={['Admin']}><AdminStopsPanel scope="admin" /></RequireRole>
  } />
  <Route path="/admin/control-center" element={
    <RequireRole roles={['Admin']}><AdminControlCenter /></RequireRole>
  } />
  <Route path="/ops/dashboard" element={
    <RequireRole roles={['Lead', 'Admin']}><AdminDashboard scope="ops" /></RequireRole>
  } />
  <Route path="/ops/pools" element={
    <RequireRole roles={['Lead', 'Admin']}><AdminPoolsPanel scope="ops" /></RequireRole>
  } />
  <Route path="/ops/stops" element={
    <RequireRole roles={['Lead', 'Admin']}><AdminStopsPanel scope="ops" /></RequireRole>
  } />
</Routes>
```

Nav buttons use `useNavigate`:
```tsx
const navigate = useNavigate()
<button onClick={() => navigate('/work')}>My Work</button>
```

Active state uses `useLocation`:
```tsx
const { pathname } = useLocation()
style={navButtonStyle(pathname === '/work')}
```

---

## R3 Overall Done Definition

R3 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `react-router-dom` installed and app wrapped in `<BrowserRouter>`
- [ ] All views reachable via their URL paths
- [ ] Browser back/forward navigates correctly between views
- [ ] Role guards work — Admin cannot reach `/work`, UL cannot reach `/admin/*`
- [ ] Default redirect sends each role to their correct landing view
- [ ] `useState activeView` and all `setActiveView` calls removed from `App.tsx`
- [ ] `OfflineSyncManager` still mounts correctly (not inside Routes — stays at app root)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r3-frontend-router.md`

---

## Agent Launch Block

```
Refactor task. Read CLAUDE.md, then planning/REFINEMENT_R3_FRONTEND_ROUTER.md.
Install react-router-dom in frontend/. Wrap the app in BrowserRouter in main.tsx.
Replace App.tsx's useState view-switch with React Router Routes/Route declarations
using the route map in the file. Replace setActiveView() calls with useNavigate().
Replace activeView equality checks in nav buttons with useLocation().pathname.
Add a RequireRole wrapper component and a DefaultRedirect component.
Do not change any component internal logic — only how they are rendered and navigated to.
OfflineSyncManager must remain mounted outside of Routes.
```
