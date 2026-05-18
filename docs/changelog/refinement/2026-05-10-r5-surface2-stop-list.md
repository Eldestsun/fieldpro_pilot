# 2026-05-10 — R5 Surface 2: UL Worker Stop List

## What changed

### UlLayout.tsx
- Replaced inline `style` with Tailwind: `max-w-xl mx-auto px-4 pb-24`
- Removed unused `React` default import (was `React.FC`)

### RouteHeader.tsx
- Replaced all inline styles with Tailwind utility classes
- Added progress bar showing X of Y stops complete (one dynamic `style={{ width }}` accepted — inherently runtime value)
- Added today's date display (`weekday long, month short, day numeric`)
- Sync status rendered with semantic color classes mapped from `statusKind`
- `stats.miles` moved to right side of progress row

### StopList.tsx
- Replaced inline `style` on `<ul>` with `list-none p-0 m-0 flex flex-col gap-3`
- Consistent gap spacing between stop cards

### StopListItem.tsx
- Full rebuild — zero inline styles
- Status badge covers all four values: `pending` (amber), `in_progress` (blue), `done` (green), `skipped` (gray)
- Minimum 44px touch target (`min-h-[44px]`)
- Sequence number badge, formatted location, metadata badges (hotspot, compactor, trash)
- Offline sync indicator: amber "Queued" or red "Conflict" line below metadata
- `done` stops rendered at 70% opacity; all stops show `hover:border-gray-300 active:bg-gray-50`
- Uses `cn()` for all conditional class composition

### TodayRouteView.tsx (presentation only — no state logic changed)
- Loading state → four skeleton stop cards with `animate-pulse`
- Error state → red-tinted card with retry button
- Empty state → icon + "No route assigned today" heading + "Check with your lead" copy + "Check again" button
- "Stop not found" fallback → styled with back button
- Conflict banner, route-completed banner, start-route section, suggested-route labels, next-stop banner, stop list wrapper, finish button → all inline styles replaced with Tailwind
- Map container: `className="card"` + inline overrides → `bg-white rounded-xl shadow-md mb-4 overflow-hidden relative`
- "Navigate to Next Stop" floating button → Tailwind with `cn()` for disabled state colors

## Why
- R5 Surface 2 — replaces dev-grade inline-style UL stop list with mobile-first enterprise design
- 44px touch targets, semantic status colors, skeleton loading, and explicit empty/error states are production requirements for field workers on phones

## Files touched
- `frontend/src/components/today-route/UlLayout.tsx`
- `frontend/src/components/today-route/RouteHeader.tsx`
- `frontend/src/components/today-route/StopList.tsx`
- `frontend/src/components/today-route/StopListItem.tsx`
- `frontend/src/components/TodayRouteView.tsx`
