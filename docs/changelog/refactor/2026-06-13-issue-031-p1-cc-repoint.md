# 2026-06-13 — ISSUE-031 P1 CC-REPOINT: repoint Control Center reads to canonical

## What changed
Repointed the 5 Control Center reader sites in
`backend/src/modules/admin/adminRoutes.ts` from the identity-bearing transit log
views (`core.v_clean_logs_transit`, `core.v_hazards_transit`) to the identity-free
canonical layer. In place — no handler relocation, no new files.

- **`GET /admin/control-center/overview`** (2 sites):
  - Clean events / total clean minutes now from **`core.visits`**
    (`outcome='completed' AND ended_at IS NOT NULL`; a completed visit = a clean
    event; duration = `ended_at - started_at`).
  - Hazards now from **`core.observations`** filtered to the 8 pinned safety
    `*_present` types (keyed by `observed_at`).
- **`GET /admin/control-center/difficulty`** (3 sites):
  - heavyStops, heavyRoutes, hotspots clean-event reads now from **`core.visits`**;
    location label / `stop_id` from the canonical spine
    (**`core.locations` + `core.location_external_ids`**, `source_system='metro_stop'`);
    route/pool grouping from **`core.assignments`** via the `visit.assignment_id`
    link (replacing `core.v_assignments_transit`).
- Added module-level constant `SAFETY_HAZARD_OBSERVATION_TYPES` (the 8 pinned safety
  types per DQ A3) — used as a bound `= ANY($1::text[])` parameter in `/overview`.
- **Shape change (DQ A2):** removed `high_severity_hazards` from the `/overview`
  response and its OpenAPI schema/example. Canonical `severity` is a sparse text
  column (populated ~2/18 rows) and the risk job synthesizes it as `1.0`; no
  text→numeric mapping was invented. The high-severity cut is a tracked gap to be
  restored in the MV-4 / DQ-4 intelligence pass.
- **Shape change (clean minutes):** `total_clean_minutes` is now derived from visit
  wall-clock (`ended_at - started_at`) rather than worker-entered
  `clean_logs.duration_minutes`. Counts are identical; the minutes total shifts
  slightly (see verification).

## Why
- ISSUE-031 P1, CC-REPOINT. The transit log views expand
  `clean_logs.user_id` / `hazards.reported_by` (worker identity); reading the
  canonical entity tables instead makes the Control Center reads identity-free by
  construction. Conforms to the §6.3 reader-site inventory
  (`docs/audit/2026-06-06-canonical-core-complete-inventory.md`) and the canonical
  precedent set by `riskMapService` (§6.1), which already reads only
  `core.visits` + `core.observations`.
- DQ A2/A3 from `planning/architecture/2026-06-11-issue-031-dq-decisions.md`.

## Verification (paste-back)

**Grep 1 — no identity columns in rewritten reads**
`grep -n 'user_id\|worker_id\|employee_id' … | grep -v '//'` → only hit is line 594
(`rr.user_id` in the out-of-scope `/admin/route-runs` handler — not touched).
`/overview` and `/difficulty` are identity-free.

**Grep 2 — no transit log views**
`grep -n 'v_clean_logs_transit\|v_hazards_transit\|clean_logs\|hazards' … | grep -v '//'`
→ no `v_clean_logs_transit` / `v_hazards_transit` anywhere. Remaining `clean_logs` /
`hazards` hits are all out-of-scope handlers (`/admin/clean-logs`, `/routes`,
`/exceptions`) plus the canonical metric field-name `hazards_reported` in `/overview`.

**Tests:** `npm test --prefix backend` → 111 passed, 0 failed. `tsc --noEmit` → clean.

**Before/after (all-time, date-unfiltered; "today"=2026-06-13 has no seeded rows so
both sides return 0):**

| Metric | Before (adapter views) | After (canonical) |
|--------|------------------------|-------------------|
| clean_events | 6 | 6 (exact match) |
| total_clean_minutes | 30 (`clean_logs.duration_minutes`) | 27.29 (`ended_at - started_at`) |
| hazards_reported | 2 | 2 (exact match) |
| high_severity_hazards | 0 | field removed (A2) |

Each repointed `/difficulty` sub-query was executed against the live DB on the
seeded date (2026-06-01) and returns the same column shape as before
(heavyStops: `location_id, label, stop_id, on_street_name, intersection_loc,
difficulty_band`; heavyRoutes: `route_id, pool_label, difficulty_density_band`;
hotspots: `pool_label, heavy_stop_count`). `pool_label` value changes from
`route_stop` (v_assignments_transit constant) to `transit_stop_clean`
(core.assignments constant).

## Honest residual
- `frontend/src/components/admin/AdminControlCenter.tsx` still renders a
  "High Severity" StatCard bound to `summary?.high_severity_hazards ?? 0`. With the
  field now omitted it degrades gracefully to `0` (no crash), but the tile is now
  vestigial. Cleaning it up is a frontend change outside this task's
  `adminRoutes.ts`-only constraint; flagged for follow-up alongside the MV-4/DQ-4
  high-severity restoration.

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `docs/changelog/refactor/2026-06-13-issue-031-p1-cc-repoint.md` (new)
