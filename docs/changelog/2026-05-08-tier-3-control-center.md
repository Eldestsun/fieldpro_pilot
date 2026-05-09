# 2026-05-08 — Tier 3: Reconnect Control Center

## What changed
- Added `AdminControlCenter` import to `frontend/src/App.tsx` using the existing `resolveComponent` pattern
- Extended `activeView` state type with `"admin_control_center"`
- Added "Control Center" nav button in the Admin Tabs section (after Stops)
- Added `renderView()` case returning `<AdminControlCenter />` (no props)

## Why
- `AdminControlCenter.tsx` was complete but disconnected from the UI in a prior rollback
- All four backend endpoints (`/api/admin/control-center/{overview,routes,exceptions,difficulty}`) were already implemented and Admin-guarded
- Reconnecting the component required zero backend changes and zero changes to auth or offline logic

## Files touched
- `frontend/src/App.tsx`

### Notes
- Change progress bar semantics from "completed" -> visited
- Remove assignee from route status table
- Route status table data should persist even if a route is completed, nothing wipes from the control center view until 