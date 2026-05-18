# 2026-05-14 — S1-3 deferred: audit_log_read meta-trigger

## What changed

- `backend/src/middleware/auditActions.ts` — added `'admin.audit_log_read'` to
  `AUDIT_KNOWN_ACTIONS`
- `backend/src/modules/admin/adminRoutes.ts` — added `auditWrite` call in
  `GET /admin/audit-log` after the DB query succeeds, before the response is sent;
  fires for both JSON and CSV format responses; records
  `{ from, to, format, result_count }` in `detail`

## Why

- S1-3 built the audit log query endpoint but deferred the self-audit write
- The NIST AU-2 control mapping (S2-1) lists "audit log read is itself auditable"
  as an implemented control; this closes the gap between that claim and the code

## Files touched

- `backend/src/middleware/auditActions.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `docs/changelog/2026-05-14-s1-3-audit-log-read-trigger.md`
