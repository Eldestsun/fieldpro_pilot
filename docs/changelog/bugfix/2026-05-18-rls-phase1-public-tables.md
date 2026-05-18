# 2026-05-18 — RLS Phase 1: org_id isolation on public schema tables

## What changed
- Added migration `20260518_rls_phase1_public_tables.sql`: enables `FORCE ROW LEVEL SECURITY` + org_isolation policy on 7 public tables that already carried an org_id column but had no policy: `public.assets`, `public.bases`, `public.eam_bridge_route_log`, `public.route_pools`, `public.route_runs`, `public.transit_stops`, `public.export_delete_tokens`
- Policy uses COALESCE passthrough pattern: unset `app.current_org_id` bypasses policy (migration/seed bypass); application request paths always set it via `withOrgContext()`
- `export_delete_tokens.org_id` is TEXT — its policy uses plain string comparison (no `::bigint` cast)
- Created `backend/src/middleware/resolveOrgId.ts`: shared helper that extracts numeric org_id from request (dev bypass: direct from `req.user.org_id`; Entra path: lookup by `tid` claim)
- Rewrote `adminPoolService.ts`: all 4 functions accept optional `client?: PoolClient`; `createPool()` now requires `orgId: number` parameter and writes it into the INSERT (fixes pre-existing bug where org_id was missing)
- Rewrote `adminStopService.ts`: `listStops`, `updateStop`, `bulkUpdateStops` all accept optional `client?: PoolClient`; `bulkUpdateStops` only issues BEGIN/COMMIT when it owns the connection
- Updated `resourceRoutes.ts`: `GET /api/pools` wrapped in `withOrgContext`
- Updated `adminRoutes.ts`: `/admin/dashboard`, `/admin/pools` CRUD, `/admin/route-runs`, `/admin/stops` CRUD, `/admin/control-center/routes` all wrapped in `withOrgContext`
- Updated `opsRoutes.ts`: `/ops/dashboard`, `/ops/pools`, `/ops/stops`, `/ops/route-runs`, `/ops/clean-logs` all wrapped in `withOrgContext`
- Updated `routeRunRoutes.ts`: `/lead/todays-runs`, `POST /route-runs`, `POST /route-runs/:id/start`, `POST /route-runs/:id/finish`, `PATCH /route-runs/:id/assign` all wrapped in `withOrgContext`; validation failures inside callbacks use typed error with `.status = 400`
- Updated `routeRunService.ts`: `startRouteRun(id, orgId)` and `finishRouteRun(id, orgId)` now accept `orgId: number` and wrap their UPDATE queries with `withOrgContext`
- Extended `backend/scripts/verify_rls.ts`: adds Phase 1 checks for `public.route_pools` and `public.transit_stops` alongside existing Tier 7 core.* checks (10 checks total, all PASS)

## Why
- 7 public tables with org_id had RLS enabled at the schema level but no enforcement policy; rows were visible across tenants
- Required before a second tenant can be safely onboarded
- `createPool()` had a latent NOT NULL violation bug: org_id column has no default but was not included in the INSERT

## Known gaps (out of scope for Phase 1)
- No-auth endpoints (`/routes/plan`, `/route-runs/preview`, `GET /route-runs/:id`) have no `req.user` and cannot resolve org context; they continue using COALESCE bypass and are acceptable since they are read-only pre-auth discovery paths
- `loadRouteRunById` loader uses `pool.query()` internally (COALESCE bypass); acceptable for reload-after-write use cases where the scoped write has already validated tenant ownership
- Phase 2 tables without org_id (core.visits, core.observations, route_run_stops, etc.) remain for a subsequent migration sprint

## Files touched
- `backend/migrations/20260518_rls_phase1_public_tables.sql` (new)
- `backend/src/middleware/resolveOrgId.ts` (new)
- `backend/src/services/adminPoolService.ts`
- `backend/src/services/adminStopService.ts`
- `backend/src/modules/admin/resourceRoutes.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/scripts/verify_rls.ts`
