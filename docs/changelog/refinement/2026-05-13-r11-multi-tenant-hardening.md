# 2026-05-13 — R11 multi-tenant hardening

## What changed

### Change 1 — `identity_directory`: tenant isolation
- Added `org_id bigint NOT NULL REFERENCES public.organizations(id)` column
- Backfilled all existing rows to KCM org (id=1)
- Created index `idx_identity_directory_org_id` for lookup performance
- Enabled RLS (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`)
- Added `org_isolation` policy: `org_id = current_setting('app.current_org_id', true)::bigint`
- Added table comment documenting labor-safety constraint: intelligence-layer queries must not JOIN this table; `loadRouteRunById` is the only controlled exception
- Cross-tenant isolation verified: `SET app.current_org_id = 999` returns 0 rows

### Change 2 — `core.asset_locations` + `core.location_external_ids`: RLS gap closed
- Both tables had `org_id` but no RLS policy — gap from Tier 7 which covered only the five primary canonical tables
- Added `org_isolation` policy on `core.asset_locations` (mirrors Tier 7 pattern)
- Added `org_isolation` policy on `core.location_external_ids` (mirrors Tier 7 pattern)

### Change 3 — `public.route_runs.org_id`: NOT NULL enforced
- Backfilled any NULL `org_id` rows to KCM org before constraining
- Altered column to `NOT NULL`
- Added FK constraint `fk_route_runs_org` (if not already present)

### Change 4 — `loadRouteRunById`: controlled exception documented
- Added comment block above the `identity_directory` JOINs in
  `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- Comment designates this as the only permitted JOIN to `identity_directory`
  in the codebase and states the constraint that display names must not flow
  into any intelligence surface

### Change 5 — Orphan table investigation
Four candidates investigated; one dropped, three retained:

| Table | Decision | Reason |
|-------|----------|--------|
| `public.route_run_audit` | **DROPPED** | 0 rows, no incoming FKs, no backend references; UUID/bigint FK mismatch made it non-functional |
| `public.lead_route_overrides` | KEPT | 0 rows but active backend write path in `routeOverrideService.ts` (FORCE_INCLUDE / FORCE_EXCLUDE / PRIORITY_BUMP) |
| `public.stops_legacy` | KEPT | 14,916 rows — populated table; re-evaluate post-pilot when `transit_stops` confirmed stable |
| `public.asset_types` | KEPT | FK from `public.assets.asset_type_id`; active bridge between `public.assets` and `core.asset_types` in `assetService.ts` / `observationService.ts` |

Full investigation report: `docs/audit/2026-05-13-orphan-investigation.md`

### Verification
All 6 `verify_r11.ts` assertions pass:
- `identity_directory` has `org_id` column
- `identity_directory` has `org_isolation` policy
- `identity_directory` returns 0 rows for unknown org (999)
- `core.asset_locations` has RLS policy
- `route_runs` has no NULL `org_id` rows
- Intelligence tables (`stop_effort_history`, `stop_condition_history`, `stop_risk_snapshot`, `stop_risk_scores`) have no `user_id` column

## Why
- `identity_directory` had no tenant isolation — a TPRA finding risk at second-agency onboarding
- `core.asset_locations` and `core.location_external_ids` were missed by Tier 7 RLS migration
- Nullable `route_runs.org_id` was a data integrity gap and potential future RLS bypass vector
- `loadRouteRunById` JOIN needed explicit documentation to prevent replication as a pattern
- Orphan tables investigated before Fly.io beta deploy to avoid carrying dead schema

## Files touched
- `backend/migrations/20260513_r11_identity_directory_org.sql` (new)
- `backend/migrations/20260513_r11_core_location_tables_rls.sql` (new)
- `backend/migrations/20260513_r11_route_runs_org_notnull.sql` (new)
- `backend/scripts/verify_r11.ts` (new)
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `docs/audit/2026-05-13-orphan-investigation.md` (new)
- `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md` (this file)
