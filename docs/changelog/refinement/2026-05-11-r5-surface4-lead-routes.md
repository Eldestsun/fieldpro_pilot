# 2026-05-11 — R5 Surface 4: Lead Routes Panel

## What changed

### Ops* shared UI primitives (src/components/ui/)

**OpsLayout.tsx**
- Full internal rebuild — zero inline styles
- `min-h-screen bg-gray-50 px-4 py-8` shell; `max-w-5xl mx-auto` content column
- Header: `flex justify-between items-start mb-8`; back button `min-h-[44px]`; h1 `text-3xl font-bold`
- `hover:bg-gray-50 transition-colors` on back button

**OpsCard.tsx**
- Internal base styles converted to Tailwind: `bg-white border border-gray-200 rounded-lg shadow-sm`
- `padding` prop mapped to Tailwind classes via lookup (0→p-0, 0.75rem→p-3, 1rem→p-4, 1.5rem→p-6); `padding` and `style` props kept for backward compat with admin callers (Surface 5 will migrate)
- New `className` prop — Surface 4 callers use this instead of `style`

**OpsButton.tsx**
- Full rebuild: variant styles as static Tailwind classes (`VARIANT_CLASSES` map)
- Removed imperative `onMouseEnter`/`onMouseLeave` hover manipulation — replaced with `hover:` Tailwind classes
- Size classes include `min-h-[44px]` for md/lg touch targets, `min-h-[32px]` for sm
- `disabled` state uses `opacity-60 cursor-not-allowed` via `cn()`
- New `className` prop; `style` prop kept for backward compat

**OpsTable.tsx**
- `OpsTable`: `overflow-x-auto` wrapper; `bg-gray-50 border-b border-gray-200` header row; `text-xs font-semibold uppercase tracking-wide text-gray-600` headers
- `OpsTableRow`: `border-b border-gray-100 transition-colors`; `hover:bg-gray-50` when clickable; removed imperative hover handlers
- `OpsTableCell`: `px-4 py-3` padding
- All three accept `className` prop; `style` and `style` on Row/Cell kept for backward compat with admin callers

**OpsBadge.tsx**
- Full rebuild: variant colors as static Tailwind class map
- `inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap`

### Lead surface components

**LeadRoutesPanel.tsx**
- `OpsCard style={...}` → `OpsCard className="bg-red-50 border-red-200 mb-6 p-3"` for error state
- `OpsCard style={{ marginBottom }}` → `OpsCard className="mb-6"`
- `h3 style={{...}}` → `h3 className="mt-0 mb-3 text-lg font-semibold text-gray-800"`
- `OpsTableCell style={{ fontFamily: "monospace" }}` → `className="font-mono text-gray-500"`
- Empty-state cells → `className="text-center py-6 text-gray-500"`

**LeadRouteDetail.tsx**
- **Labor safety fix**: removed `UID:{routeRun.user_id}` display — worker user_id is a worker-identifying element, prohibited by labor safety guardrails. Replaced "Worker" stat with "Date" stat.
- Route meta section: `flex gap-8` layout; stat labels `text-xs text-gray-500 font-semibold uppercase tracking-wide`
- `OpsCard style={{ marginBottom }}` → `className="mb-6"`; `padding={0}` → `className="p-0"`
- `OpsTableCell style={{ color, fontWeight }}` → `className="text-gray-500"` / `className="font-semibold"`
- Loading/error states: `text-center text-gray-500`, `text-red-600 text-center`

**LeadCompletedRouteDetail.tsx**
- `OpsCard style={{ marginBottom }}` → `className="mb-6"`
- `h3 style={{ marginTop: 0 }}` → `className="mt-0 mb-3 text-base font-semibold text-gray-800"`
- `p style={{ color, fontSize }}` → `className="text-gray-500 text-sm"`
- `OpsTableRow style={selectedId ? { backgroundColor: "#ebf8ff" } : {}}` → `className={cn(selected ? "bg-blue-50" : "")}`
- Empty-state cell → `className="text-center py-6 text-gray-500"`
- Added `import { cn }` for conditional row highlight

**RouteSummary.tsx**
- Full rebuild — all inline styles removed
- Outer wrapper: `max-w-xl mx-auto px-4`
- Back button: `border border-gray-300 rounded min-h-[44px] hover:bg-gray-50`
- Stats grid: `grid grid-cols-2 gap-4` inside `bg-gray-50 p-6 rounded-lg border border-gray-200`
- `StatBox` component: `bg-white p-3 rounded-lg border border-gray-100 text-center`; stat value color via `COLOR_CLASSES` map and `cn()`
- Photos section: `flex gap-2 overflow-x-auto`; placeholder tiles `w-20 h-20 bg-gray-200 rounded`
- Warning banner: `bg-orange-50 border border-orange-200 text-orange-700 p-4 rounded-lg`
- Finish button: `cn()` for `bg-gray-300 cursor-not-allowed` (disabled) vs `bg-blue-700 hover:bg-blue-800` (enabled)

**RouteCreatePanel.tsx**
- Slide-over overlay: `fixed inset-0 bg-black/40 flex justify-end z-[1000] backdrop-blur-sm`
- Panel: `w-[480px] max-w-full bg-white h-full p-8 flex flex-col shadow-2xl overflow-y-auto`
- Form labels: `block mb-2 font-semibold text-sm text-gray-700`
- Selects/inputs: `w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm min-h-[44px]` with `disabled:bg-gray-50`
- `OpsButton className="mt-2 w-full"` replaces `style={{ marginTop, width }}`
- Preview analytics: 2-col grid stat cards; stop preview table in `max-h-[300px] overflow-y-auto` OpsCard
- Cancel button: `className="w-full"` in `mt-auto pt-8` footer

## Why
- R5 Surface 4 — replaces all dev-grade inline styles on the Lead routes surface with Tailwind v4
- Labor safety fix: `UID:{user_id}` was a worker-identifying UI element (prohibited by CLAUDE.md guardrails); replaced with non-identifying "Date" stat
- Tablet-primary layout at 768px; 44px touch targets on all buttons; semantic color conventions consistent with Surfaces 1–3

## Files touched
- `frontend/src/components/ui/OpsLayout.tsx`
- `frontend/src/components/ui/OpsCard.tsx`
- `frontend/src/components/ui/OpsButton.tsx`
- `frontend/src/components/ui/OpsTable.tsx`
- `frontend/src/components/ui/OpsBadge.tsx`
- `frontend/src/components/LeadRoutesPanel.tsx`
- `frontend/src/components/LeadRouteDetail.tsx`
- `frontend/src/components/LeadCompletedRouteDetail.tsx`
- `frontend/src/components/RouteSummary.tsx`
- `frontend/src/components/RouteCreatePanel.tsx`
