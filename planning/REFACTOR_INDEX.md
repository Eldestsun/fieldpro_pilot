# BASELINE Refactor Index

> Orchestration layer for the canonical-model migration.
> Each tier has its own handoff file. This document tracks ordering, dependencies, and current status.
> Last updated: 2026-05-08

---

## Tier Map

| Tier | Name | Depends On | Parallel With | Status |
|------|------|-----------|---------------|--------|
| 1 | Canonical Completeness | — (unblocked) | 3, 4, 6 | 🔴 Not started |
| 2 | Intelligence Migration | Tier 1 done + Tier 4 stops-columns done | — | ⛔ Blocked |
| 3 | Reconnect Control Center | — (unblocked) | 1, 4, 6 | 🟢 Done |
| 4 | Schema Cleanup | — (unblocked) | 1, 3, 6 | 🟢 Done |
| 5 | Assignment Layer | Tier 1 must be stable | 3, 4, 6 | ⛔ Blocked |
| 6 | Infrastructure | — (unblocked) | 1, 3, 4, 5 | 🟡 In progress |

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
```

**Tier 2 has two hard prerequisites:**
1. Tier 1 done — `core.observations` must be fully and reliably populated before intelligence can migrate off legacy tables
2. Tier 4 stops-columns done — `riskMapService.ts` queries `public.stops` using uppercase quoted identifiers (`"STOP_ID"` etc.). When Tier 4 renames those columns, any Tier 2 SQL rewrite must use the new names. If Tier 2 ships first it embeds the old names and Tier 4 breaks it.

**Tier 5 is load-bearing but does not block Tier 2.** Tier 5 (writing `core.assignments` + `assignment_id` on visits) improves the completeness of canonical state that Tier 2 reads, but Tier 2 reads observations and visits — not assignments. Tier 5 should be stable before Tier 2 is considered fully verified, but it does not gate Tier 2 from starting.

Tier 6 (infrastructure/tests) should run alongside each completed tier, not as a single batch at the end.

---

## Tier Summaries

### Tier 1 — Canonical Completeness
**File**: `planning/TIER_1_CANONICAL_COMPLETENESS.md`

Close the gaps between the transit execution layer and the canonical DB model. After Tier 1, every completed or skipped stop writes `outcome`, `reason_code`, `washed_can`, and `core.evidence` rows. Visit lifecycle is corrected to open on stop-start, not photo upload.

Key constraint: additive only. Every new canonical write happens alongside existing transit writes. Nothing is removed.

---

### Tier 2 — Intelligence Migration
**File**: `planning/TIER_2_INTELLIGENCE_MIGRATION.md`

Migrate `riskMapService.ts` and all intelligence derivations to read from `core.observations` and `core.visits` instead of `level3_logs`, `hazards`, and `infrastructure_issues`. After Tier 2, the intelligence layer reads canonical state only.

**Two hard prerequisites:**
- Tier 1 done — `core.observations` must be fully populated before intelligence can rely on it
- Tier 4 stops-columns done — `riskMapService.ts` queries `public.stops` with uppercase quoted column names. Tier 2's SQL rewrite must use whatever column names Tier 4 leaves behind. Doing Tier 2 first embeds the old names and makes Tier 4 a breaking change.

---

### Tier 3 — Reconnect Control Center
**File**: `planning/TIER_3_CONTROL_CENTER.md`

Mount the fully-built `AdminControlCenter.tsx` component into `App.tsx`. The component exists and is complete (331 lines); it is simply not mounted. After Tier 3, Control Center is reachable by Admin-role users.

No backend changes required. Frontend-only.

---

### Tier 4 — Schema Cleanup
**File**: `planning/TIER_4_SCHEMA_CLEANUP.md`

Three sub-tasks:

1. **Stops column rename (feeds Tier 2)** — `public.stops` is a VIEW on `transit_stops` with uppercase quoted column names (`"STOP_ID"`, `"ON_STREET_NAME"`, etc.). Rename to lowercase and update all backend queries. Must be done before Tier 2 rewrites `riskMapService.ts`.

2. **Drop surveillance tables + create replacement schemas (feeds R10)** — Drop `workforce_metrics` (per-worker, `user_id`-keyed — surveillance schema) and `stop_scoring_history` (contains `workforce_score`). Replace with `stop_effort_history` and `stop_condition_history` — the same planning intelligence, redesigned as stop-level tables with no worker identity. Created empty here; write paths wired in R10.

3. **Document architectural intent** — Table comments explain the labor-safety design decision so no future agent or developer re-introduces `user_id`.

---

### Tier 5 — Assignment Layer
**File**: `planning/TIER_5_ASSIGNMENT_LAYER.md`

Wire `core.assignments` into the write path so that every route run stop execution has a corresponding canonical assignment record. After Tier 5, `core.visits.assignment_id` is populated for all new visits. `core.assignments` moves from 0-row schema-only to active.

Load-bearing. Must wait until Tier 1 is confirmed stable — specifically, visit creation must be reliably triggered on stop-start before assignments can be linked.

---

### Tier 6 — Infrastructure
**File**: `planning/TIER_6_INFRASTRUCTURE.md`

Add integration tests for the canonical write paths introduced in Tier 1. Create a migration runner script. Document Docker/CI setup gaps. After Tier 6, the canonical write paths have test coverage and the build pipeline is documented.

Can proceed in parallel with Tiers 1, 3, and 4.

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
