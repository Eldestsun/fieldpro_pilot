# 2026-05-25 — Role rename Phase 3 (drop dual-accept, rename legacy variables, lock `last_seen_role` at the DB)

## What changed

### Part 1 — Backend guard narrowing (24 guards across 9 files)

Every `requireAnyRole` guard that still carried `"UL"` and/or `"Lead"`
was narrowed to the new-names-only set. Existing structure preserved;
only the legacy strings were dropped.

Transforms applied:

| Before                                                  | After                                  |
|---------------------------------------------------------|----------------------------------------|
| `["UL", "Specialist"]`                                  | `["Specialist"]`                       |
| `["Lead", "Dispatch"]`                                  | `["Dispatch"]`                         |
| `["Lead", "Dispatch", "Admin"]`                         | `["Dispatch", "Admin"]`                |
| `["UL", "Specialist", "Lead", "Dispatch", "Admin"]`     | `["Specialist", "Dispatch", "Admin"]`  |

Five governance guards left untouched because they never carried
`UL`/`Lead` and `Admin` is not being renamed:

- `backend/src/modules/admin/adminRoutes.ts:14` — `["Admin"]`
- `backend/src/modules/admin/exportDeleteRoutes.ts:16` — `["Admin"]`
- `backend/src/modules/admin/tenantRoutes.ts:23` — `["Admin"]`
- `backend/src/routes/healthRoutes.ts:157` — `["Admin"]` (`/admin/secret`)
- `backend/src/routes/healthRoutes.ts:196` — `["Admin"]` (`/admin/ops`)

### Part 2 — Frontend variable rename + guard narrowing

`frontend/src/App.tsx`:

- `isLead = roles.includes("Lead") || roles.includes("Dispatch")` →
  `isDispatch = roles.includes("Dispatch")`
- `isUL = roles.includes("UL") || roles.includes("Specialist")` →
  `isSpecialist = roles.includes("Specialist")`
- All 9 references to `isLead`/`isUL` retargeted to `isDispatch`/`isSpecialist`.
- `DefaultRedirect` `/routes` predicate narrowed: dropped `roles.includes("Lead")`.
- Seven dual-accept `RequireRole` guards narrowed:
  - `/work`: `["UL", "Specialist", "Lead", "Dispatch"]` → `["Specialist", "Dispatch"]`
  - `/routes`, `/routes/:routeRunId`, `/ops/dashboard`, `/ops/pools`,
    `/ops/stops`: `["Lead", "Dispatch", "Admin"]` → `["Dispatch", "Admin"]`
- Four `["Admin"]`-only `RequireRole` guards preserved (`/admin/dashboard`,
  `/admin/pools`, `/admin/stops`, `/admin/control-center`).
- Phase 1 comment block removed.

`frontend/src/auth/devAuthBypass.test.ts`:

- Test fixtures updated from `roles: ['UL']` → `roles: ['Specialist']` and
  `roles: ['Admin', 'Lead']` → `roles: ['Admin', 'Dispatch']`.
- The dual-accept regression test rewritten as a Phase 3 narrowing
  regression test: asserts `roles.includes('Dispatch')` accepts a
  Dispatch claim and rejects a Lead claim. Locks the narrowed shape in
  so an accidental revert to dual-accept fails the test, not just the
  prod deploy.

### Part 3 — DB CHECK constraint

`backend/migrations/20260525_role_rename_last_seen_role_check.sql`:

```sql
ALTER TABLE public.identity_directory
  DROP CONSTRAINT IF EXISTS identity_directory_last_seen_role_check;
ALTER TABLE public.identity_directory
  ADD CONSTRAINT identity_directory_last_seen_role_check
  CHECK (
    last_seen_role IS NULL
    OR last_seen_role IN ('Specialist', 'Dispatch', 'Admin')
  );
```

Live distribution before the constraint (with `app.current_org_id = '1'`):

```
 last_seen_role | count
----------------+-------
 Admin          |     1
 Dispatch       |     1
 Specialist     |     1
                |     1   (NULL)
```

All four values pass the constraint, so the existing-row validation at
`ADD CONSTRAINT` time succeeded. NULL is permitted because
identity_directory rows may exist before Entra has reported a role for
the account, and the pre-Phase-1 directory already held one such row.

Applied via `npm run migrate`. Stamped in `public.schema_migrations`
at `2026-05-25 08:50:10.754896+00`.

In-transaction accept/reject verification (rollback-only, leaves no
rows):

- `INSERT … last_seen_role = 'UL'` → ERROR "violates check constraint
  identity_directory_last_seen_role_check" (rejected, expected).
- `INSERT … last_seen_role = 'Lead'` → same ERROR (rejected, expected).
- `INSERT` of one row each for NULL, `'Specialist'`, `'Dispatch'`,
  `'Admin'` → all four accepted, rolled back. Post-rollback probe row
  count = 0.

## Why

- The Phase 1 dual-accept window was always staged for cleanup once
  Entra (Phase 2) was reissuing the new role names. Phase 3 is that
  cleanup: code expects only the new names, and the DB rejects the old
  ones at the boundary.
