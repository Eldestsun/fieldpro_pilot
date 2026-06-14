# 2026-06-14 — ISSUE-031 / CANON-NORM Step 1: normalized observation columns

## What changed
- Added the five normalized columns to `core.observations` via an in-place migration
  (`backend/migrations/20260614_canon_norm_step1_observation_columns.sql`), per
  `CANONICAL_STATE_LAYER_DESIGN.md` §3.3:
  - `obs_kind text NULL` — four-kind taxonomy (condition | action | measurement | presence)
  - `norm_status text NULL` — kind-conditional (ok | not_ok | unknown; NULL for presence/action)
  - `norm_severity smallint NULL` — 0..N common scale
  - `intervention text NULL` — populated only for `obs_kind='action'`
  - `type_id bigint NULL REFERENCES core.observation_type_registry(id)` — FK to the registry rule
- Added three guarded value-domain CHECK constraints (`observations_obs_kind_chk`,
  `observations_norm_status_chk`, `observations_norm_severity_chk`) — all satisfied by
  the NULL rows this step leaves behind.
- Added a matching rollback script under `backend/migrations/rollback/`.
- **Resolved §9 item 4's open in-place-vs-shadow decision: IN-PLACE.** 18 rows on a dev
  DB do not warrant shadow-column overhead. Decision documented in the migration header.

## Why
- The normalized columns are the persisted surface intelligence/dashboards will read
  instead of raw `payload` / `observation_type` (§4.3, §8). They are the first gate of
  the normalized-shape epic — every later step (registry migration, normalizer, read
  seam, backfill) needs somewhere to write.
- Columns land NULLABLE and unpopulated: no backfill, no NOT NULL. All 18 existing rows
  stay valid; nothing reads these columns until the normalizer (Step 3) and read seam
  (Step 4) land. Present-but-unwired is the correct state for this step.

## Verification (dev DB, applied cleanly 2026-06-14)
Population check after migration:

| total | has_obs_kind | has_norm_status | has_norm_severity | has_intervention | has_type_id |
|---|---|---|---|---|---|
| 18 | 0 | 0 | 0 | 0 | 0 |

All five columns present (correct types, all nullable); all NULL (normalizer not yet
built). FK `observations_type_id_fkey` and the three CHECK constraints confirmed present.

## Scope boundaries (explicit)
- Migration only — no application-code, registry, or normalizer change.
- No backfill (Step 6). No NOT NULL constraints. Raw `observation_type` + `payload` stay.

## Files touched
- `backend/migrations/20260614_canon_norm_step1_observation_columns.sql` (new)
- `backend/migrations/rollback/20260614_canon_norm_step1_observation_columns_rollback.sql` (new)
- `docs/changelog/2026-06-14-issue-031-canon-norm-step1-columns.md` (new)
