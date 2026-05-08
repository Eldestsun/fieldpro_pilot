# Tier 4 — Schema Cleanup

> **Goal**: Rename `public.stops` view columns to lowercase (unblocking Tier 2), drop the surveillance-adjacent tables `workforce_metrics` and `stop_scoring_history`, and create their correctly designed replacements — worker-safe stop-level effort and condition history tables.
>
> **Status**: 🔴 Not started
> **Depends on**: Nothing (unblocked)
> **Blocks**: Tier 2 (Sub-task A must complete first) + R10 (Sub-task B must complete first — replacement schemas must exist before R10 wires the write paths)

---

## Three Independent Sub-Tasks

This tier has three sub-tasks. A and B have no dependency on each other. C depends on B.

| Sub-task | Urgency | Dependency |
|----------|---------|-----------|
| A — Rename `stops` view columns to lowercase | Must complete before Tier 2 starts | Blocks Tier 2 |
| B — Drop surveillance tables + create replacement schemas | Can run anytime | Blocks R10 (wiring) |
| C — Document the architectural intent of the replacement tables | Run alongside B | None |

Execute Sub-task A first. Sub-task B and C can run at any time after that in any order.

---

## Sub-task A — Rename `public.stops` View Columns to Lowercase

### Why

`public.stops` is a VIEW on `transit_stops` with uppercase quoted column names (`"STOP_ID"`, `"ON_STREET_NAME"`, `"BEARING_CODE"`, etc.). Every backend query that touches stops must use these quoted uppercase identifiers. One schema change to `transit_stops` breaks every query silently (wrong column = NULL, not an error).

Eight backend files currently use these uppercase identifiers:
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/src/intelligence/riskMapService.ts` *(will be rewritten in Tier 2)*
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/routes/devRoutes.ts`

### Files to Touch (Sub-task A)

| File | Change |
|------|--------|
| New migration file `backend/migrations/YYYYMMDD_stops_view_lowercase_columns.sql` | Recreate `public.stops` view with lowercase column aliases |
| `backend/src/domains/routeRun/routeRunService.ts` | Replace all `"STOP_ID"` → `stop_id`, `"ON_STREET_NAME"` → `on_street_name`, etc. |
| `backend/src/domains/routeRun/loaders/loadRouteRunById.ts` | Same column renames |
| `backend/src/modules/admin/adminRoutes.ts` | Same column renames |
| `backend/src/modules/ops/opsRoutes.ts` | Same column renames |
| `backend/src/modules/routes/routeRunRoutes.ts` | Same column renames |
| `backend/src/routes/devRoutes.ts` | Same column renames |

`riskMapService.ts` is intentionally left to Tier 2's rewrite — do not touch it here unless Tier 2 is being executed simultaneously.

### Before (migration)

```sql
-- Current view definition (uppercase quoted columns)
CREATE OR REPLACE VIEW public.stops AS
SELECT
  ts.stop_id    AS "STOP_ID",
  ts.trf_district_code AS "TRF_DISTRICT_CODE",
  ts.bay_code   AS "BAY_CODE",
  ts.bearing_code AS "BEARING_CODE",
  ts.on_street_name AS "ON_STREET_NAME",
  -- ... etc
FROM transit_stops ts
LEFT JOIN ...
```

### After (migration)

```sql
-- Recreate with lowercase column names
CREATE OR REPLACE VIEW public.stops AS
SELECT
  ts.stop_id,
  ts.trf_district_code,
  ts.bay_code,
  ts.bearing_code,
  ts.on_street_name,
  ts.intersection_loc,
  ts.hastus_cross_street_name,
  ts.kcm_managed_equipment,
  ts.route_list,
  ts.num_shelters,
  ts.stop_status,
  ts.gisobjid,
  ts.lon,
  ts.lat,
  ts.is_hotspot,
  ts.compactor,
  ts.has_trash,
  ts.notes,
  ts.pool_id,
  ts.last_level3_at,
  ts.priority_class,
  ts.asset_id
FROM transit_stops ts;
```

Note: the existing `INSTEAD OF INSERT OR DELETE OR UPDATE` trigger (`trg_stops_readonly`) must be preserved.

### Backend query updates

Replace every quoted uppercase identifier with its lowercase equivalent across the six backend files. Examples:

| Old | New |
|-----|-----|
| `s."STOP_ID"` | `s.stop_id` |
| `"STOP_ID" = ANY($1::text[])` | `stop_id = ANY($1::text[])` |
| `"ON_STREET_NAME"` | `on_street_name` |
| `"BEARING_CODE"` | `bearing_code` |

