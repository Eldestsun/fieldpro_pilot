# PR Draft — feat/cleanup-phase-1-ci-test-infra

**Title:** fix(ci): cleanup drain Phase 1 — backend integration tests run on CI

**Base:** main ← **Compare:** feat/cleanup-phase-1-ci-test-infra
**Open at:** https://github.com/Eldestsun/fieldpro_pilot/pull/new/feat/cleanup-phase-1-ci-test-infra

---

## SIGNIFICANCE

Closes the cleanup drain's **Phase 1 gate**: backend integration tests now
execute end-to-end on CI instead of crashing at fixture setup. That safety net
is the precondition for every downstream cleanup dispatch — regressions in
visits/observations/evidence/assignments are now catchable on CI. Closes
ISSUE-022, ISSUE-009, and ISSUE-023; surfaces and files two deeper findings
(ISSUE-024, ISSUE-025) for their proper dispatches.

## WHAT LANDED

**Seed + CI (ISSUE-022, ISSUE-009 — Fixed):**
- `backend/tests/fixtures/seed.sql` — minimal, idempotent reference graph the
  canonical suite assumes (org, asset_type, base, `route_pools` TEST_POOL,
  asset, transit_stop, `core.locations` + `core.location_external_ids`, plus the
  eam-bridge watermark row and two directory users).
- `.github/workflows/ci.yml` — "Seed test fixtures" step after migrations,
  before tests. Seed lives under `tests/`, never `migrations/`.
- 009 was the same root cause as 022 (missing seed, not a broken view); fixed by
  the same seed rows, no fixture/view code change.

**Stale tests (ISSUE-023 — Filed and Fixed, same dispatch):**
- `assignments.test.ts` — drifted inline SQL replaced with a `planAssignments`
  helper reproducing *both* production statements; identity assertion now reads
  `actor_ref` from the `core.assignment_actor_audit` sidecar.
- `oidCipher.test.ts` — integration assertion rewritten to read from
  `core.visit_actor_audit`; kept (not retired) as the only end-to-end test of the
  OID encrypt path. Production was already correct; only the tests had drifted.

**Docs:** ISSUE-022/009 → Fixed; ISSUE-023 Filed-and-Fixed; ISSUE-024/025 filed;
drain plan Phase 1 marked complete; changelog
`docs/changelog/bugfix/2026-06-05-cleanup-phase-1-ci-test-infra.md`.

**Verification:** fresh CI-replica DB → migrate → seed → test = **99 passed, 6
failed** (the 6 are exactly the ISSUE-025 RLS set; zero fixture-setup crashes).
RLS-enforced dev DB = **105 passed, 0 failed**.

## HONEST RESIDUAL

The gate goal ("tests execute," not "all green") is met. **CI is not yet
all-green** — six RLS-enforcement tests stay red, by design, tracked as:

- **ISSUE-024** — latent production defect: `sync_transit_stop_primary_asset`
  inserts into `transit_stop_assets` without its NOT NULL `org_id`. The seed
  works around it (disables the trigger for one write; CI runs as superuser), but
  the trigger itself is unfixed. Needs a dedicated trigger-fix dispatch.
- **ISSUE-025** — CI's `test-backend` connects as a superuser (`POSTGRES_USER=
  fieldpro` ⇒ superuser), bypassing RLS, so six RLS tests can't pass on CI though
  they pass on the RLS-enforced dev DB. The fix (run tests as a non-superuser
  app-like role) is the same decision **ISSUE-018** must make wiring
  `intelligence_reader` into the live app connection — filed to be resolved
  within that Phase 3 dispatch, not re-litigated in a CI dispatch.

`build-frontend` (ISSUE-019) and `dependency-audit` (ISSUE-020) remain red —
separate Phase 2 scope, untouched here.