- The CHECK constraint is the structural lock on the rename. Any
  future writer that tries to reintroduce `'UL'` or `'Lead'` —
  regression, a manual `psql`, a restore from an old dump — fails at
  INSERT/UPDATE time instead of silently re-corrupting the directory.
- Keeping NULL valid is deliberate: forbidding it would require a
  separate backfill outside the scope of the role rename and would
  reject legitimate "pre-Entra-report" rows.

## Verification

- Re-grep proofs (build-your-own-worklist discipline):
  - Backend `grep -rn 'requireAnyRole\|requireRole' backend/src/ --include='*.ts' | grep -E '"Lead"|"UL"'` — returns empty.
  - Backend audit grep with `| grep -vE 'Dispatch|Specialist'` — returns empty.
  - Frontend `grep -rn 'isLead\|isUL\|"Lead"\|"UL"\|'\''Lead'\''\|'\''UL'\''' frontend/src/ --include='*.ts' --include='*.tsx'` — three hits remain, all in `devAuthBypass.test.ts`: two comments explaining the narrowing and one `expect(navPredicate(['Lead'])).toBe(false)` assertion that locks in the rejection of legacy `Lead` tokens. These are the regression test, not stragglers.
- Test counts: backend **106 / 0**, frontend **25 / 0** (no change from
  the Phase 1 closeout baseline of 106 / 0 and 25 / 0).
- The Phase 1 HTTP regression tests (`backend/tests/canonical/roleRenamePhase1Audit.test.ts`) both pass after narrowing — a Dispatch-only token still reaches `GET /api/lead/route-runs/:id` (200), and `/api/users` still returns the backfilled Specialist + Dispatch rows.

## Out of scope (explicit, untouched)

- The `/api/users` SQL filter at `backend/src/modules/admin/resourceRoutes.ts:163`
  still reads `WHERE last_seen_role IN ('UL', 'Specialist', 'Lead', 'Dispatch')`.
  This is not a guard, so it was outside Part 1's "Backend guard
  narrowing" scope. It is harmless now (the backfill plus the new
  CHECK constraint mean no row can ever hold `'UL'` or `'Lead'` again),
  but a follow-up could narrow it to `IN ('Specialist', 'Dispatch')`
  for stylistic consistency.
- The OpenAPI tag definition `{ name: 'UL', description: 'Unit
  Leader…' }` at `backend/src/openapi/generate.ts:93` was also left
  alone — same scope reasoning. The OpenAPI spec is regenerated from
  this source; the tag rename is its own dispatch.
- The "Lead" text label on the Dispatch badge in `App.tsx` (lines 150,
  192) was left alone. The user-visible chip currently says "Lead" for
  a Dispatch user. The task brief scoped Part 2 to variable references
  and dual-accept guards; the UI label is a separate UX concern.
- `pg_state.sql` was not regenerated. The CLAUDE.md rule triggers
  regeneration on table add/drop after 2026-05-08; this migration adds
  a CHECK constraint on an existing table, no add/drop. If a fresh
  snapshot is wanted for review, regenerate with the documented
  `pg_dump` command.

## Worklist-grep quoting note (build-your-own-worklist discipline)

The literal worklist grep in the Phase 3 brief was `grep -E "'Lead'|'UL'"`
(single-quoted). The codebase uses double-quoted role strings in
TypeScript (`"Lead"`, `"UL"`), so the literal pattern returned zero
hits even with 24 dual-accept guards still live. Built the worklist
from the double-quoted variant instead and re-verified completeness
with both quote-style greps after editing. The audit's old-only-guard
grep (`| grep -vE "Dispatch|Specialist"`) also returns empty under
both quote styles.

## Files touched

### Backend

- `backend/src/modules/admin/resourceRoutes.ts`
- `backend/src/modules/work/stopRoutes.ts`
- `backend/src/modules/work/ulRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/work/uploadRoutes.ts`
- `backend/src/modules/routeOverrides/routeOverrideRoutes.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/migrations/20260525_role_rename_last_seen_role_check.sql` (new)

### Frontend

- `frontend/src/App.tsx`
- `frontend/src/auth/devAuthBypass.test.ts`

### Docs

- `docs/changelog/capability-build/2026-05-25-role-rename-phase-3.md` (this file)

## Forward pointers

- The OpenAPI tag and the `/api/users` SQL filter narrowing can be
  swept in a single follow-up dispatch if desired; both are no-ops at
  runtime, so they are not blockers.
- The "Lead" badge label in `App.tsx` is a one-line UX call. After
  the founder confirms the Dispatch chip reads correctly in the live
  Entra flow, swap the literal to `Dispatch`.

## Related

- `docs/changelog/capability-build/2026-05-19-role-rename-phase-1.md`
  (Phase 1 — code dual-accept + backfill).
- `backend/tests/canonical/roleRenamePhase1Audit.test.ts` (locks
  Dispatch HTTP access; passes after narrowing).
- `docs/KNOWN_ISSUES.md` ISSUE-014 (re-runnable migration discipline;
  this migration's `DROP CONSTRAINT IF EXISTS` follows that pattern).
- `CLAUDE.md § RLS Context Gotcha` (authoritative rule; the live
  directory query in Part 3 set `app.current_org_id` explicitly per
  PATTERN-001).
