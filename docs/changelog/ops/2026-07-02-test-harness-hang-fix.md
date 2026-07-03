# 2026-07-02 — Test-harness hang fix: CI timeout + pooled-client leak pattern + fixture seed parity

**Type:** Ops / test harness (NO application-runtime, RLS, schema, or migration change) ·
**Branch:** `security/org-bridge-failclosed-and-guardrail` (same branch as the org-bridge work, per dispatch)

## Item 1 — timeout (the safety net)

- `.github/workflows/ci.yml`: `timeout-minutes: 12` on `test-backend` (healthy full run
  completes in well under 10; the pool-exhaustion hang previously wedged the job 27+ min).
  A future hang now fails in minutes with a legible "timed out", never a silent wedge.
- Per-test timeout: `tests/setup.ts § runAll` has **no timeout mechanism** (plain
  sequential `await t.fn()` loop). Reported per dispatch — not built; the job-level bound
  is the floor.

## Item 2 — the leak (one pattern, grep-proven)

**Root cause:** 27 fixture-backed tests checked out a pooled client and called
`createRouteRunFixture(client)` BEFORE the `try`, so a fixture throw skipped
`finally { client.release() }`. pg's default pool is 10 clients → ten setup failures
exhausted it → every later `pool.connect()` waited forever → the mid-suite hang.

**Canonical pattern** (two helpers in `tests/setup.ts`, applied mechanically):
- `acquireRouteRunFixture()` — checkout + fixture with release **guaranteed on any
  setup throw**; call sites become `const { client, f } = await acquireRouteRunFixture();`
- `releaseFixture(client, f)` — cleanup with release **guaranteed even if cleanup
  throws** (the secondary leak path, likeliest exactly when a test already failed).

Converted: the 27 two-line sites across 11 files (script-applied), the try-less
`evidence.test.ts` Q-D setup block (the recon's `:196` leak) and the Q-D commit-path
sibling (mid-try `setup.release()` skipped on throw), plus guarded-shape corrections in
`roleRenamePhase1Audit` (fixture-null branch still releases) and
`cleanLogsCanonicalPivot` (extra finally statement wrapped). Fixture behavior and test
assertions untouched — leak-plumbing only.

**Grep proofs:** raw `createRouteRunFixture(` outside `setup.ts` → **1** (the
`roleRenamePhase1Audit` site that was already correct: fixture inside try, both release
paths guaranteed); `pool.connect()`-then-await-before-`try` shape → **0** across
`tests/`; unguarded `cleanupFixture(` outside `setup.ts` → 0 (remaining hits: one inside
its own `try/finally{release}`, one an unrelated local function in
`runtimeIdentityLeak`).

## Item 3 — the seed (CI/local parity)

**Identified:** on the rebuilt local dev DB the fixture's `route_runs` INSERT succeeds
(`TEST_POOL` present) and the very next statement fails:
`route_run_stops_asset_id_fkey — Key is not present in table "assets"` (asset 2 / stop
31150 / the metro_stop location mapping are absent). **CI-vs-local reconciled:** CI's
"Seed test fixtures" job step applies `tests/fixtures/seed.sql`; local runs had no
equivalent, and the dev rebuild dropped the inventory rows that had masked it.

**Fix (test setup only):** `tests/run.ts § ensureFixtureSeed()` — probe for the fixture
graph (as the suite role, org-context set/reset); present → skip (CI, already-seeded
local); missing → apply `seed.sql` on an ADMIN connection (the seed must toggle
`trg_sync_transit_stop_primary_asset` per ISSUE-024, which needs table ownership the
deliberately-unprivileged suite role lacks), using migrate.ts's env convention
(`PGADMIN_DATABASE_URL` / `PGADMIN_USER+PGADMIN_PASSWORD` / `FIELDPRO_ADMIN_PASSWORD`);
no credentials → **fail fast with the one-line fix**, never an FK cascade. No schema,
FK, or migration touched.

## Payoff — the reconciled failure set (clean termination)

Full suite on live dev (`fieldpro`, non-super): **138 passed, 15 failed (153 total)** —
terminates in seconds, no hang. Classification:
- **(a) predicted pre-existing debt — all 15:** audit_log ×7, sftpExport ×3,
  eam_bridge ×2, riskMap CANON-NORM-3 ×1, devAuthBypass audit-row ×1,
  loadRouteRunById cross-tenant ×1 (DISCOVERY B list, exact match).
- **(b) exportDelete: 0** (closeout branch is in this base; its 14 pass).
- **(c) unlisted / potential new regression: 0.**
- Both gates GREEN in the completed run: the ISSUE-044 identity-leak gate and
  `orgFailClosed.test.ts` (34 gate assertions ✓, 0 ✗).

**Verdict: CLEAN** — the suite terminates, every failure is known debt, the previous
"38-fail" readings were the pool-exhaustion cascade.

## Files touched

- `.github/workflows/ci.yml` (timeout-minutes)
- `backend/tests/setup.ts` (acquireRouteRunFixture / releaseFixture)
- `backend/tests/run.ts` (ensureFixtureSeed)
- `backend/tests/canonical/`: assignments, cleanLogsCanonicalPivot, evidence,
  hazardSeverityCarry, infraIssuesWriteClip, observations, oidCipher,
  presenceSeverityReceiver, riskMapSeverity, roleRenamePhase1Audit, visits (pattern
  conversion + import updates)
- `docs/changelog/ops/2026-07-02-test-harness-hang-fix.md` (this file)
