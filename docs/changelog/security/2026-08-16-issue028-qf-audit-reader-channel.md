# 2026-08-16 — ISSUE-028 + ISSUE-031/Q-F: audit_reader channel — export identity reads off the app role

## What changed
- New migration `20260816_issue028_audit_reader_grant_provision.sql` (runner-applied,
  ledger-recorded, idempotent): guard-creates `audit_reader` (NOLOGIN in version
  control), grants `USAGE` on `core` + `SELECT` on the four `core.*_actor_audit`
  sidecars and their four canonical base tables; **assert-only posture guard**
  (NOBYPASSRLS/NOSUPER — the CREATEROLE runner cannot ALTER those attributes, so a
  breach fails the chain loudly instead of being silently "fixed"); regression
  guards: diagnostic roles (`intelligence_reader`, `mcp_readonly`) hold ZERO sidecar
  privilege; `fieldpro` retains sidecar INSERT (write paths unaffected).
- `backend/src/db.ts`: `getAuditPool()` + `withAuditOrgContext()` — a dedicated pool
  connecting as `audit_reader`. **Fail-closed:** no `AUDIT_READER_PASSWORD` /
  `AUDIT_READER_DATABASE_URL` ⇒ building the pool throws; there is deliberately no
  fallback to the app role. Shared org-context wrapper refactored
  (`runWithOrgContext`) so both channels use identical GUC set/reset discipline.
- `exportDeleteRoutes.ts` + `sftpExport.ts`: the four sidecar-joining identity
  queries (assignments / visits / observations / evidence) now run on the audit
  channel. Non-identity export reads (organizations, locations, history tables) and
  the delete phase stay on the app role.
- `.github/workflows/ci.yml`: `audit_reader` LOGIN enabled with a throwaway per-run
  password after migrations (precedent: `fieldpro_test` / ISSUE-025) +
  `AUDIT_READER_PASSWORD` in the test env.
- `backend/.env.example`: `AUDIT_READER_PASSWORD` documented with the one-time dev
  bootstrap (`ALTER ROLE audit_reader WITH LOGIN PASSWORD …` as `fieldpro_admin`).
- New canonical tests (`auditReaderChannel.test.ts`, 4): grant posture; the
  diagnostic-role zero-privilege wall; end-to-end channel proof (`current_user =
  audit_reader`, org-scoped read sees the seeded sidecar row, **bare read without
  org context sees zero rows** — RLS binds, PATTERN-001); fail-closed on missing
  orgId.
- `docs/KNOWN_ISSUES.md`: ISSUE-028 marked Fixed.

## Why
- Board cards ISSUE-028 (Parallel-Infra) + ISSUE-031/Q-F (P1 — the last open P1
  work item). ADR §3 Q-F: export channel reads identity via `audit_reader`, never as
  the broad app role.
- Recon finding: the audit_reader grant set KNOWN_ISSUES described **no longer
  existed on the live DB** (zero sidecar grants) — out-of-band grants had drifted
  away, ISSUE-040's exact class. Version-controlling the posture is the fix, same as
  ISSUE-039 did for `mcp_readonly`.
- Deliberately NOT done here: narrowing `fieldpro`'s own sidecar SELECT (write paths
  need INSERT; the runtime-binding narrowing is the ISSUE-018-adjacent follow-on —
  two phase-correct changes over one bundled change).

## Verification
- Migration runner-applied + recorded on dev; re-run skips. Dev LOGIN bootstrapped
  out-of-band per design (credential in gitignored `.env`, never echoed/committed).
- Backend canonical suite: **191 passed / 0 failed** (187 + 4 new).
- Migration privilege lesson recorded: CREATEROLE cannot restate SUPERUSER/BYPASSRLS
  attributes — posture guards in runner-applied migrations must assert, not ALTER.

## Files touched
- backend/migrations/20260816_issue028_audit_reader_grant_provision.sql (new)
- backend/src/db.ts
- backend/src/modules/admin/exportDeleteRoutes.ts
- backend/src/scripts/sftpExport.ts
- backend/tests/canonical/auditReaderChannel.test.ts (new)
- backend/tests/run.ts
- backend/.env.example
- .github/workflows/ci.yml
- docs/KNOWN_ISSUES.md
- docs/changelog/security/2026-08-16-issue028-qf-audit-reader-channel.md (this file)
