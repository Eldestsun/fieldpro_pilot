# Role Rename Phase 1 — Close-Out Report (Pre-Commit Review)

> **Purpose:** Everything you need to approve scope before I stage and commit Phase 1.
> **Status:** Nothing staged. Nothing committed. The working tree state below is the proposed commit.
> **Author:** Agent, 2026-05-21

---

## 1. Working-Tree Classification — What Goes In This Commit

### `git diff --stat HEAD` (everything currently uncommitted, tracked files)

```
 .gitignore                                         |  1 +
 CLAUDE.md                                          | 23 ++++++++-
 PROJECT_CONTEXT.md                                 |  6 +--
 Pilot_And_Scale_Strategy.md                        |  4 +-
 backend/src/authz.ts                               | 14 +++++-
 backend/src/modules/admin/resourceRoutes.ts        |  4 +-
 backend/src/modules/ops/opsRoutes.ts               |  2 +-
 backend/src/modules/routeOverrides/routeOverrideRoutes.ts |  2 +-
 backend/src/modules/work/stopRoutes.ts             |  6 +--
 backend/src/modules/work/uploadRoutes.ts           |  2 +-
 backend/tests/canonical/devAuthBypass.test.ts      | 38 +++++++++++++++
 docs/KNOWN_ISSUES.md                               | 56 ++++++++++++++++++++--
 docs/dev/dev-auth-bypass.md                        |  6 +--
 frontend/src/App.tsx                               | 20 ++++----
 frontend/src/auth/devAuthBypass.test.ts            | 26 ++++++++++
 planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md | 39 ++++++++++-----
 16 files changed, 208 insertions(+), 41 deletions(-)
```

### Untracked

```
backend/migrations/20260519_role_rename_backfill.sql
docs/changelog/capability-build/                       (contains: 2026-05-19-role-rename-phase-1.md)
planning/role-rename/                                  (contains: 2026-05-21-phase-1-findings-and-rls-audit.md + this file)
planning/specs/4am-report/                             (unrelated)
planning/specs/reporting-layer/                        (unrelated)
```

### Per-file classification

| File | Classification | Stage? | Reason |
|---|---|---|---|
| `.gitignore` | Pre-existing, unrelated | **NO** | `+repo-tree.md` — predates this dispatch, not rename work |
| `CLAUDE.md` | **MIXED — see §2 below** | **YES (full file)** | One hunk is rename-relevant (RLS Context Gotcha); see §2 |
| `PROJECT_CONTEXT.md` | Phase 1 doc sweep | **YES** | Terminology table updated with Specialist/Dispatch |
| `Pilot_And_Scale_Strategy.md` | Phase 1 doc sweep | **YES** | "Field UI for all route specialists" prose |
| `backend/src/authz.ts` | Phase 1 backend | **YES** | extractRolesFromClaims accepts new names |
| `backend/src/modules/admin/resourceRoutes.ts` | Phase 1 backend | **YES** | Guard widening + SQL filter widening |
| `backend/src/modules/ops/opsRoutes.ts` | Phase 1 backend | **YES** | Guard widening |
| `backend/src/modules/routeOverrides/routeOverrideRoutes.ts` | Phase 1 backend | **YES** | Guard widening |
| `backend/src/modules/work/stopRoutes.ts` | Phase 1 backend | **YES** | Guard widening |
| `backend/src/modules/work/uploadRoutes.ts` | Phase 1 backend | **YES** | Guard widening |
| `backend/tests/canonical/devAuthBypass.test.ts` | Phase 1 backend test | **YES** | New Specialist/Dispatch acceptance test |
| `docs/KNOWN_ISSUES.md` | Phase 1 + PATTERN-001 + ISSUE-014 | **YES** | ISSUE-004/012 rename touches + PATTERN-001 block + ISSUE-014 |
| `docs/dev/dev-auth-bypass.md` | Phase 1 doc sweep | **YES** | localStorage example uses Specialist |
| `frontend/src/App.tsx` | Phase 1 frontend | **YES** | RequireRole guards + isLead/isUL derivations |
| `frontend/src/auth/devAuthBypass.test.ts` | Phase 1 frontend test | **YES** | New Dispatch nav predicate test |
| `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` | Pre-existing, unrelated | **NO** | S2 status table updates — predates this dispatch |
| `backend/migrations/20260519_role_rename_backfill.sql` (new) | Phase 1 migration | **YES** | The actual policy-flip + backfill |
| `docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md` (new) | Phase 1 changelog | **YES — rewritten** | See §4 for the rewrite |
| `planning/role-rename/` | Analysis docs | **NO** | Working notes; not part of changelog tree |
| `planning/specs/4am-report/`, `planning/specs/reporting-layer/` | Untracked, unrelated | **NO** | Not this dispatch |

