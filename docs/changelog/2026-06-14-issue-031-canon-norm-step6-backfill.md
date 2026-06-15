# 2026-06-14 — CANON-NORM Step 6: backfill normalized columns on existing observations

## What changed
- Added `backend/migrations/20260614_canon_norm_step6_backfill_observations.sql`: a one-shot
  SQL UPDATE that runs the normalizer logic over the 18 pre-normalizer rows in
  `core.observations` (ids 39–56), via a JOIN to `core.observation_type_registry` on the
  text key (`observation_type = observation_key`) — no hardcoded type strings.
- Per row it sets `type_id` (registry FK), `obs_kind`, and:
  - `norm_status` / `norm_severity` only for `measurement` rows with `ok_rule` / `severity_map`
    (evaluated against `payload`); NULL for all other kinds.
  - `intervention` = `observation_type` only for `action` rows; NULL otherwise.
- Added the matching rollback in `backend/migrations/rollback/`.
- Applied to live `fieldpro_db` (UPDATE 18). This closes
  `CANONICAL_STATE_LAYER_DESIGN.md` §9 item 4.

## Backfill result (verified)
- 18/18 rows now have `type_id` and `obs_kind` (no orphans — every `observation_type`
  resolved to a registry row).
- `norm_status` / `norm_severity` set on the 4 `trash_volume` rows only: levels {2,2,3,2}
  → all `not_ok` (ok_rule `level <= 1`), severities {2,2,3,2}.
- `intervention` set on the 8 `action` rows only (picked_up_litter ×4, emptied_trash ×4).
- `condition` (spot_check ×2) and `presence` (encampment/graffiti/shelter_panel_damage/
  biohazard ×4) rows keep all normalized columns NULL by design (no manufactured state).

## §9 item 4 arrival-state reconciliation (invariant #5)
- The only `condition` rows are two `spot_check` rows (ids 45, 50), each `payload {}` with a
  real `visit_id` and worker `observed_at`. A spot_check is a worker-recorded condition check,
  not an auto-generated "dirty on arrival" assertion. The retired arrival-phase write left no
  surviving rows. Invariant #5 (no stored arrival state) passes cleanly — nothing reclassified
  or marked legacy. (Policy if such a row ever appears: surface for a decision, do not silently
  reclassify.)

## Why
- Steps 1–5 normalized NEW writes but left the 18 historical rows with NULL normalized
  columns. Intelligence/MV reads target the normalized columns, so history had to be brought
  into the canonical shape to be readable consistently with new data.

## Files touched
- backend/migrations/20260614_canon_norm_step6_backfill_observations.sql (new)
- backend/migrations/rollback/20260614_canon_norm_step6_backfill_observations_rollback.sql (new)
- docs/changelog/2026-06-14-issue-031-canon-norm-step6-backfill.md (this file)
