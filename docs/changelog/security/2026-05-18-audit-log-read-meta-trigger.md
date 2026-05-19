# 2026-05-18 — audit_log_read meta-trigger: correct detail shape + integration tests

## What changed

- `backend/src/modules/admin/adminRoutes.ts` — corrected `auditWrite` call in `GET
  /admin/audit-log`:
  - Added `resource_type: 'audit_log'`
  - Renamed `detail.from` → `detail.query_from` and `detail.to` → `detail.query_to`
    to match ADMIN_ACCESS_POLICY.md spec
  - Added `detail.action_filter` (null or the filter string passed in the request)
  - Added `admin.audit_log_read` to the OpenAPI action enum for the `action` query
    parameter so it appears as a filterable option in generated docs
- `backend/tests/canonical/auditLog.test.ts` — added three integration tests:
  - JSON read: `writeAuditLog` with correct shape, verified resource_type, resource_id,
    query_from, query_to, action_filter, format, result_count in DB
  - CSV read: same shape with `format: 'csv'` and a non-null action_filter
  - Failed read: starts the app on an ephemeral port, sends an invalid-date request,
    waits 300 ms, verifies no `admin.audit_log_read` row was written

## Why

- The 2026-05-14 implementation wired the write but used the wrong detail keys
  (`from`/`to` instead of `query_from`/`query_to`) and omitted `resource_type` and
  `action_filter` — inconsistent with the ADMIN_ACCESS_POLICY.md shape specification
  and the TPRA control claim in S2-5 / S2-6
- No HTTP-level tests existed to prove the negative (failed reads don't write)

## Files touched

- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/auditLog.test.ts`
- `docs/changelog/security/2026-05-18-audit-log-read-meta-trigger.md`
