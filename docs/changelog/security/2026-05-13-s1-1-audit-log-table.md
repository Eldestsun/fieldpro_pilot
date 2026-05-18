# 2026-05-13 — S1-1 Admin Action Audit Log

## What changed
- Created `audit_log` table via `backend/migrations/20260513_audit_log.sql`
  - Columns: `id`, `actor_oid` (Entra OID only), `org_id`, `action`, `resource_type`, `resource_id`, `detail` (JSONB), `ip_address`, `occurred_at`
  - Indexes: `audit_log_org_occurred (org_id, occurred_at DESC)`, `audit_log_actor (actor_oid, occurred_at DESC)`
  - Append-only enforced via `FORCE ROW LEVEL SECURITY` — SELECT and INSERT policies exist; absence of UPDATE/DELETE policies causes those commands to silently affect 0 rows for all roles including the table owner
- Migration stamped in `schema_migrations` at 2026-05-13
- Created `backend/src/middleware/auditLog.ts` with `writeAuditLog(entry: AuditEntry)` — imports pool from existing `db.ts`, no new pool created
- Created `backend/tests/canonical/auditLog.test.ts` with three tests:
  - INSERT via `writeAuditLog` succeeds and is readable
  - UPDATE is blocked by RLS (0 rows affected, row survives unchanged)
  - DELETE is blocked by RLS (0 rows affected, row survives)
- Registered `auditLog.test.ts` in `backend/tests/run.ts`

## Why
- Security Sprint 1, item S1-1: compliance auditability for administrative and security-relevant actions
- `actor_oid` stores Azure Entra OID only — never a worker name, display name, or role-inferrable identifier
- Append-only design ensures the audit trail cannot be tampered with at the application layer
- Blocks S1-2 (wire audit writes) and S1-3 (audit query endpoint)

## Files touched
- `backend/migrations/20260513_audit_log.sql` (new)
- `backend/src/middleware/auditLog.ts` (new)
- `backend/tests/canonical/auditLog.test.ts` (new)
- `backend/tests/run.ts` (updated — added auditLog.test import)
