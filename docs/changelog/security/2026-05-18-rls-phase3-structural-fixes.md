# 2026-05-18 — RLS Phase 3: Structural Fixes + Route Pool Model

## What changed

### Part A — audit_log.org_id type change (uuid → bigint)
- Renamed column: `audit_log.org_id uuid` → `org_id bigint`
- Backfilled 27,475 existing rows to `org_id = 1` (KCM pilot org)
- Set `organizations.tenant_uuid = '66d756aa-edfd-46e9-895a-06d9e0e21f3a'` for org id=1 (KCM)
- Replaced cross-tenant SELECT policy (`USING (true)`) with org-scoped policy + COALESCE bypass
- Added INSERT WITH CHECK policy (was missing, so unscoped inserts were permitted)
- Rewrote DELETE policy to use bigint comparison instead of uuid cast
- `writeAuditLog()` now resolves `string | number` org_id internally — digit strings parsed directly, UUID strings resolved via `organizations.tenant_uuid` lookup, with fallback to org 1
- `auditWrite()` in `auditWrite.ts` accepts `Promise<number>` for org_id (fire-and-forget async resolution)
- Added `reqOrgId(req)` helper (→ `resolveNumericOrgId`) and `reqTenantUuid(req)` helper for export_delete_tokens (TEXT) vs audit_log (bigint) use cases
- Run as postgres superuser (fieldpro user has no UPDATE policy on FORCE RLS table)

### Part B — WITH CHECK on core tables
- `core.asset_locations`: added `WITH CHECK` (was USING-only; permitted cross-tenant inserts)
- `core.location_external_ids`: same

### Part C — route_runs.shift_type column
- Added `shift_type text NOT NULL DEFAULT 'day' CHECK (shift_type IN ('day', 'night', 'all_day'))`
- Wired through backend: `routeRunService.ts` createRouteRun params + INSERT, `routeRunRoutes.ts` body destructuring
- Wired through frontend: `routeRuns.ts` API types, `useCreateRoute.ts` state, `RouteCreatePanel.tsx` shift selector (Day/Night/All Day)

### Part D — stop_pool_memberships junction table
- Created `public.stop_pool_memberships (stop_id, pool_id, org_id, shift_type, active, created_at)` with `PRIMARY KEY (stop_id, pool_id)`
- Enabled and forced RLS with org-isolation policy + COALESCE bypass
- Populated from `transit_stops.pool_id`: 14,916 rows inserted
- Read path in `routeRunService.ts` changed from `WHERE s.pool_id = $1` to JOIN through `stop_pool_memberships`
- `adminStopService.ts` list filter uses subquery through junction table
- `adminStopService.ts` updateStop() and bulkUpdateStops() dual-write: keeps `transit_stops.pool_id` cache + writes to `stop_pool_memberships`
- `transit_stops.pool_id` retained as deprecated cache (annotated); not dropped

## Why
- `audit_log.org_id` as UUID created type confusion (mix of Azure tenant UUIDs and synthetic padded-integer UUIDs); bigint aligns with every other org_id FK in the schema
- `core.asset_locations` and `core.location_external_ids` policies had no INSERT guard; cross-tenant writes were possible
- `shift_type` required to capture day/night shift context at route creation (operational context for EAM export)
- `stop_pool_memberships` provides a proper many-to-many relationship; `transit_stops.pool_id` was a single-pool cache column that can't model shared stops

## Files touched
- `backend/migrations/20260518_rls_phase3_structural_fixes.sql` (new)
- `backend/src/middleware/auditLog.ts`
- `backend/src/middleware/auditWrite.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/admin/exportDeleteRoutes.ts`
- `backend/src/scripts/sftpExport.ts`
- `backend/src/scripts/populateEamBridge.ts`
- `backend/src/lib/oidCipher.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/services/adminStopService.ts`
- `frontend/src/api/routeRuns.ts`
- `frontend/src/hooks/useCreateRoute.ts`
- `frontend/src/components/RouteCreatePanel.tsx`
- `backend/tests/canonical/auditLog.test.ts`
- `backend/tests/canonical/exportDelete.test.ts`
- `backend/tests/canonical/sftpExport.test.ts`
