# 2026-05-19 — Role rename Phase 1 (code-side dual-accept + identity_directory policy flip + backfill)

## What changed

Phase 1 of the locked role rename completed. Code-side dual-accept landed
and the identity_directory backfill was verified end-to-end. The backfill
required a corollary policy alignment on identity_directory and a
prerequisite fix to one fail-open read path; both are recorded below.

### Locked rename table

| Old name | New name |
|----------|----------|
| `UL`     | `Specialist` |
| `Lead`   | `Dispatch` |
| `Admin`  | `Admin` (unchanged) |

Source of truth: `planning/capability-build/CAPABILITY_BUILD_INDEX.md`
§ "Role Rename (locked)".

### Three-phase migration approach

1. **Phase 1 (this changelog)** — code accepts both old and new role
   strings; DB rows for UL/Lead are backfilled to Specialist/Dispatch
   under the new identity_directory policy.
2. **Phase 2 (founder, manual)** — update Entra app registration's app
   role definitions; reassign the founder's account to the new names.
3. **Phase 3 (later dispatch)** — drop old role strings from all guards,
   collapse `isLead` / `isUL` variable names, add a CHECK constraint on
   `identity_directory.last_seen_role`.

## What actually happened (the real sequence)

### Code-side rename — landed as specified

- `backend/src/authz.ts` — `extractRolesFromClaims` accepts both old and
  new role strings from JWT `roles` claims.
- 25 `requireAnyRole(...)` call sites widened across 8 backend modules.
  The five `["Admin"]`-only governance guards left unchanged
  (admin/exportDelete/tenant/health routes) because Admin is not renamed.
- `backend/src/modules/admin/resourceRoutes.ts:163` — `/api/users` SQL
  filter widened to include Specialist/Dispatch alongside UL/Lead.
- `backend/.env` — `DEV_BYPASS_ROLES` flipped to `Specialist,Dispatch`.
  Middleware is pass-through; no code change required.
- `frontend/src/App.tsx` — `DefaultRedirect`, `isLead` / `isUL`
  derivations, and 7 of 11 `RequireRole` guards widened. Four
  `["Admin"]`-only guards (3 admin-scope panels + `AdminControlCenter`)
  left unchanged — `AdminControlCenter` widened separately under T1-CC.
- `backend/tests/canonical/devAuthBypass.test.ts` — new test that issues
  `Specialist` and `Dispatch` claims and verifies dual-accept guards
  honor them. Old UL/Lead fixtures retained.
- `frontend/src/auth/devAuthBypass.test.ts` — new test that asserts a
  Dispatch claim satisfies the same nav predicate as Lead.
- `PROJECT_CONTEXT.md` terminology table updated. `Specialist` and
  `Dispatch` rows added with rename annotation.
- `Pilot_And_Scale_Strategy.md`, `docs/KNOWN_ISSUES.md`,
  `docs/dev/dev-auth-bypass.md` — prose updated to new role names where
  appropriate.

Test counts after code-side rename: backend 103 → 104 (new Specialist /
Dispatch acceptance test), frontend 24 → 25 (new Dispatch nav predicate
test).

### Backfill — first attempt silently no-op'd (the false success)

The initial migration `backend/migrations/20260519_role_rename_backfill.sql`
contained only the two `UPDATE identity_directory` statements. Applied
via `psql -f` against the local DB by the non-privileged `fieldpro`
role, it reported:

```
UPDATE 0
UPDATE 0
```

And a follow-up `SELECT DISTINCT last_seen_role FROM identity_directory`
returned zero rows. This was reported as success — done-criterion
"`identity_directory.last_seen_role` no longer contains 'UL' or 'Lead'"
appeared trivially satisfied.

### Root-cause investigation

A direct query with `app.current_org_id` set revealed the table actually
held 4 rows:

```
SET app.current_org_id = '1';
SELECT last_seen_role, count(*) FROM identity_directory GROUP BY last_seen_role;
 last_seen_role | count
----------------+-------
 Admin          |     1
 Lead           |     1
 UL             |     1
                |     1
```

`identity_directory` was the lone RLS-protected table in the repo still
on the strict R11 policy shape:

