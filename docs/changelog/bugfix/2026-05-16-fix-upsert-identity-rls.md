# 2026-05-16 — Fix upsertIdentity silent RLS failure on identity_directory

## What changed
- `backend/src/authz.ts`: `upsertIdentity` now resolves the org's numeric `id` from the `organizations` table (by `tenant_uuid`, falling back to first org for single-tenant pilot) and wraps the INSERT inside `withOrgContext(orgId)` so `app.current_org_id` is set for the session
- `backend/src/authz.ts`: import updated to pull `withOrgContext` from `./db`
- `backend/src/authz.ts`: INSERT now includes `org_id` column (required by table schema and RLS policy)

## Why
- `identity_directory` has FORCE ROW LEVEL SECURITY with policy `org_id = current_setting('app.current_org_id')::bigint`; the previous bare `pool.query()` INSERT ran without setting that session variable, causing every upsert to be silently rejected by RLS
- Confirmed on Render staging: 4 rows pre-dated the RLS addition (R11); 0 new rows written since — verified by querying with `SET app.current_org_id = '1'`

## Files touched
- `backend/src/authz.ts`
