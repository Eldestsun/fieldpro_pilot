# 2026-06-05 — Cleanup drain Phase 1: backend integration tests run on CI

Gate dispatch for the pre-capability cleanup drain (`planning/CLEANUP_DRAIN_PLAN.md`
Phase 1). Goal: backend integration tests **execute** on CI — the safety net every
downstream cleanup dispatch relies on. Branch: `feat/cleanup-phase-1-ci-test-infra`.

## What changed

- **ISSUE-022 (Fixed)** — CI's `test-backend` created schema but no seed data, so every
  fixture-backed canonical test crashed at setup (`route_pool_id TEST_POOL not found`,
  raised by the `enforce_route_runs_pool_invariant` trigger). Added
  `backend/tests/fixtures/seed.sql` — a minimal, idempotent (`ON CONFLICT DO NOTHING`)
  reference graph (organizations, asset_types, bases, `route_pools` `TEST_POOL`, assets,
  transit_stops, `core.locations`, `core.location_external_ids`, plus the rows the
  non-route-run tests need) — and a "Seed test fixtures" step to `ci.yml`, after
  "Run migrations" and before "Run tests". Seed lives under `tests/`, never
  `migrations/`.
- **ISSUE-009 (Fixed)** — the fixture stop→location mapping (`FIXTURE_STOP_ID 31150` →
  `location_id`) resolves correctly on the current schema *given data*; it was the same
  root cause as 022 (missing seed), not a broken view or fixture. Fixed by the same seed
  (`core.locations` + `core.location_external_ids` rows). No `tests/setup.ts` or view
  code change.
- **ISSUE-023 (Filed and Fixed, same dispatch)** — once the seed let the suite execute,
  five tests failed referencing identity columns dropped by the sidecar extraction
  (`b56c0bf`). Production was already correct (writes identity to the no-grant sidecars);
  only the tests had drifted. `assignments.test.ts`: replaced the drifted inline
  `ASSIGNMENT_INSERT_SQL` snapshot with a `planAssignments` helper reproducing *both*
  production statements (the `core.assignments` INSERT and the
  `core.assignment_actor_audit` sidecar INSERT); the identity assertion now reads
  `actor_ref` from the sidecar. `oidCipher.test.ts`: rewrote the integration assertion to
  read `actor_ref`/`actor_ref_ciphertext`/`actor_ref_key_id` from `core.visit_actor_audit`
  (kept, not retired — it's the only end-to-end test of the OID encrypt path).

## Findings surfaced (filed for their proper dispatches, not fixed here)

- **ISSUE-024 (filed, Open)** — latent production defect: the
  `sync_transit_stop_primary_asset` trigger inserts into `transit_stop_assets` without its
  `NOT NULL org_id`, so any `asset_id` write on `transit_stops` crashes; its
  `ON CONFLICT DO UPDATE` also fails to self-heal inside plpgsql. Discovered while seeding
  `transit_stops`. The seed works around it (disables the trigger for its single
  `asset_id` write; CI runs as the postgres container superuser); the trigger itself needs
  a dedicated fix to derive `org_id` from the stop.
- **ISSUE-025 (filed, Open)** — CI's `test-backend` connects as `fieldpro`, which the
  postgres image makes a **superuser**, so RLS is bypassed and six RLS-enforcement tests
  (audit_log RLS, audit_log_delete policy, loadRouteRunById cross-tenant) stay red on CI
  while passing on the RLS-enforced dev DB. The fix (run tests as a non-superuser app-like
  role) is the same decision **ISSUE-018** makes when wiring `intelligence_reader` into the
  live app connection, and is filed to be resolved within that Phase 3 dispatch — not
  re-litigated in a CI dispatch.

## Why

- Phase 1 is the gate: no downstream cleanup dispatch has a regression safety net until the
  integration suite runs on CI. Criterion is "tests execute," not "all green."
- Scope discipline: stale-test fixes (023) and seed extension are the same *shape* as the
  seed work and were folded in; the trigger bug (024) and CI-role/RLS decision (025) are a
  different *kind* of work (a prod defect; an architecture decision intersecting ISSUE-018)
  and were filed for their proper scopes.

## Verification

Faithful CI replication (fresh `fieldpro_test_ci` → `pnpm run migrate` → `seed.sql` →
`pnpm test`): **99 passed, 6 failed** — the six are exactly the ISSUE-025 RLS-bypass set;
zero `TEST_POOL`/`missing location_id` fixture-setup crashes. On the RLS-enforced local dev
DB the full suite is **105 passed, 0 failed**, confirming the 023 rewrites are correct under
RLS and that the six CI reds are purely the superuser-bypass (ISSUE-025).

## Files touched

- `backend/tests/fixtures/seed.sql` (new)
- `.github/workflows/ci.yml` ("Seed test fixtures" step)
- `backend/tests/canonical/assignments.test.ts` (`planAssignments` helper; sidecar assertion)
- `backend/tests/canonical/oidCipher.test.ts` (read from `core.visit_actor_audit`)
- `docs/KNOWN_ISSUES.md` (ISSUE-022/009 → Fixed; ISSUE-023 Filed-and-Fixed; ISSUE-024/025 filed)
- `planning/CLEANUP_DRAIN_PLAN.md` (Phase 1 marked complete with gate-met note)