### Resulting staged set (18 paths)

```
backend/migrations/20260519_role_rename_backfill.sql              (new)
backend/src/authz.ts                                              (M)
backend/src/modules/admin/resourceRoutes.ts                       (M)
backend/src/modules/ops/opsRoutes.ts                              (M)
backend/src/modules/routeOverrides/routeOverrideRoutes.ts         (M)
backend/src/modules/work/stopRoutes.ts                            (M)
backend/src/modules/work/uploadRoutes.ts                          (M)
backend/tests/canonical/devAuthBypass.test.ts                     (M)
frontend/src/App.tsx                                              (M)
frontend/src/auth/devAuthBypass.test.ts                           (M)
CLAUDE.md                                                         (M — see §2)
PROJECT_CONTEXT.md                                                (M)
Pilot_And_Scale_Strategy.md                                       (M)
docs/KNOWN_ISSUES.md                                              (M)
docs/dev/dev-auth-bypass.md                                       (M)
docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md (new, rewritten)
```

### Excluded (left in working tree)

```
.gitignore                                          (unrelated repo-tree.md ignore)
planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md  (unrelated S2 status updates)
planning/role-rename/                               (analysis working notes)
planning/specs/4am-report/                          (unrelated untracked)
planning/specs/reporting-layer/                    (unrelated untracked)
```

---

## 2. CLAUDE.md Analysis — Is It Phase 1 Related?

Per the dispatch instruction: "if the CLAUDE.md diff is rename-related it goes in, if it's the pre-existing unrelated change it stays out."

The full diff has **two distinct hunks**:

### Hunk A — Step 3 changelog directory table (lines 41-54 of new file)

```diff
-Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry at `docs/changelog/YYYY-MM-DD-{slug}.md` before the task is considered done.
+Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry before the task is considered done.
+
+Place the file in the appropriate subdirectory:
+
+| Category | Path |
+|----------|------|
+| Refactor (Tier N) | `docs/changelog/refactor/YYYY-MM-DD-{slug}.md` |
+| Refinement (R-N) | `docs/changelog/refinement/YYYY-MM-DD-{slug}.md` |
+| Security sprint (S-N) | `docs/changelog/security/YYYY-MM-DD-{slug}.md` |
+| Bug fix | `docs/changelog/bugfix/YYYY-MM-DD-{slug}.md` |
+| Ops / infra / deployment | `docs/changelog/ops/YYYY-MM-DD-{slug}.md` |
```

**Classification:** Pre-existing convention codification — predates this dispatch. Not rename-related per se, but: the rename's changelog lives at `docs/changelog/capability-build/2026-05-19-...md`, and this hunk codifies the per-category subdirectory pattern. The capability-build subdirectory is already used by the (committed) capability-build planning workstream (commit `34adc11`), and this dispatch adds the first changelog under it.

The hunk does NOT yet list `capability-build/` as a category in this table — that's a small inconsistency the table will eventually need, but adding it isn't in this dispatch's scope.

### Hunk B — "RLS Context Gotcha" section (lines 90-100 of new file)

