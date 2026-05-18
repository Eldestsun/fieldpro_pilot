# 2026-05-11 — R5 Surface 6: Admin Control Center enterprise UI rebuild

## What changed

### AdminControlCenter.tsx
- Extracted `StatCard` sub-component — `label`, `value`, `valueClassName` props — identical pattern to AdminDashboard
- Loading state: 4 skeleton cards with `animate-pulse` in responsive grid (matches AdminDashboard)
- Error state: `OpsCard className="border-red-200 bg-red-50"` with `text-red-600` message (matches AdminDashboard)
- Added `subtitle="Auto-refreshes every 60s"` to all OpsLayout calls — R6 integration point placeholder
- Snapshot section: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` — responsive stat grid matching AdminDashboard
  - Clean Events: `text-blue-700`; Hazards Reported: `text-green-700`; High Severity: `text-red-700`; Observed Minutes: default gray
- Route Status section: existing OpsTable preserved; progress bar cell uses `flex items-center gap-2` + `w-[60px] bg-gray-100 h-2 rounded overflow-hidden` track; fill width is data-driven (`style={{ width: \`${pct}%\` }}` — documented exception, same pattern as RouteHeader); deviation flags use `className="flex gap-2"` + `className="text-gray-300"` for no-flag dash; added empty state row
- Bottom 2×2 grid: `grid grid-cols-1 lg:grid-cols-2 gap-8` — stacked on mobile, side-by-side on desktop (spec requirement)
- Exceptions panel: indicators row uses `grid grid-cols-3 gap-4 mb-6 pb-4 border-b border-gray-100`; Skips by Reason replaced raw `<table style={{}}>` with `divide-y divide-gray-50` divs
- Difficulty panel: hotspot chips `px-2 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded`; difficulty band badges use `cn()` for `bg-red-100 text-red-700` (very_heavy/high) vs `bg-orange-100 text-orange-700` (heavy/elevated); inner grid `grid grid-cols-1 sm:grid-cols-2 gap-4`; scrollable lists `max-h-48 overflow-y-auto`
- Added `import { cn } from "../../lib/utils"` — all conditional classes use `cn()`
- All section headers: `className="text-base font-semibold text-gray-800 mb-4"` — consistent with admin design language

### Documented exception (third, added here)
- `AdminControlCenter` route progress bar fill: `style={{ width: \`${pct}%\` }}` — the fill width is computed at runtime from server data and cannot be expressed with a static Tailwind class. Same pattern as the existing RouteHeader exception. All other styling on the element is via Tailwind classes.

## Why
- R5 Surface 6 — replaces all dev-grade inline styles in AdminControlCenter with Tailwind v4
- Desktop 2×2 grid / mobile-stacked layout per spec
- Auto-refresh subtitle wires the R6 integration point in the UI (logic unchanged)
- Consistent design language with Surface 5 admin surfaces (StatCard pattern, OpsCard error state, animate-pulse skeleton)

## Files touched
- `frontend/src/components/admin/AdminControlCenter.tsx`
