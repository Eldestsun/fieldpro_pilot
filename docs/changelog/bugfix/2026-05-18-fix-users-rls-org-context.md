# 2026-05-18 — Fix /api/users returning empty list under RLS

## What changed
- `GET /api/users` now wraps the `identity_directory` query in `withOrgContext`
- Added org_id resolution: uses `req.user.org_id` for dev bypass, falls back to tenant UUID lookup for real Entra auth
- Imported `withOrgContext` and `Request` into `resourceRoutes.ts`

## Why
- `identity_directory` has FORCE ROW LEVEL SECURITY with an `org_isolation` policy that
  requires `app.current_org_id` to be set on the connection
- `pool.query()` without org context returns zero rows — the route assignment dropdown
  was always empty when the DB role enforces RLS (local dev and any environment where
  the DB user does not have BYPASSRLS)
- The deployed version masked this because Render's managed Postgres connection has
  elevated privileges; the local `fieldpro` role does not

## Files touched
- `backend/src/modules/admin/resourceRoutes.ts`