```sql
USING (org_id = current_setting('app.current_org_id', true)::bigint)
```

With `app.current_org_id` unset (the default in a migration session),
the comparison evaluates to NULL, the policy rejects every row, and the
UPDATE silently affects zero rows. Every other RLS-protected table in
the repo had been migrated to the Phase 2 "unset = bypass" symmetric
USING / WITH CHECK pattern by `20260518_rls_phase2_add_orgid.sql`;
identity_directory was missed because R11 (its creation migration)
predated the Phase 2 pattern.

This is one instance of the broader pattern documented as PATTERN-001
in `docs/KNOWN_ISSUES.md` and `CLAUDE.md § RLS Context Gotcha`.

### Prerequisite fix — `loadRouteRunById` fail-open path

The cross-tenant read audit that gated the policy flip found one
fail-open path: `loadRouteRunById` (the route_run detail loader) ran
its queries on a bare `pool.query` connection with `app.current_org_id`
unset. Under the strict R11 policy, this was incidentally fail-closed
on the identity_directory JOIN (returning NULL `assigned_user_name` /
`created_by_name` silently — a latent display bug). After the planned
policy flip, the same code path would have started returning identity
rows via the policy bypass — turning the display bug into a structural
fail-open.

Fixed in commit `25aecf8` before the policy flip:

- `loadRouteRunById(id)` → `loadRouteRunById(id, orgId)`.
- Both internal queries collapsed into one `withOrgContext(orgId, ...)`
  block on a single pool client.
- All 9 callers updated to thread `orgId` (8 via `req.user.org_id` /
  `resolveNumericOrgId`, 1 dev endpoint via the helper's fallback).
- Fail-closed proof: `backend/tests/canonical/loadRouteRunById.test.ts`
  seeds a real second org B with a route_run, asserts org A receives
  `null`, and asserts org B receives the row.
- Incidentally fixed the blank-assignee-name display bug.

See `docs/changelog/bugfix/2026-05-21-load-route-run-by-id-org-scoped.md`.

### Manifest drift discovered (ISSUE-014)

Resuming the backfill via the normal migration runner (`npm run migrate`)
failed mid-stream: phase 2 of the RLS migration set (`ADD COLUMN org_id
bigint` on 14 tables) errored because the columns already existed. The
DB had phase 2 and phase 3's effects applied (via out-of-band `psql -f`
during their original sprint) but `schema_migrations` only recorded
phase 1. The migration runner was not a faithful record of DB state.

Before stamping the missing rows, verified the full footprint of both
phases:

- **Phase 2** — all 14 tables (`asset_external_ids`, `clean_logs`,
  `hazards`, `infrastructure_issues`, `lead_route_overrides`,
  `level3_logs`, `route_run_stops`, `stop_condition_history`,
  `stop_effort_history`, `stop_photos`, `stop_risk_snapshot`,
  `stops_legacy`, `transit_stop_assets`, `trash_volume_logs`)
  confirmed: `org_id bigint NOT NULL`, RLS enabled+forced,
  `org_isolation` policy with symmetric COALESCE/NULLIF USING +
  WITH CHECK.

- **Phase 3** — Part A (`audit_log.org_id` bigint NOT NULL,
  three corrected policies, `audit_log_org_occurred` index,
  `organizations.tenant_uuid` populated for KCM), Part B
  (`core.asset_locations` + `core.location_external_ids` WITH CHECK
  added), Part C (`route_runs.shift_type` column + CHECK), Part D
  (`stop_pool_memberships` table + RLS + policy + index + PK +
  14,916 rows matching transit_stops.pool_id) — all present.

Stamped both into `schema_migrations` with `applied_at = '2026-05-18'`
to reflect the original out-of-band apply date. Documented in
`docs/KNOWN_ISSUES.md` ISSUE-014, with the latent re-runnability
fragility deferred to pre-pilot ops hardening.

### identity_directory policy flip + backfill (single transaction)

Migration `backend/migrations/20260519_role_rename_backfill.sql`
rewritten to do both in one transaction:

