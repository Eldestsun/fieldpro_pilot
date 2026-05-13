# BASELINE Refactor Index

> Orchestration layer for the canonical-model migration.
> Each tier has its own handoff file. This document tracks ordering, dependencies, and current status.
> Last updated: 2026-05-13 (Tiers 1–8 complete)

---

## Tier Map

| Tier | Name | Depends On | Parallel With | Status |
|------|------|-----------|---------------|--------|
| 1 | Canonical Completeness | — (unblocked) | 3, 4, 6 | 🟢 Done |
| 2 | Intelligence Migration | Tier 1 done + Tier 4 stops-columns done | — | 🟢 Done |
| 3 | Reconnect Control Center | — (unblocked) | 1, 4, 6 | 🟢 Done |
| 4 | Schema Cleanup | — (unblocked) | 1, 3, 6 | 🟢 Done |
| 5 | Assignment Layer | Tier 1 must be stable | 3, 4, 6 | 🟢 Done |
| 6 | Infrastructure | — (unblocked) | 1, 3, 4, 5 | 🟢 Done |
| 7 | Row Level Security & Tenant Isolation | Tier 1 done | 8 | 🟢 Done |
| 8 | Asset Type Abstraction | Tier 7 done | — | 🟢 Done |

---

## Execution Order

```
Tier 3 ────────────────────────────────── (independent, start anytime)
Tier 6 ────────────────────────────────── (independent, run alongside each tier)

Tier 4 ──┐ stops-columns sub-task
          │
Tier 1 ───┴──► Tier 2 (needs both: complete observations + lowercase stop columns)
          │
Tier 1 ───┴──► Tier 5 (after Tier 1 is stable; feeds Tier 2 completeness, doesn't block it)
          │
Tier 1 ───┴──► Tier 7 (RLS applied after canonical write paths are stable)
                │
                └──► Tier 8 (asset abstraction runs on RLS-enforced schema)

Tier 7 — Blocks: Scale (no second agency before RLS verified)
```

**Tier 2 has two hard prerequisites:**
1. Tier 1 done — `core.observations` must be fully and reliably populated before intelligence can migrate off legacy tables
2. Tier 4 stops-columns done — `riskMapService.ts` queries `public.stops` using uppercase quoted identifiers (`"STOP_ID"` etc.). When Tier 4 renames those columns, any Tier 2 SQL rewrite must use the new names. If Tier 2 ships first it embeds the old names and Tier 4 breaks it.

**Tier 5 is load-bearing but does not block Tier 2.** Tier 5 (writing `core.assignments` + `assignment_id` on visits) improves the completeness of canonical state that Tier 2 reads, but Tier 2 reads observations and visits — not assignments. Tier 5 should be stable before Tier 2 is considered fully verified, but it does not gate Tier 2 from starting.

Tier 6 (infrastructure/tests) should run alongside each completed tier, not as a single batch at the end.

---

## Tier Summaries

### Tier 1 — Canonical Completeness
**File**: `planning/refactor/TIER_1_CANONICAL_COMPLETENESS.md`

Close the gaps between the transit execution layer and the canonical DB model. After Tier 1, every completed or skipped stop writes `outcome`, `reason_code`, `washed_can`, and `core.evidence` rows. Visit lifecycle is corrected to open on stop-start, not photo upload.

Key constraint: additive only. Every new canonical write happens alongside existing transit writes. Nothing is removed.

---

### Tier 2 — Intelligence Migration
**File**: `planning/refactor/TIER_2_INTELLIGENCE_MIGRATION.md`

Migrate `riskMapService.ts` and all intelligence derivations to read from `core.observations` and `core.visits` instead of `level3_logs`, `hazards`, and `infrastructure_issues`. After Tier 2, the intelligence layer reads canonical state only.

**Two hard prerequisites:**
- Tier 1 done — `core.observations` must be fully populated before intelligence can rely on it
- Tier 4 stops-columns done — `riskMapService.ts` queries `public.stops` with uppercase quoted column names. Tier 2's SQL rewrite must use whatever column names Tier 4 leaves behind. Doing Tier 2 first embeds the old names and makes Tier 4 a breaking change.