```diff
+### RLS Context Gotcha (recurring bug pattern)
+
+Any query or write against a `FORCE ROW LEVEL SECURITY` table silently affects zero rows if `app.current_org_id` is not set on the connection. This has caused multiple bugs (ISSUE-005, ISSUE-012, role-rename backfill migration).
+
+**Hard rules:**
+- App code that queries RLS tables must use `withOrgContext(pool, orgId, ...)` — never bare `pool.query()`
+- Migrations and scripts that touch RLS tables must either set `app.current_org_id` explicitly or run as a superuser/bypassrls role
+- Bugs that silently return empty results on RLS tables are almost always a missing org context, not a data problem
+
+Affected tables include: `identity_directory`, and all 28+ tables with RLS policies. Check `pg_state.sql` or `\d+ <table>` for `Row Security: enabled (forced)` to confirm.
```

**Classification:** Directly rename-related. This is the authoritative reference that `PATTERN-001` in `KNOWN_ISSUES.md` explicitly points to ("See `CLAUDE.md § RLS Context Gotcha` for the authoritative rule.") and it cites the role-rename backfill migration as one of three instantiations. Belongs in this commit.

### Decision

**Stage CLAUDE.md in full.** Both hunks are pre-rename but neither is "unrelated" — Hunk A enables the changelog path this dispatch uses; Hunk B is the canonical pointer that PATTERN-001 references. Leaving them out would orphan the PATTERN-001 cross-reference and split the changelog convention.

If you'd rather split (commit Hunk B with Phase 1, leave Hunk A out), say so and I'll do `git add -p`. Default is to take both.

---

## 3. Cross-Reference Audit — PATTERN-001 ↔ ISSUE-005/012/013/014

### Current state of cross-references

