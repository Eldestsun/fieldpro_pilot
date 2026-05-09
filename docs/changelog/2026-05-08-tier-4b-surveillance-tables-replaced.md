# 2026-05-08 — Tier 4B: Surveillance Tables Replaced

## What changed
- Added `backend/migrations/20260508_replace_surveillance_tables.sql`
- Dropped `public.workforce_equity_mv` — a materialized view aggregating
  per-run capacity signals from `workforce_metrics`. Zero backend readers,
  zero frontend readers. Dropped first because it depends on
  `workforce_metrics` and cannot be removed after the table.
- Dropped `public.workforce_metrics` — per-worker performance metrics table
  keyed by `user_id`. No rows, no backend writers.
- Dropped `public.stop_scoring_history` — per-stop scoring table carrying a
  `workforce_score` column implying worker attribution. No rows, no backend
  writers.
- Created `public.stop_effort_history` — per-stop service effort table keyed
  by `(stop_id, visit_id)`. No `user_id`. Worker-safe by structure.
- Created `public.stop_condition_history` — per-stop condition score history
  keyed by `(stop_id, visit_id)`. No `workforce_score`. Worker-safe by
  structure.
- Both new tables are created empty. Write paths are wired in R10 after
  Tier 1 populates `core.visits` and `core.observations` reliably.

## Why
- `workforce_metrics` is keyed by `user_id` — one bad agent prompt away from
  becoming a surveillance instrument. Labor safety guardrails require
  structural removal, not an empty table.
- `stop_scoring_history` carries a `workforce_score` column implying worker
  attribution, which violates the same guardrails.
- `workforce_equity_mv` derives entirely from `workforce_metrics`. Its
  route-level capacity signals (total_minutes, difficulty_score,
  capacity_flag) will be rebuilt from `stop_effort_history` aggregated at
  route level in R10 — with no worker identity in the chain.
- The replacement tables are worker-safe by structure: no `user_id`, no
  `workforce_score`. An admin with a SQL client cannot reconstruct a
  per-worker profile from them because worker identity is not present.
- Sub-task B of Tier 4: prerequisite for R10 (write path wiring).

## Files touched
- `backend/migrations/20260508_replace_surveillance_tables.sql` (new)