```sql
BEGIN;

DROP POLICY IF EXISTS org_isolation ON public.identity_directory;
CREATE POLICY org_isolation ON public.identity_directory
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

UPDATE public.identity_directory SET last_seen_role = 'Specialist' WHERE last_seen_role = 'UL';
UPDATE public.identity_directory SET last_seen_role = 'Dispatch'   WHERE last_seen_role = 'Lead';

COMMIT;
```

`FORCE ROW LEVEL SECURITY` remains on the table throughout. The brief
in-transaction window between `DROP POLICY` and `CREATE POLICY` has no
policy attached — PostgreSQL defaults to deny-all under FORCE RLS in
that state, so the in-flight state is fail-closed. App request paths
continue to set `app.current_org_id` via `withOrgContext()`, so live
tenant isolation is unchanged.

Applied via `npm run migrate`, recorded at `2026-05-22 03:47:15` UTC.

### Verification — backfill actually moved the rows

```
POST-STATE (with app.current_org_id = '1'):
 last_seen_role | count
----------------+-------
 Admin          |     1   (unchanged)
 Dispatch       |     1   (from Lead)
 Specialist     |     1   (from UL)
                |     1   (NULL row unchanged)
```

```
POLICY DEFINITION (post-flip):
policyname | org_isolation
cmd        | ALL
qual       | ((COALESCE(current_setting('app.current_org_id', true), '') = '')
              OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint))
with_check | (same shape, no longer NULL)
```

Test suite after the policy flip: backend 104 / 0, frontend 25 / 0.

## Out of scope (explicit, untouched)

- Entra app-registration changes (Phase 2, founder task).
- Removing old role strings from guards (Phase 3).
- Renaming `isLead` / `isUL` variables in App.tsx (Phase 3).
- Adding a CHECK constraint on `identity_directory.last_seen_role` (Phase 3).
- Making the migration set re-runnable (deferred to pre-pilot ops; see ISSUE-014).
- Hardening `resolveNumericOrgId` against the multi-org fail-open
  (deferred to pre-multi-org hardening; see ISSUE-013).

## Why dual-accept despite single-user dev environment

Dev-only environment, zero concurrent users besides the founder, so
dual-accept is not a runtime requirement here. It is **staged
migration discipline**: each phase is independently reversible, and a
single bad commit cannot lock the founder out mid-rename. The same
discipline will be a runtime requirement on the KCM pilot tenant;
rehearsing it here is cheap insurance.

## Files touched

### Backend
- `backend/src/authz.ts`
- `backend/src/modules/admin/resourceRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routeOverrides/routeOverrideRoutes.ts`
- `backend/src/modules/work/stopRoutes.ts`
- `backend/src/modules/work/uploadRoutes.ts`
- `backend/tests/canonical/devAuthBypass.test.ts`
- `backend/.env` (gitignored; `DEV_BYPASS_ROLES` flipped)
- `backend/migrations/20260519_role_rename_backfill.sql` (new — policy flip + backfill)

### Frontend
- `frontend/src/App.tsx`
- `frontend/src/auth/devAuthBypass.test.ts`

### Docs
- `CLAUDE.md` (RLS Context Gotcha section + changelog directory table)
- `PROJECT_CONTEXT.md` (terminology table)
- `Pilot_And_Scale_Strategy.md`
- `docs/dev/dev-auth-bypass.md`
- `docs/KNOWN_ISSUES.md` (ISSUE-004/012 prose touches + PATTERN-001 + ISSUE-014)

## Forward pointers

- **Phase 2 (founder, manual):** update Entra app role definitions to
  `Specialist` / `Dispatch` / `Admin`; reassign founder. Blocks T1-CC
  deploy per `CAPABILITY_BUILD_INDEX.md` founder-to-dos.
- **Phase 3 (later dispatch):** dual-accept removal, variable rename,
  `last_seen_role` CHECK constraint.

## Related

- `docs/changelog/bugfix/2026-05-21-load-route-run-by-id-org-scoped.md`
  (prerequisite fail-open fix; commit `25aecf8`).
- `docs/KNOWN_ISSUES.md` PATTERN-001 (the RLS-context-must-be-set rule),
  ISSUE-013 (resolveNumericOrgId multi-org fail-open),
  ISSUE-014 (manifest drift reconciled).
- `CLAUDE.md § RLS Context Gotcha` (authoritative rule).
