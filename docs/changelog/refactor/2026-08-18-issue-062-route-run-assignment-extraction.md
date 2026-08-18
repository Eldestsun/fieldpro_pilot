# 2026-08-18 — ISSUE-062: assignment identity extracted off route_runs (app-only sidecar)

## Decision (founder, 2026-08-18 — recorded on the ISSUE-062 card)
Keep the encrypted `core.*_actor_audit` sidecars in `core` (capture integrity:
FK + same-transaction write + RLS + key management is a real justification, not
historical accident). Extract the OPERATIONAL assignment identity off
`public.route_runs` so the run frame carries zero identity columns. After this
change identity has exactly two homes:
1. **Capture integrity** — `core.*_actor_audit` (encrypted, no-grant, break-glass).
2. **Operational routing/display** — `public.route_run_assignment` (NEW, app-role
   only): the plaintext store the app uses to send a specialist their stops and
   show the Lead the assigned crew name.

`route_runs` is now the identity-free operational frame P4-Reporting will read
directly. The line: **assignment visibility in the operational present; no work
attribution in the analytic past.**

## What changed
- **Migration** `backend/migrations/20260818_issue062_route_run_assignment_extraction.sql`
  — creates `public.route_run_assignment` (PK `route_run_id` FK CASCADE, `org_id`,
  `assigned_user_oid`, `created_by_oid`, `assigned_at`, `active`; FORCE-RLS
  `org_isolation`; app-role DML grant; index on `assigned_user_oid`), backfills
  from `route_runs`, then drops `route_runs.assigned_user_oid`,
  `created_by_oid`, **and the never-populated legacy `user_id`**. In-migration
  asserts: no read channel (intelligence_reader / mcp_readonly / audit_reader)
  holds any privilege on the sidecar; `route_runs` carries zero identity columns.
  Idempotent (backfill+drop conditional on source columns existing); runner-recorded.
- **`routeRunService.ts`** — `createRouteRun` writes the identity-free frame, then
  the sidecar row in the same transaction; `user_id` param removed.
  `assignRouteRun` upserts the sidecar (INSERT..SELECT sources `org_id` from the
  frame, so missing/other-org run ⇒ rowCount 0 ⇒ 404 contract preserved) and
  touches the frame's `updated_at`.
- **`loadRouteRunById.ts`** — identity comes via `LEFT JOIN route_run_assignment`;
  the controlled-exception `identity_directory` joins key off the sidecar.
  Response shape unchanged (aliases preserved).
- **`ulRoutes.ts` /ul/todays-run** — stop-routing lookup joins the sidecar.
- **`routeRunRoutes.ts`** — assign endpoint's prev-OID probe reads the sidecar;
  `LEGACY_TRANSIT_USER_ID` constant deleted.
- **`devRoutes.ts`** — seed-axe-fixture writes frame + sidecar; today-run
  idempotency lookup joins the sidecar; route-creation helper no longer forwards
  the legacy `user_id` request param (still accepted for caller compat).
- **`adminRoutes.ts`** — admin route-runs list no longer projects `rr.user_id`.
- **Tests** — fixtures in `loadRouteRunOidTrim.test.ts` / `runtimeIdentityLeak.test.ts`
  write the sidecar. `intelligenceReaderChannel.test.ts`: `route_run_assignment`
  added to the runtime-denial wall list, plus two NEW ISSUE-062 tripwires:
  (1) `route_runs` schema carries zero identity columns; (2) no relation
  intelligence_reader can SELECT projects any `*_oid` / `oid` / `user_id` /
  `actor_ref` column.

## Why
The `route_runs` frame was the weakest link in the labor-safety story: a
reporting-reachable table carrying plaintext worker OIDs. With ISSUE-018 shipped
(intelligence channel runs as `intelligence_reader`, runtime-binding wall), this
extraction completes the structural claim: worker identity is now unreachable
from every analytic surface **by schema absence + grant wall + CI tripwire**,
not by code review. The intelligence path is untouched — the three repointed
readers are all app-role; the intelligence channel never read `route_runs`.

## Verification
- Backend `tsc --noEmit` exit 0.
- Full backend suite **200/200** against the migrated dev DB (includes the two
  new ISSUE-062 tripwires and the extended runtime-denial wall).
- Migration applied to dev via superuser-less path (docker exec as
  `fieldpro_admin`) **with same-session `schema_migrations` recording**
  (ISSUE-038 discipline). Backfill verified: 1 assigned run (4188) carried over;
  frame identity columns = 0.
- **Clean-room deploy gate**: throwaway `postgres:14` container with the real
  `db/init` bootstrap → full chain `npm run migrate` exit 0, zero FAIL/ERROR,
  `20260818_issue062` applied in-chain, fresh frame identity-free, sidecar
  present with correct grants. Re-run applies 0 migrations. Container removed.
- `pg_state.sql` regenerated (gitignored local reference).
- Dev-DB note (smoke discipline): no scaffold data created; the only dev-DB
  change is the migration itself. Local Postgres port collision
  (PG-PORT-COLLISION) worked around via LAN-IP/docker-exec; not modified.

## Follow-ups (not this change)
- Granting `intelligence_reader` SELECT on the now-identity-free `route_runs`
  frame is a future, explicit P4-Reporting decision (the wall test documents this).
- Create-Route base/shift picker fix (ISSUE-062 card "related near-term work")
  now safe to build against the reshaped write path.
- ISSUE-058 Phase 2 (encrypt-at-rest for the sidecar's plaintext OIDs) remains
  gated on Azure Key Vault (ISSUE-060) — the sidecar is app-operational plaintext
  by design, per the approved decision.

## Files touched
- backend/migrations/20260818_issue062_route_run_assignment_extraction.sql (new)
- backend/src/domains/routeRun/routeRunService.ts
- backend/src/domains/routeRun/loaders/loadRouteRunById.ts
- backend/src/modules/work/ulRoutes.ts
- backend/src/modules/routes/routeRunRoutes.ts
- backend/src/modules/admin/adminRoutes.ts
- backend/src/routes/devRoutes.ts
- backend/tests/canonical/intelligenceReaderChannel.test.ts
- backend/tests/canonical/loadRouteRunOidTrim.test.ts
- backend/tests/canonical/runtimeIdentityLeak.test.ts
- docs/changelog/refactor/2026-08-18-issue-062-route-run-assignment-extraction.md
