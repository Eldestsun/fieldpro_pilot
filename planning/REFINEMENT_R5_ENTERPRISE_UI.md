# R5 — Enterprise UI/UX Rebuild

> **Goal**: Replace the dev-grade inline-style UI with an enterprise-standard design system — mobile-first for UL workers, responsive for Leads and Admins — with consistent components, states, and interaction patterns across the full application.
>
> **Status**: 🟡 In progress
> **Depends on**: R3 done (router must be in place — UI rebuild defines navigation structure)
> **Blocks**: R9 (Frontend Tests — test the stable UI, not the one being rebuilt)

---

## Scope

This is the largest single item in the refinement track. It touches every component surface. It is not a "polish pass" — it is a structural replacement of the styling and interaction layer.

The component logic (data fetching, state management, API calls) is **not changed**. The rebuild is the presentation layer only: layout, styling, component composition, loading states, error states, empty states.

Execute this as a series of focused agent sessions, one surface at a time, in the order below.

---

## Design Principles

Before any agent session starts, these principles govern every decision:

1. **Mobile-first for UL workers** — the stop wizard and route view are primary use cases on a 375px phone screen. Everything else scales up.
2. **Density for Leads** — Lead's route list and route detail need to show a lot of data on a tablet without scrolling.
3. **Clarity for Admins** — Admin views are desktop-primary. Data tables, not cards.
4. **No inline styles** — all styling via CSS modules or a utility class system (see Component Library below).
5. **Every interactive state is explicit** — loading, empty, error, disabled. No missing states.
6. **Labor safety by design** — no worker-identifying UI elements, no comparison surfaces.

---

## Component Library Choice

Use **shadcn/ui** (copy-paste component library built on Radix UI + Tailwind CSS).

Rationale:
- Components are owned (copied into `src/components/ui/`) — no dependency lock-in
- Radix UI handles accessibility (keyboard nav, ARIA, focus management) correctly
- Tailwind utility classes replace inline styles without a large runtime
- Works with the existing Vite + React setup without ejecting

### ✅ Already installed (Surface 1 — 2026-05-10)

```bash
pnpm add tailwindcss @tailwindcss/vite clsx tailwind-merge
```

- `tailwindcss` v4, `@tailwindcss/vite` plugin wired in `vite.config.ts`
- `@import "tailwindcss"` + `@import "./styles/tokens.css"` at top of `src/index.css`
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge) ready to import
- `src/styles/tokens.css` — design tokens live (see section below)

### ⚠️ shadcn CLI not run — use manual extraction

`npx shadcn@latest init` targets Tailwind v3 by default and will emit broken CSS for a v4 project. Do **not** run it.