Status: Complete — changelog written 2026-05-11. Change 1 (canonical CTEs in `rebuildStopRiskSnapshot()`) shipped. Change 2 (additive verification harness via `rebuildStopRiskSnapshotLegacy()`) shipped and structurally verified: both functions execute cleanly, 206 rows each. Runtime canonical-vs-legacy distribution comparison deferred to first real field session — current DB has no rows in either source. ISSUE-007 (hardcoded hazard severity, canonical `severity` column never written) resolved 2026-05-11/12 across frontend + backend; changelogs: `docs/changelog/2026-05-11-fix-007-hazard-severity-write.md`, `docs/changelog/2026-05-11-issue-007-severity-frontend.md`, `docs/changelog/2026-05-12-fix-hazard-severity-backend-bugs.md`. `arrivalObservations()` hardened with `active`/`role` filter on the `transit_stop_assets` join. `ADAPTER_BOUNDARY.md §6` corrected to reflect Path B.

---

### Tier 3 — Reconnect Control Center
**File**: `planning/refactor/TIER_3_CONTROL_CENTER.md`

Mount the fully-built `AdminControlCenter.tsx` component into `App.tsx`. The component exists and is complete (331 lines); it is simply not mounted. After Tier 3, Control Center is reachable by Admin-role users.

No backend changes required. Frontend-only.

---

### Tier 4 — Schema Cleanup
**File**: `planning/refactor/TIER_4_SCHEMA_CLEANUP.md`

Three sub-tasks:

1. **Stops column rename (feeds Tier 2)** — `public.stops` is a VIEW on `transit_stops` with uppercase quoted column names (`"STOP_ID"`, `"ON_STREET_NAME"`, etc.). Rename to lowercase and update all backend queries. Must be done before Tier 2 rewrites `riskMapService.ts`.

2. **Drop surveillance tables + create replacement schemas (feeds R10)** — Drop `workforce_metrics` (per-worker, `user_id`-keyed — surveillance schema) and `stop_scoring_history` (contains `workforce_score`). Replace with `stop_effort_history` and `stop_condition_history` — the same planning intelligence, redesigned as stop-level tables with no worker identity. Created empty here; write paths wired in R10.

3. **Document architectural intent** — Table comments explain the labor-safety design decision so no future agent or developer re-introduces `user_id`.

---

### Tier 5 — Assignment Layer
**File**: `planning/refactor/TIER_5_ASSIGNMENT_LAYER.md`

Wire `core.assignments` into the write path so that every route run stop execution has a corresponding canonical assignment record. After Tier 5, `core.visits.assignment_id` is populated for all new visits. `core.assignments` moves from 0-row schema-only to active.

Load-bearing. Must wait until Tier 1 is confirmed stable — specifically, visit creation must be reliably triggered on stop-start before assignments can be linked.

Status: Complete — changelog written 2026-05-10. Change 2 (assignment_id on new visits) verified structurally. Runtime verification (live stop-start on a post-Tier-5 route) requires Entra auth — deferred to first authenticated field session. SQL lookup pattern identical to verified Change 1 join.

---

### Tier 6 — Infrastructure
**File**: `planning/refactor/TIER_6_INFRASTRUCTURE.md`

Add integration tests for the canonical write paths introduced in Tier 1. Create a migration runner script. Document Docker/CI setup gaps. After Tier 6, the canonical write paths have test coverage and the build pipeline is documented.

Can proceed in parallel with Tiers 1, 3, and 4.

Status: Complete — changelog written 2026-05-12. Sub-task A (migration runner, 43 baseline migrations stamped) and Sub-task D (hardcoded localhost removed, `.env.example` written) verified 2026-05-08. Sub-task B (20 integration tests across `backend/tests/canonical/` against the real local DB, cleanup verified) and Sub-task C (backend + frontend Dockerfiles, `frontend/nginx.conf` with SPA routing + `/api` proxy, compose services for the full stack) verified 2026-05-12. The `docker compose up --build` validation pass caught three spec gaps — nginx.conf path, pnpm version pin, and missing Azure env vars in compose — all fixed; details in the tier file's Sub-task C "Deltas from the spec" section.

