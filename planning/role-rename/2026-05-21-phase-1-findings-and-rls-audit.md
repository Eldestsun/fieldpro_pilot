# Role Rename Phase 1 — Dispatch Report & RLS Backfill Audit

> **Status:** Phase 1 code-side changes complete and tested. DB backfill blocked pending resolution of one fail-open path (`loadRouteRunById`) and a policy-shape consistency fix on `identity_directory`. Nothing committed yet.
> **Author:** Agent dispatch, 2026-05-21
> **Branch:** `refactor/baseline`

---

## 1. What Was Built (Phase 1 — Code Side)

### Locked rename table

| Old name | New name |
|----------|----------|
| `UL`     | `Specialist` |
| `Lead`   | `Dispatch` |
| `Admin`  | `Admin` (unchanged) |

Source of truth: `planning/capability-build/CAPABILITY_BUILD_INDEX.md` § "Role Rename (locked)".

### Three-phase migration approach

1. **Phase 1 (this dispatch)** — code accepts both old and new role strings. Lands first so Entra reassignment cannot lock the founder out.
2. **Phase 2 (founder, manual)** — update Entra app registration's app role definitions; reassign the founder's account to the new names.
3. **Phase 3 (later dispatch)** — drop old role strings from all guards, collapse `isLead`/`isUL` variable names to `isDispatch`/`isSpecialist`, and add a CHECK constraint on `identity_directory.last_seen_role`.

### Why dual-accept despite single-user dev environment

Dev-only environment, zero concurrent users besides the founder, so the dual-accept window is not a runtime requirement for backwards compatibility. It is **staged migration discipline**: each phase is independently reversible, and a single bad commit cannot lock the founder out of the application mid-rename. The same discipline is what will be used on the eventual KCM pilot tenant, where dual-accept *will* be a runtime requirement; rehearsing it here is cheap insurance.

---

## 2. Changes Made (file by file)

### Backend

- **`backend/src/authz.ts`**
  - Added `APP_ROLE_DISPATCH = "Dispatch"` and `APP_ROLE_SPECIALIST = "Specialist"` constants.
  - Widened `extractRolesFromClaims` to honor both old and new role strings arriving in JWT `roles` claims:
    ```ts
    const accepted = [APP_ROLE_ADMIN, APP_ROLE_LEAD, APP_ROLE_UL, APP_ROLE_DISPATCH, APP_ROLE_SPECIALIST];
    ```
  - Group-claim path left as-is (still maps to old names) — Phase 3 will collapse.

- **25 `requireAnyRole(...)` call sites widened** across 8 modules:
  - `backend/src/modules/admin/resourceRoutes.ts` (2)
  - `backend/src/modules/work/stopRoutes.ts` (3)
  - `backend/src/modules/work/ulRoutes.ts` (4 — includes `/ul/inbox`)
  - `backend/src/modules/work/uploadRoutes.ts` (1)
  - `backend/src/modules/work/routeRunStopRoutes.ts` (3)
  - `backend/src/modules/routes/routeRunRoutes.ts` (9 — includes `/lead/hub`)
  - `backend/src/modules/routeOverrides/routeOverrideRoutes.ts` (1)
  - `backend/src/modules/ops/opsRoutes.ts` (1)
  - Patterns applied:
    - `["UL", "Lead", "Admin"]` → `["UL", "Specialist", "Lead", "Dispatch", "Admin"]` (11 sites)
    - `["Lead", "Admin"]` → `["Lead", "Dispatch", "Admin"]` (11 sites)
    - `["UL"]` → `["UL", "Specialist"]` (1 site)
    - `["Lead"]` → `["Lead", "Dispatch"]` (1 site)
  - Five `["Admin"]`-only guards intentionally left unchanged (admin/exportDelete/tenant/health routes) — Admin is not renamed.