### Done criteria (Sub-task A)
- `SELECT stop_id FROM public.stops LIMIT 1` returns a row without quoting
- All six backend files compile without TypeScript errors
- Route creation, stop loading, and route detail all return correct data end-to-end
- `riskMapService.ts` still runs (it uses uppercase — it will be fixed in Tier 2's rewrite)

---

## Sub-task B — Drop Surveillance Tables + Create Replacement Schemas

### Why Drop

`public.workforce_metrics` and `public.stop_scoring_history` have **0 rows** and **no backend writers**. They were designed, migrated, and abandoned.

`workforce_metrics` is the higher-risk table — keyed by `user_id`, it is a per-worker performance record by design. One bad agent prompt away from becoming a surveillance instrument. The labor safety guardrails require structural removal, not an empty table.

`stop_scoring_history` is closer to the right shape (keyed by `stop_id`) but carries a `workforce_score` column that implies worker attribution.

The concept behind both tables is correct and valuable. The implementation is wrong. Drop both and replace with correctly designed stop-level tables.

### Why the Replacements Are Worker-Safe

The signal — stop service effort, stop condition history — is genuine planning intelligence. It tells you: this stop consistently takes 18 minutes, this stop's cleanliness score has been declining for 6 weeks, this stop type generates 3x the trash volume of a standard stop. None of that requires worker identity.

The replacement tables are keyed by `(stop_id, visit_id)`. A visit has no worker name. The app layer surfaces no worker names. At the DB level, there is no `user_id` in either table — an admin with a SQL client cannot reconstruct a per-worker profile from these tables, because worker identity is not in them.

Worker-safe by structure, not policy. That is the correct implementation.

### Architectural Position

The transit adapter (`route_runs`, `route_run_stops`) remains the execution scaffolding. The canonical layer (`core.visits`, `core.observations`) is the truth layer. The replacement tables sit above canonical state:

```
transit adapter (route_runs / route_run_stops)  ← execution scaffolding, stays
         ↓
core.visits + core.observations                 ← canonical truth
         ↓
stop_effort_history + stop_condition_history    ← derived intelligence, no worker identity
         ↓
risk maps + route planning signals              ← surfaces
```

### Files to Touch (Sub-task B)

| File | Change |
|------|--------|
| New migration `backend/migrations/YYYYMMDD_replace_surveillance_tables.sql` | DROP surveillance tables + CREATE replacement tables |

No backend code references either surveillance table (confirmed by codebase audit). The wiring of write paths to the new tables is handled in **R10** (Refinement track) — R10 requires Tier 1 to be complete since the new tables are populated from `core.visits` and `core.observations`.

### Migration

```sql
-- ============================================================
-- Drop surveillance-adjacent tables
-- workforce_metrics: per-worker performance metrics by user_id.
-- Permanently out of scope per labor safety guardrails.
-- stop_scoring_history: contains workforce_score column.
-- Neither table has rows or backend writers as of 2026-05-08.
-- ============================================================

DROP TABLE IF EXISTS public.workforce_metrics;
DROP TABLE IF EXISTS public.stop_scoring_history;

-- ============================================================
-- Replacement 1: stop_effort_history
-- Per-stop service effort derived from canonical visits + observations.
-- No user_id. Worker-safe by structure.
-- Populated by R10 (wired in cleanLogService.ts after Tier 1).
-- ============================================================

CREATE TABLE public.stop_effort_history (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id          text NOT NULL REFERENCES transit_stops(stop_id) ON DELETE CASCADE,
  visit_id         bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  run_date         date NOT NULL,
  service_minutes  integer,
  stop_type        text NOT NULL CHECK (stop_type IN ('hotspot', 'compactor', 'standard')),
  complexity_score numeric(4,2),
  had_hazard       boolean NOT NULL DEFAULT false,
  had_infra_issue  boolean NOT NULL DEFAULT false,
  trash_volume     numeric(4,2),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stop_id, visit_id)
);

CREATE INDEX idx_stop_effort_stop_date ON public.stop_effort_history (stop_id, run_date);
CREATE INDEX idx_stop_effort_run_date  ON public.stop_effort_history (run_date);

COMMENT ON TABLE public.stop_effort_history IS
  'Per-stop service effort history. Derived from core.visits and core.observations. '
  'No user_id — worker-safe by structure. Keyed by (stop_id, visit_id).';

-- ============================================================
-- Replacement 2: stop_condition_history
-- Per-stop canonical condition scores over time.
-- No workforce_score. Worker-safe by structure.
-- Populated by R10 (wired in riskMapService.ts after Tier 2).
-- ============================================================

CREATE TABLE public.stop_condition_history (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id            text NOT NULL REFERENCES transit_stops(stop_id) ON DELETE CASCADE,
  visit_id           bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  scored_at          timestamptz NOT NULL DEFAULT now(),
  cleanliness_score  numeric(5,2),
  safety_score       numeric(5,2),
  infra_score        numeric(5,2),
  asset_id           bigint REFERENCES assets(id),
  UNIQUE (stop_id, visit_id)
);

CREATE INDEX idx_stop_condition_stop_scored
  ON public.stop_condition_history (stop_id, scored_at DESC);

COMMENT ON TABLE public.stop_condition_history IS
  'Per-stop condition score history. Derived from core.observations via riskMapService. '
  'No workforce_score — worker-safe by structure. Replaces stop_scoring_history.';
```

### Done criteria (Sub-task B)
- `\dt public.workforce_metrics` — "Did not find any relation"
- `\dt public.stop_scoring_history` — "Did not find any relation"
- `\dt public.stop_effort_history` — table exists with correct schema
- `\dt public.stop_condition_history` — table exists with correct schema
- Both new tables have 0 rows (wiring is R10 — Tier 4 creates the schema only)
- No backend or frontend references to the dropped tables (grep confirms)
- Table comments are present and describe the labor-safety intent

---

## Tier 4 Overall Done Definition

Tier 4 is complete when ALL of the following are true, **and a changelog entry has been written to `docs/changelog/`**:

- [ ] Sub-task A: `public.stops` view uses lowercase column names
- [ ] Sub-task A: All six backend files updated — no uppercase quoted stop column references
- [ ] Sub-task A: Route creation, stop loading, and route detail work end-to-end
- [ ] Sub-task B: `workforce_metrics` dropped
- [ ] Sub-task B: `stop_scoring_history` dropped
- [ ] Sub-task B: `stop_effort_history` table created with correct schema and table comment
- [ ] Sub-task B: `stop_condition_history` table created with correct schema and table comment
- [ ] Sub-task B: Neither new table has a `user_id` or `workforce_score` column
- [ ] Sub-task B: No backend or frontend references to the dropped tables
- [ ] Tier 2 unblocked (Tier 1 done + stops columns lowercase)
- [ ] R10 unblocked (replacement schemas exist, ready for write path wiring)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-4-schema-cleanup.md`

---

## What Tier 4 Does NOT Do

- Does not drop `level3_logs`, `trash_volume_logs`, `hazards`, or `infrastructure_issues` — still read by intelligence until Tier 2 completes
- Does not touch `riskMapService.ts` — that is Tier 2's rewrite (exception: if Tier 2 and Sub-task A run simultaneously, update `riskMapService.ts` as part of Sub-task A)
- Does not rename any `transit_stops` columns — only the VIEW aliases change
- Does not wire write paths to `stop_effort_history` or `stop_condition_history` — that is **R10** (Refinement track), which runs after Tier 1 populates `core.observations` reliably
- Does not populate the replacement tables — they are created empty; R10 wires the population

---

## Agent Launch Blocks

### Sub-task A — Stops view column rename

```
Refactor task. Read CLAUDE.md, then planning/TIER_4_SCHEMA_CLEANUP.md, Sub-task A only.
Write a migration that recreates public.stops view with lowercase column names.
Then update all uppercase "STOP_ID" / "ON_STREET_NAME" etc. references in:
  backend/src/domains/routeRun/routeRunService.ts
  backend/src/domains/routeRun/loaders/loadRouteRunById.ts
  backend/src/modules/admin/adminRoutes.ts
  backend/src/modules/ops/opsRoutes.ts
  backend/src/modules/routes/routeRunRoutes.ts
  backend/src/routes/devRoutes.ts
Do NOT touch riskMapService.ts (Tier 2 will rewrite it).
Do NOT touch any other file.
Preserve the existing INSTEAD OF trigger on the stops view.
```

### Sub-task B — Drop surveillance tables + create replacement schemas

```
Refactor task. Read CLAUDE.md, then planning/TIER_4_SCHEMA_CLEANUP.md, Sub-task B only.
Write a single migration that:
  1. Drops public.workforce_metrics and public.stop_scoring_history
  2. Creates public.stop_effort_history and public.stop_condition_history
     with the exact schemas defined in the file (including COMMENT ON TABLE).
Confirm with grep that no backend or frontend code references the dropped tables
before writing the migration.
Do NOT add any user_id or workforce_score column to the new tables.
Do NOT wire any write paths — the new tables are created empty.
Do not touch any other file. Wiring is R10.
```
