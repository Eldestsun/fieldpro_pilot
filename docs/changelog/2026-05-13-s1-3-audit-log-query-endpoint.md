# 2026-05-13 — S1-3 Audit Log Query Endpoint

## What changed
- `backend/src/modules/admin/adminRoutes.ts`:
  - Added `AUDIT_KNOWN_ACTIONS` set (full S1-1 action registry) for filter validation
  - Completed `GET /admin/audit-log` (partial skeleton was uncommitted):
    - Auth: `requireAnyRole(['Admin'])` via the existing `/admin` guard — no additional auth code needed
    - Query params: `from` (ISO date, default 30 days ago), `to` (ISO date, default now), `action` (optional exact-match filter), `format` (`json`|`csv`, default `json`)
    - Validation: 400 on invalid ISO date, `to < from`, range > 365 days, invalid format; unknown `action` string logs `console.warn` and proceeds
    - Org scoping: `withOrgContext(orgId, ...)` + explicit `WHERE org_id = $1` — no cross-org leakage possible
    - Pagination: `LIMIT 1000` on entry rows; parallel `COUNT(*)` returns true `total` (not just page count)
    - Sort: `occurred_at DESC`
    - JSON: `{ entries, total, from, to }` — matches spec shape
    - CSV: `Content-Type: text/csv`, RFC 4180 quoting (CRLF, double-quote escaping), filename `audit-log-{from}-to-{to}.csv` (colons replaced for cross-platform compat), column order matches JSON fields

## actor_oid surface audit (smoke test item 6)

`grep -rn "actor_oid" src/` excluding audit/auth files:

| File | Line(s) | Nature |
|------|---------|--------|
| `visitService.ts:113` | `INSERT INTO core.visits` column name | DB write only — not in response body |
| `adminRoutes.ts:73,92,111,145,170` | `auditWrite({ actor_oid: ... })` | Writes to audit_log; not in response body |
| `adminRoutes.ts:376,390` | SELECT + CSV header | The audit endpoint itself — Admin-only |
| `routeRunRoutes.ts:334,525,535` | `auditWrite({ actor_oid: ... })` | Writes to audit_log; not in response body |

**actor_oid appears in API responses exactly once: `GET /admin/audit-log`, Admin role only.**

**Flag (do not fix here — separate audit):** The `detail` JSONB on `assignment.reassign` and `assignment.cancel` records contains `previous_assigned_user_oid` and `new_assigned_user_oid` — worker OIDs stored in the audit log detail column, surfaced to Admins via this endpoint. Intentional for the audit trail but should be explicitly accepted in a follow-up security review.

## Why
- S1-3: Admin users need a compliant audit trail query surface for security review and CSV compliance exports
- `actor_oid` is surfaced only through this Admin-only endpoint — confirmed via grep

## Test baseline
- 19 passed, 15 failed (34 total) — all 15 failures are pre-existing ISSUE-009 fixture failures, unchanged

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `docs/changelog/2026-05-13-s1-3-audit-log-query-endpoint.md` (this file)