- **`backend/src/modules/admin/resourceRoutes.ts:163`** — `/api/users` SQL filter widened:
  ```sql
  -- before
  WHERE last_seen_role IN ('UL', 'Lead')
  -- after
  WHERE last_seen_role IN ('UL', 'Specialist', 'Lead', 'Dispatch')
  ```

- **`backend/.env`** — `DEV_BYPASS_ROLES` flipped from `UL,Lead` to `Specialist,Dispatch`. Middleware itself is pass-through, no code change required.

- **`backend/tests/canonical/devAuthBypass.test.ts`** — existing `UL`/`Lead` fixtures retained; added a new test that issues `Specialist` and `Dispatch` claims and verifies both pass the dual-accept guards.

### Frontend

- **`frontend/src/App.tsx`**
  - `DefaultRedirect`: `/routes` branch now also fires on `Dispatch`:
    ```tsx
    if (roles.includes("Lead") || roles.includes("Dispatch")) return <Navigate to="/routes" replace />;
    ```
  - `isLead` / `isUL` derivations widened to honor both names. Variable names preserved per Phase 1 spec; Phase 3 renames them:
    ```tsx
    const isLead = roles.includes("Lead") || roles.includes("Dispatch");
    const isUL = roles.includes("UL") || roles.includes("Specialist");
    ```
  - 7 of 11 `RequireRole` guards widened. The four `["Admin"]`-only guards (3 admin-scope panels + `AdminControlCenter`) were left unchanged — `AdminControlCenter` is widened separately as part of T1-CC relocation, not this rename.

- **`frontend/src/auth/devAuthBypass.test.ts`** — existing `UL`/`Lead` fixtures retained; added a `Dispatch` round-trip test asserting the same nav predicate used in `App.tsx` (`isLead`/DefaultRedirect) returns true for a Dispatch claim, identical to a Lead claim.

### Database (migration written but NOT yet effective — see §4)

- **`backend/migrations/20260519_role_rename_backfill.sql`** (new file):
  ```sql
  UPDATE identity_directory SET last_seen_role = 'Specialist' WHERE last_seen_role = 'UL';
  UPDATE identity_directory SET last_seen_role = 'Dispatch'   WHERE last_seen_role = 'Lead';
  ```
  Applied locally; reported `UPDATE 0 / UPDATE 0`. **This was a false success — see §3.**

### Documentation

- **`PROJECT_CONTEXT.md`** — terminology table updated. `Specialist` and `Dispatch` rows added with explicit "renamed from UL/Lead during the role-rename workstream" notes.
- **`Pilot_And_Scale_Strategy.md`** — "Field UI for all route specialists" block updated.
- **`docs/KNOWN_ISSUES.md`** — two issue prose mentions of `UL` and `Lead` renamed.
- **`docs/dev/dev-auth-bypass.md`** — localStorage example and Playwright snippet updated to use `Specialist`.

### Out of scope (explicit, untouched)

- Entra app-registration changes (Phase 2, founder).
- Removing old role strings from guards (Phase 3).
- Renaming `isLead` / `isUL` variables in App.tsx (Phase 3).
- Historical changelog files, S2 policy documents.
- Files under `planning/refactor/`, `planning/refinement/`, `planning/security/`.
- Specs under `planning/capability-build/specs/` — already use new names.

### Test results

- **Backend:** 103 passed / 0 failed — includes new `requireAnyRole accepts new role strings (Specialist, Dispatch)` test.
- **Frontend:** 25 passed / 0 failed across 4 test files — includes new `Dispatch satisfies the same nav predicate as Lead` test.

### Changelog written

`docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md`

(Capability-build subdirectory created as agreed in planning.)

---

## 3. Discovery — Silent UPDATE 0 Trap

### What was reported as success

```
$ psql -f backend/migrations/20260519_role_rename_backfill.sql
UPDATE 0
UPDATE 0

$ psql -c "SELECT DISTINCT last_seen_role FROM identity_directory;"
 last_seen_role
----------------
(0 rows)
```

