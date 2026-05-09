# 2026-05-09 — R1: Auth Identity Cleanup

## What changed
- Replaced `const user_id = 123` with `const LEGACY_TRANSIT_USER_ID = 0; const user_id = LEGACY_TRANSIT_USER_ID` in both the skip handler and the complete handler in `routeRunStopRoutes.ts`
- Replaced `const PILOT_DEV_UL_USER_ID = 123` with `const LEGACY_TRANSIT_USER_ID = 0` in `routeRunRoutes.ts`
- Added explanatory comments on all replacements noting the legacy status of `user_id`, the canonical field (`core.visits.captured_by_oid`), and the removal condition (post-Tier-2 `clean_logs` deprecation)
- Verified `route_runs.assigned_user_oid` is already correctly wired from `req.body.ul_id` — no change needed

## Why
- `user_id = 123` looked like a real identity; `0` is unambiguously a placeholder and will never match a real record
- Canonical identity is already correct — `core.visits.captured_by_oid` carries the real OID on every stop completion and skip
- DB-confirmed: new `clean_logs` rows write `user_id = 0` after the change

## Files touched
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
