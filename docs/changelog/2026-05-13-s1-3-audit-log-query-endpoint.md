# 2026-05-13 — S1-3 Audit Log Query Endpoint

## What changed
- Added `GET /api/admin/audit-log` endpoint to `backend/src/modules/admin/adminRoutes.ts`
- Endpoint is Admin-only (`requireAnyRole(['Admin'])` via the existing `/admin` guard)
- Query parameters: `from` (ISO 8601, default 30 days ago), `to` (ISO 8601, default now), `action` (optional filter), `format` (`json`|`csv`, default `json`)
- Org scoping: `withOrgContext()` + explicit `WHERE org_id = $1` — cross-org leakage is not possible
- JSON response matches spec shape: `{ entries, total, from, to }`
- CSV response: `Content-Type: text/csv`, `Content-Disposition: attachment`, headers match JSON fields, JSONB detail serialised as JSON string, quotes escaped per RFC 4180
- Validation: invalid ISO dates → 400, invalid format → 400, range > 365 days → 400, `from` after `to` → 400
- Added two DB-layer tests to `tests/canonical/auditLog.test.ts`: org isolation and action filter
- Imported `withOrgContext` into `adminRoutes.ts`

## Why
- S1-3 requirement: Admin users need a compliant audit trail query surface for security review and compliance evidence export (CSV)
- Org isolation enforced at both application (WHERE clause) and connection (withOrgContext) layers for defense in depth
- `actor_oid` is surfaced only to Admins — confirmed via grep that no other route handler returns it in a response body

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/auditLog.test.ts`
