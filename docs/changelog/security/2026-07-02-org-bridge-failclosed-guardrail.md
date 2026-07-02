# 2026-07-02 — Org-notion bridge fails closed everywhere + CI tripwire + CI migrate-path repair

**Type:** Security (fail-open seam closure + pre-merge guardrail) ·
**Branch:** `security/org-bridge-failclosed-and-guardrail` (stacked on
`fix/pre-p2-closeout-exportdelete-auditfk-comment` — merge that PR first; this branch edits
the same `devAuthBypass.ts` region and builds on the audit_log FK)
**Specs:** ISSUE-013 card, MT-2 card, KNOWN_ISSUES § PATTERN-001, PROJECT_CONTEXT (two org
notions).

## Item 1 — the chokepoint (already fail-closed) + its two surviving twins

`resolveNumericOrgId` was **already fail-closed on main** (ISSUE-013 landed 2026-06-27:
throws `OrgResolutionError` → 403; dev-bypass early-return preserved) — verified, not
re-implemented; KNOWN_ISSUES' "Deferred" status line is stale. What this branch closes is
the same fallback pattern living **outside** the chokepoint:

- **`middleware/auditLog.ts` (`writeAuditLog`)** — the `UNION ALL … ORDER BY id LIMIT 1`
  + `?? 1` first-org fallback (the "fallback twin" flagged by the 2026-06-27 clean-build
  audit) is removed: an unmatched tenant string now **throws** — an audit row must never
  land in the lowest-id org's compliance trail. `devAuthBypass.ts` now passes the numeric
  org from its own `x-dev-user-org-id` header instead of the sentinel UUID, so the bypass
  audit trail keeps working without any fallback.
- **`authz.ts` (`upsertIdentity`) — REPORTED, NOT TOUCHED (frozen file).** It carries the
  identical fallback before writing `identity_directory` — cross-org identity-cache
  contamination the day org 2 exists. `authz.ts` is frozen (PROJECT_CONTEXT §5), so this is
  a founder-decision follow-up, documented here and in the paste-back.

## Item 2 — enumeration + violator fixes (PATTERN-001)

Full table in the dispatch paste-back. Violators found on the current surface, all fixed
here (each was silently broken — 0 rows/empty metrics — under MT-2 fail-closed):

- `routeRunRoutes.ts` `POST /routes/plan` + `POST /route-runs/preview` — bare `pool.query`
  of `stops` → now `withOrgContext(resolveNumericOrgId(req), …)`.
- `adminRoutes.ts` `GET /admin/control-center/overview` — bare client, no context (its
  siblings `/exceptions` `/difficulty` set it) → now resolves + `set_config`, same pattern.
- `intelligence/riskMapService.ts` `rebuildStopRiskSnapshot` — context-less rebuild
  silently produced an EMPTY snapshot → now takes a **required** `orgId` (throws if
  absent); `adminRoutes` caller passes `resolveNumericOrgId(req)`; `riskMapJob` CLI
  requires `RISK_MAP_ORG_ID` (exit 1 if unset — never assumes an org).
- `devRoutes.ts` both dev fixture endpoints — set context from their explicit dev
  `org_id` param (prod-unreachable; param default is a dev-fixture convention, not a
  resolution fallback).

Documented safe exceptions (not wrapped): `exportDeleteRoutes` (two-notion `setOrgCtx`,
prior branch), `withOrgContext` itself, `resolveOrgId`/`auditLog`/`authz` `organizations`
lookups (table has no RLS), admin services' optional-client branches (all runtime callers
pass a scoped client), operator scripts (`populateEamBridge`, `sftpExport`,
`run_migration_washed_can` — non-app-runtime; must run as provisioner/with context).

## Item 3 — CI tripwire (runtime behavior, pre-merge only)

`backend/tests/canonical/orgFailClosed.test.ts` (registered in `tests/run.ts`): 6 runtime
assertions against the live test DB as the non-super role — unmatched-tenant refusal
(typed 403, never org-1), no-signal refusal, dev-bypass still resolves, writeAuditLog twin
stays dead, and two fail-closed RLS reads (probe-row-proven `core.locations`,
`route_pools`). Runs ONLY in the CI `test-backend` job (`pnpm test`); wired into no
deploy/runtime/healthcheck path. Red-demo performed: seeding the old fallback back turns
it red with `ISSUE-013 REGRESSION: … resolved … to org 1 instead of refusing`.

## Discovered: CI has been red since 2026-06-24 — migrate path repaired (`ci.yml`)

`test-backend → Run migrations` has failed on every run since `20260624_role_provisioning_codify`
landed: that migration downgrades `fieldpro` from SUPERUSER mid-chain, so CI's
superuser-`fieldpro` runner dies at the next `fieldpro_admin`-scoped statement on any
fresh DB. **Nothing merged since ~06-24 has actually run the test suite.** Fix (CI config
only, no schema/migration content touched): a bootstrap step mirroring
`db/init/00_bootstrap_provisioner.sh` (create `fieldpro_admin`, downgrade `fieldpro`,
pgcrypto), migrate via `PGADMIN_DATABASE_URL` as `fieldpro_admin`, seed + test-role steps
run as `fieldpro_admin`. Verified locally end-to-end (fresh container → bootstrap →
chain exit 0 → seed → suite).

## Discovered: 15 pre-existing suite failures (report, deliberately not fixed here)

With CI's migrate finally passing, the suite surfaces **26 failures on `origin/main`**
(fresh fail-closed DB, non-super role) — tests whose *setup plumbing* assumes fail-open
RLS, broken since MT-2 but invisible behind the red migrate step. The pending closeout
branch already repairs 11 (exportDelete); this branch's 6 gate tests are green; the
remaining **15** (audit_log ×7, sftpExport ×3, eam_bridge ×2, riskMap CANON-NORM-3,
devAuthBypass audit-row, loadRouteRunById cross-tenant) span five subsystems and are
**reported for a follow-up card** rather than force-fixed inside a security branch. None
are regressions from this branch (failure sets identical main vs. branch, minus the 11
fixed).

## Item 4 — governance

`CLAUDE.md § RLS Context Gotcha` gains the hard rule: RLS-touching handlers arrive via
`withOrgContext(await resolveNumericOrgId(req), …)` (or explicit reset-on-release
`set_config`); resolution fails closed — never org-1; new handlers prove routing in their
paste-back; the CI tripwire turns regressions red.

## Verification

- Gate tests 6/6 green; red-demo red-then-green (message names the regression).
- Full suite on the CI-replica (fresh DB, fixed recipe, `fieldpro_test`): 138/153, the 15
  failures = the pre-existing set above; `origin/main` baseline on the same replica:
  121/147 (26 failures, superset).
- `tsc --noEmit` clean. Identity wall untouched (0 identity grants; no role/grant/schema
  change anywhere in this branch — code, one test, CI config, docs only).

## Files touched

- `backend/src/middleware/auditLog.ts`, `backend/src/middleware/devAuthBypass.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`, `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/intelligence/riskMapService.ts`, `backend/src/intelligence/riskMapJob.ts`
- `backend/src/routes/devRoutes.ts`
- `backend/tests/canonical/orgFailClosed.test.ts` (new), `backend/tests/run.ts`
- `.github/workflows/ci.yml`
- `CLAUDE.md`
- `docs/changelog/security/2026-07-02-org-bridge-failclosed-guardrail.md` (this file)
