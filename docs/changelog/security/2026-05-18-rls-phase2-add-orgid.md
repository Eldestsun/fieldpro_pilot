# 2026-05-18 — RLS Phase 2: org_id + row-level security on 14 public tables

## What changed

### Migration — `backend/migrations/20260518_rls_phase2_add_orgid.sql`
Added `org_id bigint NOT NULL` and `FORCE ROW LEVEL SECURITY` with `org_isolation` policy
to the following 14 public schema tables. Each table ran in its own transaction so a
failure on one does not roll back the others. Policy uses the COALESCE bypass pattern
(matching Phase 1): unset `app.current_org_id` bypasses the policy for migrations/seeds.

| Table | Backfill path | Rows backfilled |
|-------|--------------|-----------------|
| `route_run_stops` | `route_run_id → route_runs.org_id` | 44 |
| `stop_condition_history` | `visit_id → core.visits.org_id` | 3 |
| `stop_effort_history` | `visit_id → core.visits.org_id` | 2 |
| `stop_risk_snapshot` | `stop_id → transit_stops.org_id` | 206 |
| `hazards` | `visit_id → core.visits.org_id` | 12 |
| `infrastructure_issues` | `visit_id → core.visits.org_id` | 11 |
| `clean_logs` | `visit_id → core.visits.org_id` | 2 |
| `level3_logs` | `visit_id → core.visits.org_id` | 0 (no rows — RLS added for completeness) |
| `trash_volume_logs` | `visit_id → core.visits.org_id` | 2 |
| `stop_photos` | `route_run_stop_id → route_run_stops.org_id` (2-hop, processed after route_run_stops) | 15 |
| `lead_route_overrides` | `pool_id → route_pools.org_id` | 0 (no rows — RLS added for completeness) |
| `stops_legacy` | `asset_id → assets.org_id` | 14,916 |
| `transit_stop_assets` | `asset_id → assets.org_id` | 14,916 |
| `asset_external_ids` | `asset_id → assets.org_id` | 14,916 |

`stops_legacy` orphan check: all 14,916 rows had non-null `asset_id` — no orphan handling required.

### Backend write path updates
Every active INSERT path for the 14 tables updated to include `org_id`:

- `routeRunService.ts` — `route_run_stops` INSERT uses subquery `(SELECT org_id FROM route_runs WHERE id = $1)`
- `devRoutes.ts` — `route_run_stops` INSERT passes `org_id` from request body
- `cleanLogService.ts` — `clean_logs`, `stop_effort_history`, `trash_volume_logs` INSERTs source `org_id` from `ctx.orgId` / `v.org_id`
- `riskMapService.ts` — `stop_risk_snapshot` base CTE switches from `stops` view to `transit_stops ts` to include `ts.org_id`; propagated through `scored` CTE and INSERT; `stop_condition_history` INSERT adds `v.org_id`; same changes applied to legacy rebuild function
- `hazardService.ts` — lookup query extended to JOIN `route_runs` for `org_id`; added to INSERT
- `infrastructureIssueService.ts` — conditional lookup replaced with unified JOIN to `route_runs` for both `asset_id` and `org_id`; added to INSERT
- `stopPhotosService.ts` — `stop_photos` INSERT...SELECT adds `org_id` from `core.visits`
- `routeOverrideService.ts` — `lead_route_overrides` INSERT uses subquery `(SELECT org_id FROM route_pools WHERE id = $2)`

Tables with no active INSERT path (read-only or legacy): `level3_logs`, `stops_legacy`, `transit_stop_assets`, `asset_external_ids`.

### Verification script updates — `backend/scripts/verify_rls.ts`
Added 16 Phase 2 spot checks: for tables with existing data, verifies org=1 returns rows
and phantom org=999 returns zero rows under withOrgContext.

### Test fixture updates
- `tests/setup.ts` — `createRouteRunFixture` route_run_stops INSERT now includes `org_id`
- `tests/canonical/eamBridge.test.ts` — two test blocks' route_run_stops INSERTs and the hazards INSERT now include `org_id`

### SELECT path org context — 5 user-facing endpoints
Five endpoints that read from Phase 2 RLS-protected tables were missing org context.
Without it, the COALESCE bypass in the policy would show all orgs' rows to any
authenticated user. Each endpoint now resolves the numeric org ID via
`resolveNumericOrgId(req)` and sets `app.current_org_id` before any query runs.
The connection is reset to `''` in the finally block (same pattern as `withOrgContext`).

- `POST /api/route-run-stops/:id/skip-with-hazard` (`routeRunStopRoutes.ts`) — reads `route_run_stops`
- `POST /api/route-run-stops/:id/complete` (`routeRunStopRoutes.ts`) — reads/writes `route_run_stops`, `clean_logs`, `stop_effort_history`, `trash_volume_logs`
- `GET /admin/clean-logs` (`adminRoutes.ts`) — reads `clean_logs`, `route_run_stops`; restructured from `pool.query()` to `withOrgContext` client
- `GET /admin/control-center/exceptions` (`adminRoutes.ts`) — reads `route_run_stops`, `hazards`, `infrastructure_issues`
- `GET /admin/control-center/difficulty` (`adminRoutes.ts`) — reads `route_run_stops` (via core views)

## Why
- 14 public tables held tenant-specific data without org_id — rows were globally visible across organizations
- Required to complete full tenant isolation before a second org can be safely onboarded
- Completes the RLS hardening series started in Tier 7 (core.*) and Phase 1 (7 public tables with existing org_id)
- SELECT paths without org context would expose all orgs' operational data to any authenticated user once a second org is onboarded

## Verification results
- Full test suite: **99/99 passed** (0 regressions)
- RLS verification script: **26/26 PASS** (Tier 7 + Phase 1 + Phase 2 spot checks)
- Migration ran cleanly: all 14 transactions committed, all NULL assertions passed

## Files touched
- `backend/migrations/20260518_rls_phase2_add_orgid.sql` (new)
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/domains/routeRun/routeOverrideService.ts`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/src/domains/routeRunStop/hazardService.ts`
- `backend/src/domains/routeRunStop/infrastructureIssueService.ts`
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/src/intelligence/riskMapService.ts`
- `backend/src/routes/devRoutes.ts`
- `backend/scripts/verify_rls.ts`
- `backend/tests/setup.ts`
- `backend/tests/canonical/eamBridge.test.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/admin/adminRoutes.ts`
