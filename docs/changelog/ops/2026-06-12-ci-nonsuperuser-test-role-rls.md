# 2026-06-12 — CI: run backend tests as a non-superuser role so RLS is enforced (ISSUE-025)

## What changed
- Added a `Create non-superuser test role (RLS enforcement — ISSUE-025)` step to the
  `test-backend` job in `.github/workflows/ci.yml`, after `Seed test fixtures` and
  before `Run tests`. It runs as the superuser `fieldpro` and creates role
  `fieldpro_test` as `LOGIN ... NOSUPERUSER NOBYPASSRLS INHERIT`, then
  `GRANT fieldpro TO fieldpro_test` so the new role inherits all of `fieldpro`'s
  object privileges via role membership — the faithful "same grants minus superuser."
- Repointed the `Run tests` step's `DATABASE_URL` from `fieldpro` to `fieldpro_test`
  (`postgres://fieldpro_test:fieldpro_test_pass@localhost:5432/fieldpro_test`).
- Left `Run migrations` and `Seed test fixtures` connecting as the superuser
  `fieldpro` (unchanged) — they must create schema and seed reference rows across
  orgs, which legitimately needs RLS bypass.

## Why
- The `postgres:14` CI service image makes `POSTGRES_USER=fieldpro` a **superuser**.
  Superusers bypass RLS even on `FORCE ROW LEVEL SECURITY` tables, so six
  RLS-enforcement tests — `audit_log` RLS (×2), `audit_log_delete` policy (×3),
  `loadRouteRunById` cross-tenant fail-closed (×1) — passed on CI only because RLS
  was being bypassed, the inverse of what they assert. Locally `fieldpro` is a
  non-superuser, so the same tests pass for the right reason.
- Running the test connection as a non-superuser, non-`BYPASSRLS` role makes CI
  mirror the app's runtime privilege posture, so RLS is actually enforced and the
  six tests pass because cross-tenant rows are genuinely hidden / writes genuinely
  blocked.
- The role-membership approach (`GRANT fieldpro TO fieldpro_test`) was chosen over
  enumerating per-schema grants because it auto-covers every object the migrations
  create (current and future) without coupling CI to a hand-maintained grant list.

## Verification (pre-commit, local)
- Empirically proved the PostgreSQL semantics on an isolated, self-cleaning scratch
  table before shipping: a `NOSUPERUSER NOBYPASSRLS` role that is a member (INHERIT)
  of the table-owner role inherits the owner's table privileges but is still filtered
  by `FORCE RLS`. With `app.current_org_id=100` the role saw only its own row; with a
  foreign org context it saw **0** rows (cross-tenant hidden). `rolsuper=f`,
  `rolbypassrls=f` confirmed on the connecting role. Scratch objects dropped; nothing
  left behind.
- This is the exact enforcement the six red tests assert.

## Scope / non-goals
- CI configuration only. Does **not** touch `backend/src/db.ts`, the application
  connection pool, `intelligence_reader`, or any application code.
- Does **not** resolve the runtime app-connection role decision (ISSUE-018). ISSUE-025's
  "resolve within ISSUE-018" note concerns which role the *running app* uses;
  this change only makes CI's *test* connection non-superuser so RLS-enforcement tests
  can run for the right reason. The two are independent: CI being honest about RLS does
  not pre-commit the runtime-role architecture.

## Files touched
- `.github/workflows/ci.yml`
- `docs/changelog/ops/2026-06-12-ci-nonsuperuser-test-role-rls.md` (this file)