---

### Tier 7 — Row Level Security & Tenant Isolation
**File**: `planning/refactor/TIER_7_ROW_LEVEL_SECURITY_&_TENANT_ISOLATION.MD`

Enforce org-level data isolation at the DB layer using Postgres Row Level Security. Policies on all five canonical tables filter every query by `app.current_org_id` session variable, set via a `withOrgContext()` wrapper in `db.ts`. A bad query missing a WHERE clause cannot leak cross-tenant data. Includes a verification script that proves cross-tenant isolation.

Status: Complete — changelog written 2026-05-12. Migration `20260512_row_level_security.sql` applied, `withOrgContext()` in place in `backend/src/db.ts`, `observationService.ts` `pool.connect()` blocks refactored to wrap. `visitService.ts` and `routeRunService.ts` already client-parameterized — verified `org_id` is populated on every canonical insert and no direct `pool.connect()` calls inside the service files. `backend/scripts/verify_rls.ts` runs end-to-end against the real local DB: all six assertions PASS (per-org isolation in both directions, cross-tenant `INSERT` blocked by `WITH CHECK`, migration-bypass via unset variable). Migration script bypass uses unset-variable rather than `BYPASSRLS` role attribute so the existing migration runner continues to work without role changes.

**Hard dependency note**: `withOrgContext()` requires `org_id` to be resolved from the authenticated user's Entra tenant ID. The application path always sets the variable; the bypass-when-unset branch exists for migrations only and is unreachable from request handlers that go through `withOrgContext`.

---

### Tier 8 — Asset Type Abstraction
**File**: `planning/refactor/TIER_8_ASSET_TYPE_ABSTRACTION.md`

Abstract the stop-centric data model to support multiple asset types (stops, restrooms, shelters, facilities). Enables BASELINE to operate across asset classes without schema duplication. Should run on an RLS-enforced schema (Tier 7 done).

Status: Complete — changelogs written 2026-05-12/13. Migration `20260512_tier8_asset_abstraction.sql` applied: `core.asset_types`, `core.observation_type_registry` created; `public.assets` promoted with `external_id`, `display_name`, `lat`, `lon`, `attributes`, `active` columns. Transit asset seeder (`backend/scripts/seed_transit_assets.ts`) populates `core.asset_types` (`transit_stop` for KCM), `core.observation_type_registry` (all transit observation types), and `public.assets` from `transit_stops`. `observationService.ts` refactored to read arrival observation types from `core.observation_type_registry` via `getArrivalObservationTypes()` — no hardcoded type lists. Tenant configuration API added at `/api/admin/tenant` (5 endpoints: GET/POST asset-types, GET/POST observation-types, POST seed-assets CSV upload) via new `assetService.ts` + `tenantRoutes.ts`; all canonical writes go through `assetService.ts`.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟠 In review | Code written, verification pending |
| 🟢 Done | All done-criteria verified |
| ⛔ Blocked | Hard dependency not yet met |

---

## Cross-Tier Constraints

These constraints apply across all tiers and must not be violated by any tier's work:

1. **Additive only (until verified)**: Do not remove any existing transit write path until its canonical replacement is verified with real production data.
2. **Auth is frozen**: Do not touch `authz.ts`, `AuthContext.tsx`, or `msalConfig.ts`.
3. **Offline contract is frozen**: Do not change the offline queue action schema or replay order.
4. **Labor safety is non-negotiable**: No per-worker attribution, no ranking, no punitive metrics. Deprecating `workforce_metrics` is correct; re-implementing it in a new form is not.
5. **user_id = 123 is a stub**: Every tier that touches a write path must note this stub but must not attempt to fix it until the auth identity refactor is explicitly scoped as a task.
6. **Every tier must produce a changelog entry**: When a tier's done-criteria are met, write `docs/changelog/YYYY-MM-DD-{tier-slug}.md` before marking the tier complete. The entry must list what changed, why, and which files were touched.
