# 2026-05-10 — R3: Frontend Router

## What changed
- Installed `react-router-dom` v7 via pnpm
- Wrapped `<App />` in `<BrowserRouter>` in `main.tsx`
- Removed `useState activeView` and all `setActiveView` calls from `App.tsx`
- Removed both `useEffect` guards (role-based default view, security boot-out)
- Added `DefaultRedirect` component: redirects `/` to role-appropriate landing path
- Added `RequireRole` component: wraps protected routes, redirects unauthorized users to `/`
- Added `LeadRouteDetailRoute` wrapper: bridges `useParams` → `LeadRouteDetail` prop API without touching component internals
- Replaced nav button `onClick={() => setActiveView(...)}` with `useNavigate()`
- Replaced `activeView === "..."` active-state checks with `useLocation().pathname`
- Replaced `renderView()` IIFE with `<Routes>` + `<Route>` declarations covering all 11 paths in the R3 route map
- `OfflineSyncManager` remains mounted outside `<Routes>`, at app root

## Why
- No deeplinking, no browser back/forward, and no shareable URLs with the `useState` view-switch
- R5 (enterprise UI rebuild) cannot implement mobile nav patterns without a real router
- Adding new views previously required editing the state union, multiple `useEffect` guards, and `renderView()`

## Files touched
- `frontend/package.json` — added `react-router-dom`
- `frontend/pnpm-lock.yaml` — lockfile updated
- `frontend/src/main.tsx` — added BrowserRouter import and wrapper
- `frontend/src/App.tsx` — full shell refactor (router, nav, routes)
