# 2026-05-11 — R5 Enterprise UI/UX Rebuild — Complete

> Final consolidated changelog for the full R5 track.
> Per-surface detail lives in `docs/changelog/2026-05-10-r5-surface1-app-shell.md` through `2026-05-11-r5-surface6-control-center.md`.

## What changed

### Design system foundation (Surface 1 — 2026-05-10)
- Installed Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`) — CSS-first, no `tailwind.config.js`
- `cn()` utility at `src/lib/utils.ts`; `src/styles/tokens.css` with brand/status/surface/typography/spacing tokens
- `App.tsx` shell rewrite — fixed top nav, role-appropriate NavLinks with active state, mobile hamburger

### Shared UI primitives rebuilt (Surfaces 1–5)
- **OpsLayout** — `min-h-screen bg-gray-50` shell, `max-w-5xl mx-auto` column, back button, subtitle slot
- **OpsCard** — `bg-white border border-gray-200 rounded-lg shadow-sm p-6` base; `className` prop; deprecated `style`/`padding` props removed in Surface 5
- **OpsButton** — variant/size Tailwind class maps; `hover:` classes replace imperative handlers; `min-h-[44px]` md/lg, `min-h-[32px]` sm; disabled via `cn()`
- **OpsTable / OpsTableRow / OpsTableCell** — Tailwind throughout; deprecated `style` props removed in Surface 5
- **OpsBadge** — static variant color map; `rounded-full` pill
- **DataTable** (new, Surface 5) — sortable + paginated; client-side and server-side modes; `serverPagination` prop; loading row; configurable `emptyMessage`
- **ConfirmDialog** (new, Surface 5) — replaces `confirm()` for destructive actions; `variant="danger"/"warning"`; backdrop click cancels

### UL worker surfaces — mobile-first 375px (Surfaces 2–3)
- **UlLayout, RouteHeader, StopList, StopListItem, TodayRouteView** — zero inline styles; skeleton loading; semantic status badges (pending/in-progress/done/skipped); offline queue indicator; 44px touch targets
- **StopChecklist** — conditional `cn()` classes for checked state; `accent-green-600`; 44px rows
- **StopDetail** — full wizard rebuild: not-started map hero, read-only summary, wizard modals (safety + infra), spot check toggle, cleaning tasks card, trash volume segmented control, photo section, finish button with `cn()` guards; all 44px targets

### Lead routes surface — tablet-primary 768px (Surface 4)
- **LeadRoutesPanel, LeadRouteDetail, LeadCompletedRouteDetail** — all inline styles to Tailwind; `cn()` for row highlight
- **RouteSummary** — `StatBox` sub-component with `COLOR_CLASSES` map; warning banner; `cn()` finish button
- **RouteCreatePanel** — slide-over `fixed inset-0`; `w-[480px]` panel; `min-h-[44px]` inputs; preview table
- **Labor safety fix**: removed `UID:{user_id}` worker-identifying display from LeadRouteDetail; replaced with non-identifying "Date" stat

### Admin surfaces — desktop-primary 1280px (Surfaces 5–6)
- **AdminDashboard** — `StatCard` sub-component; responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`; `animate-pulse` skeleton; error OpsCard
- **AdminPoolsPanel** — `DataTable<Pool>` with sortable columns; `ConfirmDialog` replaces `confirm()` for pool disable
- **AdminStopsPanel** — `DataTable<any>` with `serverPagination`; render-prop columns as closures for inline edit (pool select, notes input, flag toggles, save button); bulk selection toolbar
- **AdminControlCenter** — `StatCard` sub-component (same pattern as Dashboard); responsive 4-column snapshot grid; Route Status OpsTable with `cn()` progress bar; Exceptions & Breaks section with indicators grid + skip-reason list; Asset Difficulty section with hotspot chips and `cn()` band badges; `grid grid-cols-1 lg:grid-cols-2 gap-8` for panels 3+4 (stacked on mobile, 2-col on desktop); `subtitle="Auto-refreshes every 60s"` R6 integration placeholder; `animate-pulse` loading skeleton; OpsCard error state

### Documented exceptions (three total, all carry forward)
1. `RouteHeader.tsx` — `style={{ width: \`${percentage}%\` }}` on progress bar fill; width is computed from server data at runtime
2. `StopDetail.tsx → ULRouteMap` — `style={{...}}` is a component-API prop configuring the map's own CSS layout, not a DOM inline style
3. `AdminControlCenter.tsx` — `style={{ width: \`${pct}%\` }}` on route progress bar fill; same pattern and rationale as exception 1

## Why
- R5 replaces the entire dev-grade inline-style presentation layer with an enterprise-standard design system
- Tailwind v4 chosen for CSS-first configuration (no tailwind.config.js) and Vite plugin compatibility
- shadcn/ui used as a copy-paste pattern library (DataTable, ConfirmDialog) without CLI dependency
- Every surface now has explicit loading, empty, and error states — no silent blank screens in production
- 44px touch targets throughout for UL field workers on mobile
- Labor safety guardrails enforced: no worker IDs, scores, or comparison elements on any surface

## Files touched (all surfaces combined)
- `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/vite.config.ts`, `frontend/src/index.css`
- `frontend/src/styles/tokens.css` (new)
- `frontend/src/lib/utils.ts` (new)
- `frontend/src/App.tsx`
- `frontend/src/components/today-route/UlLayout.tsx`
- `frontend/src/components/today-route/RouteHeader.tsx`
- `frontend/src/components/today-route/StopList.tsx`
- `frontend/src/components/today-route/StopListItem.tsx`
- `frontend/src/components/TodayRouteView.tsx`
- `frontend/src/components/today-route/StopChecklist.tsx`
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/components/ui/OpsLayout.tsx`
- `frontend/src/components/ui/OpsCard.tsx`
- `frontend/src/components/ui/OpsButton.tsx`
- `frontend/src/components/ui/OpsTable.tsx`
- `frontend/src/components/ui/OpsBadge.tsx`
- `frontend/src/components/ui/DataTable.tsx` (new)
- `frontend/src/components/ui/ConfirmDialog.tsx` (new)
- `frontend/src/components/LeadRoutesPanel.tsx`
- `frontend/src/components/LeadRouteDetail.tsx`
- `frontend/src/components/LeadCompletedRouteDetail.tsx`
- `frontend/src/components/RouteSummary.tsx`
- `frontend/src/components/RouteCreatePanel.tsx`
- `frontend/src/components/admin/AdminDashboard.tsx`
- `frontend/src/components/admin/AdminPoolsPanel.tsx`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
- `frontend/src/components/admin/AdminControlCenter.tsx`
