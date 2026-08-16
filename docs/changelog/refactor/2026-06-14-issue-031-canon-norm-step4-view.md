# 2026-06-14 — CANON-NORM Step 4: normalized read seam (`core.v_observation_normalized`)

ISSUE-031 / CANON-NORM — Finish the Canonical State Layer normalized observation
shape. Steps 1–3 added the 5 normalized columns to `core.observations`, extended
`core.observation_type_registry` to the §4.1 contract, and wired the write-time
normalizer. Step 4 (this change) creates the §4.3 read seam — the single view
intelligence and dashboards read for asserted facts.

## What changed
- New migration `backend/migrations/20260614_canon_norm_step4_normalized_view.sql`
  creates `core.v_observation_normalized` via `CREATE OR REPLACE VIEW` (idempotent).
- The view is a straight passthrough of `core.observations`, projecting the §4.3
  column set exactly: `id, org_id, visit_id, asset_id, type_id, observed_at,
  obs_kind, norm_status, norm_severity, intervention`. No registry join; raw
  `observation_type` and `payload` are deliberately not projected.
- Rollback added under `migrations/rollback/`.

## Why
- §4.3: this view is the one place the normalized projection lives. Because
  normalization happens at write, it is a passthrough today, but it is the seam —
  if normalization logic ever changes, it changes here once, for every industry
  and every signal. Consumers read the two-axis surface (`obs_kind` + `norm_status`),
  existence-of-row (presence), or `intervention` — never `payload`.
- Decouples the eventual intelligence repoint (Step 5) from the base table.

## Verification
- Confirmed live the view did NOT pre-exist before creating it.
- Applied as the postgres superuser (repo migration convention). `SELECT * LIMIT 5`
  returns the 18 existing rows; normalized columns are NULL on all of them
  (backfill is Step 6 — expected and correct). `count(*) = 18`, `count(obs_kind) = 0`.
- RLS unchanged: a view is not an RLS object; reads through it run under the
  querying role's context, so `core.observations` org-isolation still applies.
- Grepped `riskMapService.ts` and `adminRoutes.ts` for `v_observation_normalized`:
  **no matches** — nothing reads the view yet, as expected (Step 5 = wiring,
  Step 6 = backfill).

## Honest residual
- **Intelligence repoint** (Step 5): `riskMapService.ts` and dashboards still read
  raw `observation_type` today; pointing them at this view is the next step.
- **Backfill of the 18 historical rows** is Step 6 (§9 item 4) — until then the
  view shows NULL normalized columns for pre-Step-3 observations.

## Files touched
- `backend/migrations/20260614_canon_norm_step4_normalized_view.sql` (new)
- `backend/migrations/rollback/20260614_canon_norm_step4_normalized_view_rollback.sql` (new)
- `docs/changelog/2026-06-14-issue-031-canon-norm-step4-view.md` (this file)
