# 2026-05-11 — R5 Surface 3: UL Worker Stop Wizard

## What changed

### StopChecklist.tsx
- Full rebuild — zero inline styles
- Task rows use `cn()` for conditional bg/border: green-50/border-green-300 when checked, white/border-gray-200 when unchecked
- Read-only state: cursor-default bg-gray-50, text-gray-400 label
- 44px minimum touch target on every label row (`min-h-[44px]`)
- Checkbox uses `accent-green-600` for brand-consistent color

### StopDetail.tsx
- `import { cn }` added; all conditional styling migrated to `cn()`
- **`renderHotspotToggle()`**: hotspot active state uses blue-600/white pills, inactive uses gray-200/gray-700 — no inline styles
- **Not Started view**: map hero `relative w-full h-60`, status overlay pill with `bg-white/90 shadow-lg backdrop-blur-sm`, navigate button with `left-1/2 -translate-x-1/2 bottom-3.5`, content section with stop number label, bold h2, hotspot/compactor badges, Start Stop CTA (`w-full py-4 rounded-xl`)
- **Read Only view**: back button full-height flex touch target; status banner `bg-red-50/border-red-200` (skipped) or `bg-green-50/border-green-200` (done); safety, infra, and tasks-completed summaries all use Tailwind with `cn()` for conditional coloring
- **Wizard header**: flex row with back button (44px touch target) and stop number label
- **Resume banner**: `bg-blue-50 border-blue-200` with dismiss button
- **Sync state indicators**: amber text for queued, red text for conflict, orange for queued photo count
- **Report buttons**: `bg-orange-50 border-orange-400 text-orange-700` (safety), `bg-blue-50 border-blue-400 text-blue-700` (infra) — both 44px min-height
- **Safety Modal**: `fixed inset-0 bg-black/75 z-[2000]`; hazard tiles 2-col grid with `bg-red-50/border-red-600` when selected; photo upload button green when attached; textarea styled with `border-gray-300`; footer actions use `cn()` for enabled/disabled states
- **Infra Modal**: same shell pattern as safety; issue tiles `bg-blue-50/border-blue-300` when selected; `accent-blue-600` checkboxes
- **Spot check toggle**: `border-2 border-blue-400`, `bg-blue-500 text-white` active, `bg-white text-blue-700` inactive
- **Cleaning tasks card**: `flex-1 min-w-[300px] bg-white rounded-xl shadow-md`; rows use `bg-green-50/border-green-300` when checked; `opacity-50 pointer-events-none` when spot check active
- **Trash volume card**: segmented button row with `border border-gray-300 rounded-lg overflow-hidden`; selected state `bg-gray-100 shadow-inner`; `opacity-50 pointer-events-none` when spot check active
- **Photos section**: `bg-white rounded-xl shadow-md`; pending thumbnails with absolute-positioned remove button; Upload Now / Discard buttons with 44px targets
- **Document Conditions button**: `bg-blue-600` photo CTA, disabled state `opacity-60 cursor-not-allowed`
- **Finish button states**: disabled-gray (tasks/volume incomplete), `bg-blue-900` for Take After Photo, `bg-blue-900` with `canComplete` guard for final Finish
- **Skip Modal**: `fixed inset-0 bg-black/50 z-[1000]`; Cancel (white/border-gray) and Skip (bg-red-700) — both 44px
- **`_renderProgressBar()`** (voided dead code): converted to Tailwind for consistency — blue-600 active, green-500 completed, gray-200 pending

### One documented exception (unchanged from Surface 2)
- `ULRouteMap` `style={{...}}` — component-API prop configuring map's own CSS layout. Not a DOM inline style.

## Why
- R5 Surface 3 — replaces all inline `style={{}}` props in the stop wizard with Tailwind v4 utility classes
- 44px touch targets throughout for UL field workers on mobile
- Semantic color conventions: blue for primary CTAs, orange for safety, blue for infra, green for success states, red for danger/skip

## Files touched
- `frontend/src/components/today-route/StopChecklist.tsx`
- `frontend/src/components/today-route/StopDetail.tsx`
