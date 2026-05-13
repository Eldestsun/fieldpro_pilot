# 2026-05-13 — Remove assignee column from Control Center route status table

## What changed
- Removed `assigned_ul_name` from `RouteStatus` interface in `AdminControlCenter.tsx`
- Removed "Assignee" column header from the route status table
- Removed the `assigned_ul_name` data cell from every route row
- Updated empty-state `colSpan` from 6 → 5 to match the corrected column count
- Removed `LEFT JOIN public.identity_directory` and `MAX(idd.display_name) AS assigned_ul_name`
  from the `/api/admin/control-center/routes` SQL query in `adminRoutes.ts`
- Removed `rb.assigned_ul_name` from the final SELECT of that query
- Removed now-unnecessary `GROUP BY` from `route_base` CTE (no longer aggregating)

## Why
- Labor safety hard constraint: worker identity must never appear on supervisor/dispatcher-facing
  monitoring surfaces — the intelligence layer must be structurally worker-anonymous
- This item was already flagged as a known violation in the Tier 3 changelog
  (docs/changelog/2026-05-08-tier-3-control-center.md)

## Files touched
- `frontend/src/components/admin/AdminControlCenter.tsx`
- `backend/src/modules/admin/adminRoutes.ts`