Done-criterion "no longer contains `UL` or `Lead`" appeared to be satisfied trivially because the table appeared empty.

### What was actually happening

User flagged this as wrong — `identity_directory` should not have been empty. Investigation found:

**Root cause:** `identity_directory` has `FORCE ROW LEVEL SECURITY` with an `org_isolation` policy that requires `app.current_org_id` to be set on the connection. The `fieldpro` role has neither `rolsuper` nor `rolbypassrls`, so RLS is enforced. Both my pre-check and the backfill `UPDATE` ran without org context set, so they saw **and updated** zero rows — even though the table actually contains 4.

```
$ psql -c "SET app.current_org_id = '1'; SELECT COUNT(*), array_agg(DISTINCT last_seen_role) FROM identity_directory;"
 count |        roles
-------+----------------------
     4 | {Admin,Lead,UL,NULL}
```

**The backfill did not actually run on any rows.** The `UPDATE 0` result was the RLS policy silently filtering out every candidate row from the UPDATE's row visibility, not an empty table. The done-criterion was not met.

This is the exact same trap as ISSUE-005 (the `/api/users` empty-dropdown bug documented in `docs/KNOWN_ISSUES.md:184` — fix: wrap query in `withOrgContext`).

### Investigation findings against four diagnostic questions

1. **`docs/changelog/security/2026-05-13-s1-4-export-and-delete.md`** — does *not* mention `identity_directory` at all. Export-and-delete is not the culprit.
2. **`grep TRUNCATE | DELETE FROM identity_directory`** across `backend/` — no hits. Nothing in app code or migrations destructively touches this table. Identity rows are written only via the non-blocking `upsertIdentity` in `backend/src/authz.ts:114`.
3. **Docker volume `fieldpro-pilot_db_data`** created `2025-08-15T22:01:15Z`. Predates this dispatch by months; volume itself is healthy.
4. **`git log -- backend/migrations/`** — no commit drops or recreates `identity_directory` recently. Most relevant: `e27d9b0 feat: R11 multi-tenant hardening — identity isolation, RLS gaps, NOT NULL enforcement` — the commit that *added* `FORCE RLS` to the table. That's what trips the verification query.

---

## 4. RLS Backfill Pattern Investigation

### Migration runner connection

`backend/src/scripts/migrate.ts` reads connection config from env (`DATABASE_URL` or `PG*` vars). Per `backend/.env.example:4-6` and `:70-71`, the runner authenticates as `PGUSER=fieldpro` — **the same app role the backend uses**, not a privileged migrator role.

### Runner role privileges

```
 rolname  | rolsuper | rolbypassrls
----------+----------+--------------
 fieldpro | f        | f
```

No superuser, no `BYPASSRLS`. The migration runner has **exactly the same RLS visibility as the live app** — it cannot see rows behind a `USING` clause that returns false.

### Table ownership

`identity_directory` is owned by `fieldpro`. Normally a table owner bypasses RLS by default — but the table has `FORCE ROW LEVEL SECURITY` enabled (`relforcerowsecurity = t`), which applies the policy to the owner too. **Ownership grants no bypass.** Running `SET row_security = off` is not an option for non-privileged roles either.

### Established repo pattern (the key finding)

Two migrations have already crossed this exact terrain, and the repo's pattern is consistent:

