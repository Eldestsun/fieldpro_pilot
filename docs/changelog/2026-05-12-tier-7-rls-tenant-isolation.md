# 2026-05-12 — Tier 7: Row Level Security & Tenant Isolation

## What changed
- New migration `backend/migrations/20260512_row_level_security.sql` — ENABLE + FORCE ROW LEVEL SECURITY on all five canonical tables (`core.visits`, `core.observations`, `core.evidence`, `core.assignments`, `core.locations`) and creates an `org_isolation` policy (USING + WITH CHECK) on each, gated by the `app.current_org_id` session variable.
- The policy treats an unset/empty `app.current_org_id` as a migration-bypass (no row filter), so the existing migration runner and any superuser/admin script that connects without org context continues to work unchanged. Application code always sets the variable.
- Added `withOrgContext(orgId, fn)` wrapper in `backend/src/db.ts`. Sets `app.current_org_id` via `set_config(..., false)` for the lifetime of the checked-out pool client and resets it on release so a pooled connection cannot leak org context into the next request.
- Refactored the two internal `pool.connect()` blocks in `backend/src/domains/observation/observationService.ts::emitObservationsForStop` (arrival lookup and own-client insert paths) to use `withOrgContext(orgId, ...)`. The passed-client branches are unchanged — callers that already hold an RLS-aware client continue to work.
- `visitService.ts` and `routeRunService.ts` contain no direct `pool.connect()` calls — both already accept a `PoolClient` from the caller (route layer / `startRouteRunStop` operation). Verified `org_id` is populated on every canonical insert: `core.visits` resolves it from `getVisitContext(route_run_stop)`, `core.assignments` joins `public.assets` for it.
- New verification script `backend/scripts/verify_rls.ts`. Creates two ephemeral organizations, inserts a `core.locations` row for each, then runs six assertions: each org sees exactly its own row, neither org sees the other's row, cross-tenant `INSERT` is blocked by `WITH CHECK`, and a context-less (migration-bypass) connection sees both rows. Cleans up on exit. All six checks PASS.

## Why
- `org_id` existed on every canonical table but was not enforced. A query missing `WHERE org_id = $1` returned cross-tenant data. Tier 7 moves the boundary from the service layer to the database, where a forgotten WHERE clause can no longer leak rows.
- Bypass-by-unset (rather than `BYPASSRLS` role attribute) keeps the existing migration runner working without introducing a new DB role. The application path is the only path that sets the variable, so the bypass branch is unreachable from request handlers that go through `withOrgContext`.
- Verifier proves cross-tenant isolation end-to-end against the real local DB and must be re-run after any future migration that touches canonical tables.

## Files touched
- `backend/migrations/20260512_row_level_security.sql` (new)
- `backend/src/db.ts`
- `backend/src/domains/observation/observationService.ts`
- `backend/scripts/verify_rls.ts` (new)
- `planning/REFACTOR_INDEX.md`
- `planning/TIER_7_ROW_LEVEL_SECURITY_&_TENANT_ISOLATION.MD`
