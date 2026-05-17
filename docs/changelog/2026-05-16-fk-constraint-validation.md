# 2026-05-16 — Validate deferred FK constraints on production DB

## What changed
- Ran `ALTER TABLE ... VALIDATE CONSTRAINT` for all four NOT VALID FK constraints
  deferred during the KCM stop seed import:
  - `public.route_run_stops` → `route_run_stops_hazard_id_fkey`
  - `public.route_run_stops` → `route_run_stops_infra_issue_id_fkey`
  - `public.hazards` → `hazards_route_run_stop_id_fkey`
  - `public.infrastructure_issues` → `infrastructure_issues_route_run_stop_id_fkey`
- All four constraints validated successfully; `pg_constraint.convalidated` is now
  `true` for every constraint listed above

## Why
- Constraints were created with `NOT VALID` during bulk seed import to avoid a full
  table scan at import time; validation was deferred to post-import cleanup
- Validating enforces referential integrity going forward and removes the NOT VALID
  flag that would otherwise suppress the planner's FK-based optimizations

## Files touched
- `docs/changelog/2026-05-16-fk-constraint-validation.md` (this file)

## Outcome
No orphaned rows were found. No data modifications were required. The production
database baseline_db (Render: baseline-db) is now fully referentially consistent
across these four FK relationships.
