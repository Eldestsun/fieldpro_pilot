# 2026-05-12 — ISSUE-003: Full stop names in difficulty endpoint

## What changed

- `adminRoutes.ts` `/api/admin/control-center/difficulty` `heavyStops` query: added
  `LEFT JOIN public.stops s ON s.stop_id = l.stop_id` and returns three new fields
  per heavy_stops entry: `stop_id` (from `core.v_locations_transit`), `on_street_name`,
  and `intersection_loc` (both from `public.stops`). Column names are lowercase per
  Tier 4 schema cleanup.
- `AdminControlCenter.tsx` `DifficultyResponse` type: `heavy_stops` entries now include
  `stop_id: string | null`, `on_street_name: string | null`, `intersection_loc: string | null`.
- `AdminControlCenter.tsx` Heavier Than Median render site: when all three fields are
  present and non-empty, renders `#${stop_id} · ${on_street_name} — ${intersection_loc}`.
  Falls back to `sanitizeStopLabel(label)` when any field is null or empty — the
  "Transit Stop" safety net is preserved for data quality resilience.
- Removed `TODO(ISSUE-003)` comment from the render site — the backend follow-up is now complete.

## Why

- The partial ISSUE-003 fix (R6 session) replaced raw DB placeholders with "Transit Stop"
  as a stopgap. Dispatchers need the actual stop identity (`#stop_id · street — cross`)
  to act on difficulty signals during an active shift.
- `public.stops` already carries `on_street_name` and `intersection_loc` for every stop;
  joining via `core.v_locations_transit.stop_id` (the metro stop external ID) is the
  correct and low-cost path.

## Files touched

- `backend/src/modules/admin/adminRoutes.ts`
- `frontend/src/components/admin/AdminControlCenter.tsx`

## Issues closed

- ISSUE-003 — Control Center surfaces raw database identifiers instead of stop names ✅ (fully closed)