**`backend/migrations/legacy_20260513_r11_identity_directory_org.sql`** (R11, the migration that created `identity_directory.org_id`):
- Steps 1–2: add column nullable, backfill, then NOT NULL.
- Steps 3–5: **only after the backfill is complete** does it `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- Pattern: *RLS off during backfill, on after.*

**`backend/migrations/20260518_rls_phase2_add_orgid.sql`** (Tier 7 / RLS Phase 2 — added org_id + RLS to 14 public tables):
- Same shape per table — backfill while RLS is still off.
- But critically, when it creates each `org_isolation` policy, it uses a **different shape** than R11 did:

  ```sql
  CREATE POLICY org_isolation ON public.X
    USING (
      COALESCE(current_setting('app.current_org_id', true), '') = ''
      OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
    )
    WITH CHECK ( ... same shape ... );
  COMMENT ON POLICY org_isolation ON public.X IS
    'Phase 2 tenant isolation. ... Migrations bypass via unset variable.';
  ```

  When `app.current_org_id` is **unset** (the default in any migration session), `COALESCE(...,'') = ''` is true → the policy returns true → all rows visible/updatable. App always sets the variable via `withOrgContext()`, so request-path queries remain tenant-isolated. The header comment (line 9-11) of that file makes this explicit and intentional:

  > `Policy pattern matches Phase 1: unset app.current_org_id bypasses the policy (migration / seed bypass). Application request paths always set the variable via withOrgContext().`

### Why identity_directory is the odd one out

`identity_directory`'s policy was created by R11 (May 13), **before** the "unset = bypass" pattern was established by the Phase 2 migration (May 18). Its policy is the strict form:

```sql
USING (org_id = current_setting('app.current_org_id', true)::bigint)
```

When `app.current_org_id` is unset, `current_setting(..., true)` returns `NULL`, the comparison evaluates to `NULL` (not true), and the policy rejects every row. That is why the backfill silently ran against zero rows. **`identity_directory` is the only RLS-protected table in the repo without the migration-bypass shape.** Every other RLS table got the Phase 2 treatment; this one was missed because it already had RLS by then.

### Repo-consistent fix (not yet implemented)

Bring `identity_directory`'s policy in line with Phase 2 — `DROP POLICY` + `CREATE POLICY` with the `COALESCE/NULLIF` shape (and add explicit `WITH CHECK`) — then re-run the role-rename UPDATEs in the same transaction. Benefits:

- Backfill works as written, on any number of orgs (it's a flat UPDATE; no per-org loop needed).
- All future migrations against `identity_directory` get the same bypass as every other RLS table — no more silent UPDATE 0 traps.
- App request paths remain tenant-isolated because they always set `app.current_org_id` via `withOrgContext()`.

This is structural cleanup, not a one-shot workaround — and it matches a pattern already documented and applied 14 times in `20260518_rls_phase2_add_orgid.sql`.

---

## 5. Pre-Flip Safety Audit (the gate)

User imposed three checks before any policy flip on the identity/role table.

### Check 1 — Cross-tenant read audit (the gate)

The COALESCE/NULLIF "unset = bypass" shape means any connection NOT setting `app.current_org_id` sees ALL orgs' rows. Audit of every code path that touches `identity_directory`:

| # | File:line | SQL | Connection | Status |
|---|-----------|-----|------------|--------|
| 1 | `backend/src/authz.ts:114` | `INSERT INTO identity_directory ...` | `withOrgContext(orgId, async (client) => client.query(...))` (lines 100-111, explicitly documented at 110) | ✅ Org-scoped |
| 2 | `backend/src/modules/admin/resourceRoutes.ts:162` | `SELECT ... FROM identity_directory` (the `/api/users` endpoint) | `withOrgContext(numericOrgId, (client) => client.query(query))` | ✅ Org-scoped |
| 3 | `backend/src/domains/routeRun/loaders/loadRouteRunById.ts:66-67, 97-98` | `LEFT JOIN identity_directory id_dir ON id_dir.oid = rr.assigned_user_oid` + `LEFT JOIN identity_directory creator ...` | **`pool.query(query, [id])` — bare pool, no `withOrgContext`** | ❌ **Raw connection** |

**Site #3 is the fail-open path.** `loadRouteRunById` runs on a fresh pool connection with `app.current_org_id` unset. Behavior today vs. after flip:

- **Today (strict policy):** the JOIN to identity_directory filters to NULL on every row (because `org_id = NULL::bigint` is NULL, not true). So `assigned_user_name`, `assigned_user_role`, `created_by_name` come back NULL silently. **This is likely an existing, unreported display bug** — names showing as blank on route-run detail surfaces. The strict policy was incidentally protecting against the missing-org-context bug by failing closed.
- **After flip (unset = bypass):** the JOIN starts resolving. On this specific query that's actually a *fix* for the missing names. But the policy bypass is what makes it work, which is exactly the "fail open" surface this audit was designed to catch.

**Severity assessment of the leak under the new policy:**

- The JOIN is **OID-keyed against a specific `route_runs` row**. It cannot synthesize cross-tenant data on its own; for any one route_run the JOIN returns exactly that worker's identity row.
- The leak vector is the **outer** `route_runs` row: `loadRouteRunById(id)` selects by primary key. A caller who can pass any numeric `id` could fetch the route_run (and now the assigned worker's display name) from any org.
- `route_runs` already has the Phase 2 "unset = bypass" policy applied (per `20260518_rls_phase2_add_orgid.sql`), so the **same fail-open already exists on `route_runs` itself today** — independent of identity_directory. The repo's documented Phase 2 position accepts this because all callers are expected to flow through `withOrgContext()`. `loadRouteRunById` violates that contract.
- Callers of `loadRouteRunById` (per grep, 9 sites) are all behind `requireAuth + requireAnyRole(...)` route handlers. Route guard limits exposure to authenticated users, but there is no application-layer org check on the `id` parameter.

**Callers of `loadRouteRunById`:**
- `backend/src/domains/routeRun/routeRunService.ts:473, 496`
- `backend/src/modules/work/ulRoutes.ts:132`
- `backend/src/modules/work/routeRunStopRoutes.ts:284, 548`
- `backend/src/modules/routes/routeRunRoutes.ts:195, 220, 700, 874, 1059`
- `backend/src/routes/devRoutes.ts:212`

### Check 2 — WITH CHECK fidelity

Current policy definition in full:

```
schemaname | public
tablename  | identity_directory
policyname | org_isolation
permissive | PERMISSIVE
roles      | {public}
cmd        | ALL
qual       | (org_id = (current_setting('app.current_org_id'::text, true))::bigint)
with_check | (null)
```

`cmd = ALL`, `with_check IS NULL`. **PostgreSQL rule:** when `WITH CHECK` is omitted on a policy that covers writes, it defaults to the `USING` expression. So writes are currently also gated by `org_id = current_setting(...)::bigint`.

To preserve write protection faithfully, the replacement policy must explicitly include a `WITH CHECK` clause mirroring the new `USING` — the Phase 2 pattern already does this:

```sql
USING (
  COALESCE(current_setting('app.current_org_id', true), '') = ''
  OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
)
WITH CHECK (
  COALESCE(current_setting('app.current_org_id', true), '') = ''
  OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
);
```

Symmetric USING and WITH CHECK preserves:
- (a) For connections with the var set, same row-isolation behavior as today.
- (b) For connections with the var unset (migrations only, per contract), full bypass for both reads and writes.
- The only semantic delta is the unset-bypass — exactly the intended change, nothing else.

### Check 3 — Transactional atomicity

Planned migration follows the Phase 2 template verbatim:

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
COMMENT ON POLICY org_isolation ON public.identity_directory IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

UPDATE public.identity_directory SET last_seen_role = 'Specialist' WHERE last_seen_role = 'UL';
UPDATE public.identity_directory SET last_seen_role = 'Dispatch'   WHERE last_seen_role = 'Lead';

COMMIT;
```