Instead, copy individual component source from [ui.shadcn.com](https://ui.shadcn.com) into `src/components/ui/` manually and convert any `@apply` or `tailwind.config.js` theme references to plain Tailwind v4 utility classes. The `cn()` utility is the only shadcn infrastructure dependency — it is already wired.

---

## Design Tokens

✅ Live at `frontend/src/styles/tokens.css` — imported globally via `index.css`. Do not redefine; extend by adding to this file.

Reference:

```css
:root {
  /* Brand */
  --color-brand: #1a56db;
  --color-brand-dark: #1e429f;

  /* Status */
  --color-success: #057a55;
  --color-warning: #c27803;
  --color-danger: #e02424;
  --color-neutral: #6b7280;

  /* Surface */
  --color-surface: #ffffff;
  --color-surface-secondary: #f9fafb;
  --color-border: #e5e7eb;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
}
```

---

## Surface-by-Surface Rebuild Order

Execute as separate agent sessions. Each session takes one surface, leaves others unchanged.

---

### Surface 1 — App Shell + Navigation ✅ 2026-05-10

**Files**: `App.tsx`, `App.css`

Replace the inline-style nav bar with a proper shell layout:
- Fixed top nav bar with BASELINE wordmark, role badge, and user menu (sign out)
- Role-appropriate nav items using the router paths from R3
- Mobile: hamburger menu or bottom tab bar for UL workers
- Active state indicated by underline or filled pill, not inline background color

---

### Surface 2 — UL Worker — Stop List ✅ 2026-05-10

**Files**: `frontend/src/components/today-route/StopList.tsx`, `StopListItem.tsx`, `RouteHeader.tsx`, `UlLayout.tsx`

The primary mobile surface. A UL worker sees this all day.

- `StopListItem`: card layout with stop name, address, status badge (pending/in-progress/done/skipped), offline indicator if action is queued
- `RouteHeader`: route summary (X of Y stops complete, route name, date)
- `UlLayout`: full-height mobile layout with route header fixed, stop list scrollable
- Status badges use semantic colors from tokens
- Loading state: skeleton cards
- Empty state: "No route assigned today" with contact lead CTA

---

### Surface 3 — UL Worker — Stop Wizard ✅ 2026-05-11

**Files**: `frontend/src/components/today-route/StopDetail.tsx`, `StopChecklist.tsx`

The highest-stakes surface — workers complete this under time pressure.

- Step indicator (step N of M) fixed at top
- Large touch targets for all checkboxes and buttons (min 44px)
- Photo capture button is prominent, not buried
- Safety step: hazard selection as large icon tiles, not a small dropdown
- Infra step: issue selection with clear visual distinction
- Completion CTA: primary button full-width at bottom, clearly labeled
- Offline mode indicator if currently queued
- Draft restoration: if draft exists from previous session, show "Resume from where you left off" banner

---

### Surface 4 — Lead — Routes Panel

**Files**: `frontend/src/components/LeadRoutesPanel.tsx`, `LeadRouteDetail.tsx`, `RouteSummary.tsx`, `RouteCreatePanel.tsx`

Tablet-primary surface. Leads manage multiple routes simultaneously.

- Route list: data density. Each row shows route ID, assigned worker role, stop count, completion progress bar, status.
- Route detail: stop-by-stop status with icons. Completed stops green, skipped amber, pending grey.
- Route create: multi-step flow with map preview (OSRM already wired). Step 1: pool selection. Step 2: stop selection with map. Step 3: review and save.
- Progress visualization: `completed / total` as a compact progress bar in the list view

---

### Surface 5 — Admin — Dashboard, Pools, Stops

**Files**: `frontend/src/components/admin/AdminDashboard.tsx`, `AdminPoolsPanel.tsx`, `AdminStopsPanel.tsx`

Desktop-primary. Data-dense tables with actions.

- `AdminDashboard`: stat cards at top (today's runs, completion rate, open exceptions), then tables below
- `AdminPoolsPanel`: full CRUD table — sortable, filterable pool list with inline edit
- `AdminStopsPanel`: stop list with pool assignment, hotspot flag toggle, metadata edit
- Tables use shadcn `DataTable` with sorting and pagination
- All destructive actions (delete, remove from pool) require a confirmation dialog

---

### Surface 6 — Admin — Control Center

**Files**: `frontend/src/components/admin/AdminControlCenter.tsx`

Desktop-primary. Operational real-time view.

- Four sections in a 2×2 grid layout on desktop, stacked on mobile
- Overview: stat cards with clear visual hierarchy (planned vs. actual numbers)
- Routes: live status table with auto-refresh indicator (from R6)
- Exceptions: prominent exception list with stop names and issue types
- Difficulty: ranked stop difficulty table with color-coded scores
- Consistent with admin design language from Surface 5

---

## R5 Overall Done Definition

R5 is complete when ALL of the following are true across all six surfaces, **and a changelog entry has been written**:

- [ ] Zero inline `style={{}}` props remain in any component (App.tsx or below)
  - ✅ App.tsx, UlLayout, RouteHeader, StopList, StopListItem, TodayRouteView, StopChecklist, StopDetail done
  - One documented exception: `RouteHeader.tsx` progress bar `style={{ width: \`${progress}%\` }}` — dynamic runtime value, cannot be a static Tailwind class
  - One component-API pass-through: `StopDetail` passes `style` prop to `ULRouteMap` — not a DOM inline style
- [ ] shadcn/ui component library initialized and in use
  - ✅ `cn()` utility live; manual component extraction approach confirmed (CLI not used — v4 incompatibility)
- [x] Design tokens defined and applied consistently — `src/styles/tokens.css` live
- [ ] All six surfaces rebuilt to spec — Surfaces 1–3 done, 4–6 remaining
- [ ] Every surface has explicit loading, empty, and error states
  - ✅ Surfaces 1–2: skeleton loading, styled error, empty state with CTA
  - ✅ Surface 3: all wizard states styled (not-started, read-only, wizard flow with sync/resume/modal states)
- [ ] UL stop list and stop wizard are fully usable on a 375px mobile viewport
  - ✅ Stop list: verified at 375px, 44px touch targets, semantic badges
  - ✅ Stop wizard: 44px touch targets throughout, modal overlays, mobile-first card layout
- [ ] Lead routes panel is usable on a 768px tablet viewport — Surface 4 not started
- [ ] Admin views are usable on a 1280px desktop viewport — Surfaces 5–6 not started
- [x] No worker-identifying UI elements on any surface
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r5-enterprise-ui.md`
  - ✅ Per-surface changelogs written: `2026-05-10-r5-surface1-app-shell.md`, `2026-05-10-r5-surface2-stop-list.md`, `2026-05-11-r5-surface3-stop-wizard.md`
  - Final consolidated entry to be written when all surfaces are done

---

## Agent Launch Blocks

Each surface is a separate agent session.

### Surface 1 — App Shell ✅ done 2026-05-10
### Surface 2 — UL Stop List ✅ done 2026-05-10
### Surface 3 — Stop Wizard ✅ done 2026-05-11

### Surface 4 — Lead Routes Panel ← next
```
Refinement task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 4 only.
Primary files: LeadRoutesPanel.tsx, LeadRouteDetail.tsx, RouteSummary.tsx, RouteCreatePanel.tsx.
Tablet-primary (768px). Data density for route list. Progress bars. Map preview in route create.
Same infrastructure and constraints as Surface 3. Do not start Surface 5 in this session.
```

### Surface 5 — Admin Dashboard, Pools, Stops
```
Refinement task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 5 only.
Primary files: AdminDashboard.tsx, AdminPoolsPanel.tsx, AdminStopsPanel.tsx.
Desktop-primary (1280px). Data tables with sort/filter. shadcn DataTable via manual extraction.
Confirmation dialogs for destructive actions. Do not start Surface 6 in this session.
```

### Surface 6 — Admin Control Center
```
Refinement task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 6 only.
Primary file: AdminControlCenter.tsx.
Desktop 2×2 grid, stacked on mobile. Consistent with Surface 5 admin design language.
Write final consolidated changelog entry at docs/changelog/YYYY-MM-DD-r5-enterprise-ui.md.
```
