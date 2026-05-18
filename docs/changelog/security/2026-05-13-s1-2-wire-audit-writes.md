# 2026-05-13 — S1-2 Wire Audit Writes

## What changed
- Created `backend/src/middleware/auditWrite.ts` — thin fire-and-forget wrapper around `writeAuditLog()` plus `reqOrgId()` helper that extracts org UUID from the Azure Entra `tid` JWT claim
- `backend/src/authz.ts` (additive only): added `writeAuthAudit()` helper following the `upsertIdentity` fire-and-forget pattern; wired `auth.login` on successful token validation and `auth.login_failed` on `jwt.verify` error
- `backend/src/modules/routes/routeRunRoutes.ts`:
  - `POST /api/route-runs` → `assignment.create` (after successful `createRouteRun`)
  - `PATCH /api/route-runs/:id/assign` → `assignment.cancel` when `assigned_user_oid` is null; `assignment.reassign` when previous OID existed; `assignment.create` when previous OID was null
- `backend/src/modules/admin/adminRoutes.ts`:
  - `POST /admin/pools` → `admin.config_change`
  - `PATCH /admin/pools/:id` → `admin.config_change`
  - `DELETE /admin/pools/:id` → `admin.config_change`
  - `PATCH /admin/stops/:id` → `admin.stop_edit`
  - `POST /admin/stops/bulk` → `admin.stop_edit`
- `docs/KNOWN_ISSUES.md` — ISSUE-010 added for the two unwired triggers

## Why
- Security Sprint 1, item S1-2: all administrative and security-relevant actions must produce an append-only audit trail
- `actor_oid` is always `req.user.oid` (Entra OID) — never a name or role string
- `org_id` is always `req.user.tid` (Entra tenant UUID) — falls back to `AZURE_TENANT_ID` env var
- Every write is wrapped in try/catch and logs to `console.error` on failure; audit writes never block or fail a primary request

## Not wired (no trigger point exists yet)
- `export.data_export` — data-export endpoint is S1-4, not yet built
- `admin.user_role_change` — no user-role-change endpoint exists; tracked in ISSUE-010

## Smoke test results
- `auth.login` row: written and confirmed in DB via direct `writeAuditLog()` call
- `admin.stop_edit` row: written and confirmed in DB via direct `writeAuditLog()` call
- Broken write (null `org_id`): `auditWrite()` returned synchronously without throwing; error logged to console; primary response path unblocked

## Files touched
- `backend/src/middleware/auditWrite.ts` (new)
- `backend/src/authz.ts` (additive — import + `writeAuthAudit` helper + 2 call sites)
- `backend/src/modules/routes/routeRunRoutes.ts` (import + 2 call sites)
- `backend/src/modules/admin/adminRoutes.ts` (import + 5 call sites)
- `docs/KNOWN_ISSUES.md` (ISSUE-010 added)
