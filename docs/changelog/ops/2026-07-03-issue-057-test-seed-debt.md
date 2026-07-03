# 2026-07-03 — ISSUE-057: the 15 fail-open-assumption test failures repaired (seed/context, never un-hardening)

**Type:** Ops / test harness · **Branch:** `fix/issue-057-test-seed-debt` ·
**Card:** ISSUE-057. Companion PRODUCT entry (called out separately per founder
instruction): `docs/changelog/bugfix/2026-07-03-eam-bridge-riskmap-org-scoping.md`.

## Rule held throughout

Every fix brings the TEST's setup up to what the hardened product requires. No FK,
trigger, RLS policy, or fail-closed guard was weakened — constraint-preservation proofs in
the dispatch paste-back (audit FK still rejects unseeded orgs; bare reads still 0 rows;
append-only UPDATE/DELETE still blocked WITH context; the pool-invariant trigger still
raises; the app role still cannot TRUNCATE).

## Phase-0 buckets → fixes

- **(A) missing org rows (3):** S1-3 isolation orgs 98/99 (`ensureS13Orgs`, idempotent) and
  sftpExport's org 7 — seeded per-test, satisfying the ISSUE-053c audit FK.
- **(B) missing org-context (10):** every bare verification read/write now runs with
  `app.current_org_id` set exactly as the app does — auditLog (reads + append-only checks,
  which got STRONGER: blocked UPDATE/DELETE now proves policy absence, not row
  invisibility), sftpExport reads ×3, devAuthBypass read, eamBridge seed inserts (the
  pool-invariant trigger reads route_pools as invoker — visibility, not absence),
  loadRouteRunById's org-B fixture (was explicitly written against pre-MT-2 "unset =
  bypass"; now writes/cleans under org-B context). Also un-vacuoused the green
  meta-trigger negative test (its count-0 read was bare, hence trivially 0).
- **(C) missing siblings (found during repair):** `seed.sql` stop 31150 lacked the
  base-eligibility attributes the risk-map rebuild requires (`pool_id`, `has_trash` — now
  `DO UPDATE` so previously-seeded DBs heal) and the `core.asset_locations` link
  (asset 2 → location 1, primary) the hazard/l3 CTEs translate through; `run.ts` probe
  extended to require the eligible shape so stale seeds re-apply.
- **(D) product-API adoption (3):** riskMap test adopts the hardened
  `rebuildStopRiskSnapshot(pool, FIXTURE_ORG_ID)` signature (magnitude assertions
  untouched); eamBridge tests call `populate(FIXTURE_ORG_ID)`; the two product gaps behind
  them are in the companion bugfix entry.
- Also: `loadRouteRunById.createOrgB` uses an explicit clock-derived org id (the
  explicit-id test orgs never advance the sequence; healing it would need a sequence
  UPDATE privilege the app role rightly lacks).

## Result

- Full suite: **156 passed / 0 failed** (155 prior + the new script-guard tripwire).
- Gates: orgFailClosed **9/9** (8 + the new script-guard), identity-leak **28/28**.
- No frozen file touched. Non-test files touched: exactly the two in the companion
  product entry.

## Files touched (test layer)

- `backend/tests/fixtures/seed.sql`, `backend/tests/run.ts`
- `backend/tests/canonical/`: auditLog, sftpExport, eamBridge, riskMapSeverity,
  devAuthBypass, loadRouteRunById, orgFailClosed
- `docs/changelog/ops/2026-07-03-issue-057-test-seed-debt.md` (this file)