`DROP POLICY` + `CREATE POLICY` are both DDL and run inside the same transaction. `FORCE ROW LEVEL SECURITY` is unchanged on the table the whole time, and there is never a committed state where the table has FORCE RLS with no policy attached. If anything in the block fails, the entire transaction rolls back and the current strict policy is preserved.

**In-flight state safety:** There is a brief in-transaction window between DROP and CREATE where, from inside the transaction, no policy is in effect. PostgreSQL's behavior here with `FORCE RLS` on and no policy: **all rows are denied** — fail-closed, not fail-open. Even the in-flight state is safe.

---

## 6. Gate Verdict

**Check 1 did NOT come back clean.** `loadRouteRunById` reads `identity_directory` on a raw pool connection without setting `app.current_org_id`. By the user's gate rule, that must be fixed before the policy flip lands.

### Recommended sequencing

1. **First dispatch (small, surgical):** wrap `loadRouteRunById`'s `pool.query` calls in `withOrgContext`. Requires plumbing an `orgId` from the caller; given all 9 callers are inside route handlers behind `requireAuth`, `req.user.org_id` is available. This dispatch also **incidentally fixes the latent NULL-name display bug** caused by the strict policy filtering identity rows out of the JOIN.
2. **Second dispatch (this one, resumed):** policy flip + role-rename backfill in a single transaction.

