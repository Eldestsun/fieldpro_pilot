# 2026-05-24 — Pre-Dispatch Recon (Handoff)

**Audience:** Project Manager
**Author:** Recon agent (read-only investigation, no code/schema changes made)
**Purpose:** Establish ground truth before capability-build dispatching begins. Flags every place reality diverges from the operating assumptions stated in the recon brief.

---

## TL;DR — What the PM needs to know

1. **Branch state is further along than assumed.** The "four-commit unpushed stack on `refactor/baseline`" no longer exists — all four commits are pushed AND already merged into `main`. Both branches are in sync with origin (0 ahead / 0 behind). Dispatch decisions that assumed an unmerged stack need to be re-scoped.
2. **The audit's "completeness grep" is broken.** It returns empty, which has been read as "no old role guards remain." It actually returns empty because it searches for single-quoted `'Lead'` / `'UL'` while the codebase uses double quotes. The real Phase 3 worklist is **~21 backend guard sites across 9 files + 9 frontend derivations in `App.tsx`** — not zero.
3. **Uncommitted local work exists.** Two modified files and three untracked planning subtrees are sitting in the working tree. They are not lost, but they are also not on any remote. PM should decide whether these need to be committed before dispatch.
4. **DB is clean for capture-loop testing.** Operational tables (`route_runs`, `route_run_stops`, `clean_logs`) are empty. `audit_log` holds 27,779 rows. `identity_directory` shows the post-backfill state (Specialist / Dispatch / Admin + 1 NULL).
5. **Tests are green.** Backend 106/0, frontend 25/0. No drift from prior baselines.
6. **T1-A5 spec anchors all verified.** Audit-log endpoint, admin router guard, `DataTable.tsx`, and `docs/changelog/capability-build/` all exist where the spec says they do.

---

## 1. Branch & commit state

### Working tree
```
On branch refactor/baseline
Your branch is up to date with 'origin/refactor/baseline'.

Changes not staged for commit:
  modified:   .gitignore
  modified:   planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md

Untracked files:
  planning/role-rename/
  planning/specs/4am-report/
  planning/specs/reporting-layer/
```

### Ahead/behind vs origin (after `git fetch origin`)
| Branch | vs origin |
|---|---|
| `refactor/baseline` | 0 / 0 |
| `main` | 0 / 0 |

### Last 8 commits — `refactor/baseline`
```
6a0b46b fix(role-rename): Phase 1 audit gaps — widen 16 missed guards + /users SQL filter
4b2530a feat(role-rename): Phase 1 — code dual-accept + identity_directory policy flip + backfill
25aecf8 fix: loadRouteRunById is org-scoped — close cross-tenant fail-open
34adc11 planning: capability-build workstream — index + 9 Tier 1–3 specs
b75dffd security: admin.audit_log_read meta-trigger — correct detail shape + integration tests
0ff8eb8 chore: organize docs/changelog — remove 103 flat duplicates, move nginx-config-audit to ops/
d8d9139 docs: post-schema-hardening sweep — hosting decision, RLS extension, route pool arch
8769910 security: Phase 3 RLS — audit_log bigint, core WITH CHECK, shift_type, stop_pool_memberships
```

### Last 8 commits — `main`
```
452319c Merge refactor/baseline: role rename Phase 1 (dual-accept + backfill) + audit gap fix
6a0b46b fix(role-rename): Phase 1 audit gaps — widen 16 missed guards + /users SQL filter
4b2530a feat(role-rename): Phase 1 — code dual-accept + identity_directory policy flip + backfill
25aecf8 fix: loadRouteRunById is org-scoped — close cross-tenant fail-open
19f16b4 Merge refactor/baseline: capability-build workstream — index + 9 specs
34adc11 planning: capability-build workstream — index + 9 Tier 1–3 specs
abb7f1b Merge refactor/baseline: admin.audit_log_read meta-trigger fix + tests
b75dffd security: admin.audit_log_read meta-trigger — correct detail shape + integration tests
```

### Divergence from brief
The brief assumed `refactor/baseline` was "the four-commit stack, unpushed and not yet merged into main." Reality: the stack has been pushed AND wrapped into `main` via three merge commits — `452319c` (Phase 1 + audit), `19f16b4` (capability-build planning), `abb7f1b` (admin audit-log fix). Both branches are in sync with their remotes.

**Implication for PM:** Any dispatch instruction that says "merge this in" or "push when ready" needs to be checked — that work may already be done.

---

## 2. Role-rename guard landscape

### Audit completeness grep (as written in the 2026-05-23 audit)
```
$ grep -rn "requireAnyRole\|requireRole" backend/src/ --include="*.ts" \
    | grep -E "'Lead'|'UL'" \
    | grep -vE "Dispatch|Specialist"
(empty)
```

```
$ grep -rn "requireAnyRole\|requireRole" backend/src/ --include="*.ts" \
    | grep -E "'Lead'|'UL'"
(empty)
```

### ⚠️ The grep is pattern-broken

The audit grep searches for **single-quoted** `'Lead'` / `'UL'`. The codebase uses **double-quoted** strings, e.g.:

```ts
requireAnyRole(["Lead", "Dispatch", "Admin"])
```

So the empty output is a **false negative**, not evidence that the dual-accept guards are gone. Re-running with the correct quote style:

```
$ grep -rn 'requireAnyRole\|requireRole' backend/src/ --include='*.ts' \
    | grep -E '"Lead"|"UL"'
```

returns **~21 dual-accept guard sites across 9 backend files**:

| File | Line | Guard |
|---|---|---|
| `backend/src/modules/admin/resourceRoutes.ts` | 57, 139 | `["Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/work/stopRoutes.ts` | 67, 162, 257 | mixed `["UL", "Specialist", "Lead", "Dispatch", "Admin"]` / `["Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/work/routeRunStopRoutes.ts` | 27, 155, 420 | `["UL", "Specialist", "Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/work/uploadRoutes.ts` | 88 | `["UL", "Specialist", "Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/work/ulRoutes.ts` | 52, 104, 220, 358 | mixed |
| `backend/src/modules/ops/opsRoutes.ts` | 12 | `["Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/routeOverrides/routeOverrideRoutes.ts` | 15 | `["Lead", "Dispatch", "Admin"]` |
| `backend/src/modules/routes/routeRunRoutes.ts` | 56, 109, 191, 217, 556, 764, 832 | mixed |

### Frontend Lead/UL references
```
$ grep -rn "isLead\|isUL\|'Lead'\|'UL'" frontend/src/ --include="*.ts" --include="*.tsx"
```

| File | Lines | Notes |
|---|---|---|
| `frontend/src/App.tsx` | 79–212 | 11 references — `isLead` / `isUL` derivations (lines 80–81) + 9 nav-gate uses. Comment on line 79 explicitly defers rename to Phase 3. |
| `frontend/src/auth/devAuthBypass.test.ts` | 29, 37, 78, 92, 96, 98, 105, 115 | 8 references — test fixtures and dual-accept predicate mirrors. |

**Phase 3 worklist (real):** ~21 backend guard narrowings + 9 `App.tsx` cleanups (rename derivations and references) + test fixture updates.

---

## 3. Database state

### Operational table row counts (org_id = 1)
```
        t        | count
-----------------+-------
 route_runs      |     0
 route_run_stops |     0
 clean_logs      |     0
 audit_log       | 27779
```

Operational tables are still empty — the founder has not repopulated them with capture-loop testing since the last reset. `audit_log` holds 27,779 rows (consistent with bypass and admin activity accumulation).

### `identity_directory` post-backfill
```
 last_seen_role | count
----------------+-------
 (null)         |     1
 Specialist     |     1
 Dispatch       |     1
 Admin          |     1
```

No `UL` or `Lead` rows remain in `last_seen_role`. There is **1 row with NULL `last_seen_role`** — worth noting; the brief implied a clean Specialist/Dispatch/Admin split. PM should decide whether this NULL row is a known/expected case (e.g., the dev bypass user before first login) or a backfill gap.

### Migration manifest (latest 6)
```
                 filename                 |          applied_at
------------------------------------------+-------------------------------
 20260519_role_rename_backfill.sql        | 2026-05-22 03:47:15.718951+00
 20260518_rls_phase1_public_tables.sql    | 2026-05-22 03:42:49.016692+00
 20260518_rls_phase3_structural_fixes.sql | 2026-05-18 00:00:00+00
 20260518_rls_phase2_add_orgid.sql        | 2026-05-18 00:00:00+00
 00000000_consolidated_schema.sql         | 2026-05-16 04:06:49.575633+00
 20260513_s1_13_oid_encryption.sql        | 2026-05-14 03:05:02.039422+00
```

(The recon brief used column `name`; actual column is `filename`. Cosmetic only.)

---

## 4. Test baseline

| Suite | Result | Drift vs prior baseline |
|---|---|---|
| Backend (`cd backend && npm test`) | **106 passed, 0 failed (106 total)** | none |
| Frontend (`cd frontend && npm test -- --run`) | **25 passed, 0 failed (4 files)** | none |

No red tests. Baselines hold.

---

## 5. T1-A5 spec assumptions — verified

| Claim | Result |
|---|---|
| `GET /api/admin/audit-log` at `adminRoutes.ts:~818` | ✅ Found at line **818** exactly. |
| Router-level `requireAuth, requireAdmin` at `adminRoutes.ts:18` | ✅ Confirmed: `adminRoutes.use("/admin", requireAuth, requireAdmin);` on line 18. `requireAdmin` wraps `requireAnyRole(["Admin"])`. |
| `frontend/src/components/ui/DataTable.tsx` exists | ✅ Present (alongside `ConfirmDialog.tsx`, `OpsTable.tsx`, etc.). |
| `docs/changelog/capability-build/` directory exists | ✅ Present. Contains 2 files: `2026-05-19-role-rename-phase-1.md`, `2026-05-23-role-rename-phase-1-audit.md`. |

T1-A5 spec can be dispatched without further file-location verification.

---

## Recommended PM next steps

1. **Decide the fate of the uncommitted working-tree changes** (`.gitignore`, `SECURITY_SPRINT_2_POLICY_DOCS.md`) and the three untracked planning subtrees. Either dispatch a commit task or move them aside.
2. **Re-scope any Phase 1 / capability-build dispatch instructions that assumed the four-commit stack was unmerged.** It is already in `main`.
3. **Fix the audit completeness grep** (single → double quotes) before re-running it in future audits, or it will continue to report false success.
4. **Treat the ~21 backend dual-accept guard sites + 9 `App.tsx` references as the actual Phase 3 worklist.** Use the table in §2 as the dispatch checklist.
5. **Investigate the 1 NULL `last_seen_role` row** in `identity_directory` — confirm it is intended (e.g., the dev bypass user) or queue a backfill cleanup.
6. **Operational tables are clean — capture-loop testing can resume from a known-empty baseline whenever the founder is ready.**

---

*No code, schema, or configuration changes were made during this recon. All output above is from read-only commands.*