| From | To | Mentioned? |
|---|---|---|
| PATTERN-001 → ISSUE-005 | ✅ ("ISSUE-005 (fetchRoute loop)") |
| PATTERN-001 → ISSUE-012 | ✅ ("ISSUE-012 (/api/users empty list)") |
| PATTERN-001 → ISSUE-013 | ❌ missing |
| PATTERN-001 → ISSUE-014 | ❌ missing |
| PATTERN-001 → CLAUDE.md § RLS Context Gotcha | ✅ |
| PATTERN-001 → role-rename backfill | ✅ ("role-rename backfill migration (2026-05-21)") |
| ISSUE-013 → PATTERN-001 | ❌ missing (refs ISSUE-005/012 thematically but doesn't name the pattern) |
| ISSUE-013 → ISSUE-005, ISSUE-012, loadRouteRunById, role-rename backfill | ✅ |
| ISSUE-014 → PATTERN-001 | ❌ missing |
| ISSUE-014 → ISSUE-013 | ✅ ("alongside ISSUE-013 multi-org audit") |
| CLAUDE.md → ISSUE-005, ISSUE-012, role-rename backfill | ✅ |
| CLAUDE.md → ISSUE-013, ISSUE-014, PATTERN-001 | ❌ all missing |

### Proposed minimal cross-reference fixes (before commit)

1. **PATTERN-001 "Instances" line** — extend to include ISSUE-013 + ISSUE-014:
   > **Instances:** ISSUE-005 (fetchRoute loop), ISSUE-012 (/api/users empty list), ISSUE-013 (resolveNumericOrgId lowest-id fallback — same pattern, different surface), ISSUE-014 (schema_migrations manifest drift — discovered chasing this pattern), role-rename backfill migration (2026-05-21).

2. **ISSUE-013** — add a single sentence at the end of the "Related" subsection pointing at PATTERN-001 by name (currently lists the issues but doesn't name the pattern itself).

3. **ISSUE-014** — add one sentence: "Surfaced while chasing PATTERN-001 on the role-rename backfill — the silent UPDATE 0 was the symptom that triggered the runner re-invocation that revealed the drift."

4. **CLAUDE.md § RLS Context Gotcha** — extend the "ISSUE-005, ISSUE-012, role-rename backfill migration" parenthetical to also name ISSUE-013 and ISSUE-014.

These are all 1-2 line additions. None change content; all close the back-reference loops. I will apply these before staging. **Confirm.**

---

## 4. Rewritten Phase 1 Changelog (Full Draft — Replaces Existing File)

> Path: `docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md`
> The current file at that path falsely claims the backfill applied cleanly. The text below is the full replacement.

```markdown
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
```

---

## 5. Commit Message (Proposed)

```
feat(role-rename): Phase 1 — code dual-accept + identity_directory policy flip + backfill

Code-side rename with dual-accept (UL/Specialist, Lead/Dispatch; Admin
unchanged) across 25 backend guards, 7 frontend guards, the /api/users
SQL filter, test fixtures, and prose. identity_directory's RLS policy
brought onto the Phase 2 COALESCE/NULLIF standard; backfill applied in
the same transaction (UL→Specialist, Lead→Dispatch; Admin and the NULL
row unchanged).

The initial backfill silently no-op'd against the strict R11 policy
shape — see the changelog for the real sequence (false success, root
cause, prerequisite loadRouteRunById fix in 25aecf8, manifest drift
reconciliation, policy flip, verification). The full audit and
verification captures are in
docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md.

PATTERN-001 (RLS silent empty-result when org context missing) and the
specific instances ISSUE-013 (multi-org fail-open in resolveNumericOrgId)
and ISSUE-014 (schema_migrations manifest drift) added to KNOWN_ISSUES.
CLAUDE.md § RLS Context Gotcha is the authoritative rule.

Test counts: backend 104/0, frontend 25/0.

Out of scope: Phase 2 (Entra, founder), Phase 3 (dual-accept removal),
re-runnability hardening (ISSUE-014), resolveNumericOrgId multi-org
hardening (ISSUE-013).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## 6. Items Requiring Greenlight Before I Stage

1. **CLAUDE.md scope** — stage both hunks (Hunk A changelog directory table + Hunk B RLS Context Gotcha) or split with `git add -p`. Default proposal: take both.

2. **Cross-reference fixes** — apply the four small additions in §3 before staging:
   - PATTERN-001 "Instances" line extended to include ISSUE-013 and ISSUE-014.
   - ISSUE-013 — add "See PATTERN-001".
   - ISSUE-014 — add "Surfaced while chasing PATTERN-001…".
   - CLAUDE.md § RLS Context Gotcha — extend the issue parenthetical to include ISSUE-013 and ISSUE-014.

3. **Phase 1 changelog rewrite** — confirm §4 is accurate and complete before I overwrite the existing file.

4. **Commit message** — confirm §5 wording.

5. **Excluded files** — confirm `.gitignore`, `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md`, `planning/role-rename/`, and the two unrelated `planning/specs/` dirs stay out.

---

## 7. After Greenlight — Execution Order

1. Apply the four cross-reference fixes in §3 (small edits to KNOWN_ISSUES.md and CLAUDE.md).
2. Overwrite `docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md` with §4 content.
3. `git add` the 18 paths in §1.
4. `git status` to verify nothing extra crept in.
5. `git commit` with the §5 message.
6. `git log -1` to report the resulting hash.
7. **Stop. Do not push.** Push waits on Phase 2 (Entra) verification.

---

## 8. What This Commit Does NOT Do

- Does not push. Local commit only.
- Does not merge `refactor/baseline` into `main`. Per CLAUDE.md commit convention, merge + push happens after Phase 2 lands.
- Does not dispatch Phase 2.
- Does not address ISSUE-013 (resolveNumericOrgId multi-org hardening) or ISSUE-014's re-runnability follow-up — both deferred with documented targets.
- Does not stage `planning/role-rename/2026-05-21-phase-1-findings-and-rls-audit.md` or this report (`2026-05-21-phase-1-close-out-report.md`). Working notes, not changelog content.