### Alternative (not recommended)

Proceed with policy flip and accept that `loadRouteRunById` becomes a documented fail-open path identical to the existing Phase 2 surface on `route_runs`. Not recommended because:
- It widens the trust surface on the identity table specifically — the one table the labor-safety architecture is most sensitive about.
- The fix is small and low-risk.
- Sequencing is straightforward.

---

## 7. State of the Working Tree

Nothing committed. Pre-existing uncommitted changes (`.gitignore`, `CLAUDE.md`, `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md`) are unrelated to this dispatch and should not be staged with these changes.

### Files modified by this dispatch (tracked)

```
backend/src/authz.ts
backend/src/modules/admin/resourceRoutes.ts
backend/src/modules/ops/opsRoutes.ts
backend/src/modules/routeOverrides/routeOverrideRoutes.ts
backend/src/modules/routes/routeRunRoutes.ts
backend/src/modules/work/routeRunStopRoutes.ts
backend/src/modules/work/stopRoutes.ts
backend/src/modules/work/ulRoutes.ts
backend/src/modules/work/uploadRoutes.ts
backend/tests/canonical/devAuthBypass.test.ts
frontend/src/App.tsx
frontend/src/auth/devAuthBypass.test.ts
PROJECT_CONTEXT.md
Pilot_And_Scale_Strategy.md
docs/KNOWN_ISSUES.md
docs/dev/dev-auth-bypass.md
```

### Files modified by this dispatch (untracked, .env)

```
backend/.env  (DEV_BYPASS_ROLES flipped — gitignored, not tracked)
```

### New files

```
backend/migrations/20260519_role_rename_backfill.sql  (currently a no-op against locked rows; needs to be rewritten as part of the resumed dispatch with policy flip + backfill in one transaction)
docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md  (written; will need an addendum once the DB step actually lands)
```

---

## 8. Open Questions for the User

1. **Greenlight the `loadRouteRunById` pre-fix dispatch?** Wrap its `pool.query` calls in `withOrgContext`, source `orgId` from `req.user.org_id` plumbed through the call chain. Incidentally fixes the latent NULL-name display bug on route-run detail surfaces.
2. **After that lands, resume Phase 1 DB step** with policy flip + backfill in a single transaction matching the Phase 2 template. The migration file `20260519_role_rename_backfill.sql` will need to be rewritten to include both operations.
3. **Changelog addendum** — the already-written changelog at `docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md` currently claims the backfill was applied. It will need an addendum (or rewrite) noting the silent UPDATE 0 incident and the corrective sequencing once the policy flip lands. Recommend leaving the changelog uncommitted until the DB step actually succeeds.
4. **Phase 2 (founder Entra)** does not dispatch until the DB backfill is verified — meaning `SELECT DISTINCT last_seen_role FROM identity_directory` (with org context set) shows only `Specialist`, `Dispatch`, `Admin` (and possibly `NULL` for the existing NULL row).
