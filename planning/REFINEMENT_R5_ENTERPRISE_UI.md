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

Install:
```bash
cd frontend
npm install tailwindcss @tailwindcss/vite radix-ui
npx shadcn@latest init
```

---

## Design Tokens

Define once in `frontend/src/styles/tokens.css`:

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

### Surface 3 — UL Worker — Stop Wizard ← next

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
- [ ] shadcn/ui component library initialized and in use
- [ ] Design tokens defined and applied consistently
- [ ] All six surfaces rebuilt to spec
- [ ] Every surface has explicit loading, empty, and error states
- [ ] UL stop list and stop wizard are fully usable on a 375px mobile viewport
- [ ] Lead routes panel is usable on a 768px tablet viewport
- [ ] Admin views are usable on a 1280px desktop viewport
- [ ] No worker-identifying UI elements on any surface
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r5-enterprise-ui.md`

---

## Agent Launch Blocks

Each surface is a separate agent session:

### Surface 1 — App Shell
```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 1 only.
Rebuild the App.tsx shell and nav bar. Replace all inline styles in App.tsx with
Tailwind utility classes. Add a mobile hamburger menu for UL workers.
Use the design tokens and route paths from R3.
Do not touch any component below the shell.
```

### Surface 2 — Stop List
```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 2 only.
Rebuild StopList.tsx, StopListItem.tsx, RouteHeader.tsx, UlLayout.tsx.
Mobile-first. Touch targets min 44px. Status badges with semantic colors.
Loading skeleton, empty state. Do not change data fetching logic.
```

### Surface 3 — Stop Wizard
```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R5_ENTERPRISE_UI.md, Surface 3 only.
Rebuild StopDetail.tsx and StopChecklist.tsx.
Large touch targets, prominent photo button, hazard selection as icon tiles,
full-width completion CTA. Draft restoration banner if draft exists.
Do not change wizard step logic or API calls.
```

### Surfaces 4, 5, 6 — (same pattern, reference respective surface section)
