# NI-1 / NI-2 / NI-4 — seed live-only config & registry so a dev rebuild is non-destructive

**Date:** 2026-06-28 · **Type:** Data (seed migrations) · **Branch:** `data/seed-live-only-config-pre-rebuild`
**Spec:** `docs/audit/2026-06-27-clean-build-vs-live-diff.md` § PRE-REBUILD CAPTURE LIST (the closed-set recon).
**Cards:** NI-1 (required), NI-2 (recommended), NI-4 (resolved in-pass).

## Problem

The clean-build-vs-live recon proved the only thing that makes a dev rebuild **unsafe** is
**LIVE-ONLY-TRUTH**: rows that exist solely in live dev data because **no migration ever seeds them**.
- ⚠️ **`core.observation_type_registry` (30 rows) — make-or-break.** No migration anywhere INSERTs
  registry rows; the chain only ADDS the §4.1 columns (`20260614_canon_norm_step2`) and UPDATEs
  `ok_rule`/`severity_map` by `obs_kind` (`20260614_step3`, `20260617_p1`) on **presumed-existing**
  rows. A clean rebuild → empty registry → those UPDATEs no-op → the write-time normalizer finds no
  rule → all observations get all-NULL normalized columns → every intelligence/dashboard surface that
  reads `obs_kind`/`norm_status`/`norm_severity` is dead.
- Operational config carried only in live: `core.asset_types`, `public.asset_types`, `public.bases`,
  `public.route_pools`.

## What changed

Two **additive, idempotent** seed migrations. Rows are dumped **verbatim from live**
(`pg_dump --column-inserts`) — exact post-normalization final values, not reconstructed.

1. **`backend/migrations/20260628_seed_a_live_config.sql`** (NI-2) — seeds, in FK-safe order:
   `public.asset_types` (1), `core.asset_types` (1), `public.bases` (2), `public.route_pools` (12).
   `core.asset_types` precedes the registry seed because `observation_type_registry.asset_type_id →
   core.asset_types(id)`. `route_pools` follows `bases` (`route_pools.base_id → bases.id`).
2. **`backend/migrations/20260628_seed_b_observation_type_registry.sql`** (NI-1) — seeds the exact 30
   registry rows. Sorts **after** every registry-mutating migration; on a clean build the earlier
   UPDATEs run first against an empty registry (harmless 0-row no-ops), then this seed inserts the
   final state — **no existing migration was modified or reordered**.

Both: `ON CONFLICT DO NOTHING` on every row (covers PK and unique constraints → 0-row no-op on re-run
or apply-to-already-populated-DB); `BEGIN; SET LOCAL app.current_org_id = '1'; … COMMIT;` (runner is
`fieldpro_admin` BYPASSRLS, and the explicit org context lets the fail-closed `WITH CHECK` pass even
under a non-bypass role); recorded in `public.schema_migrations` by the runner (Migration Recording
Discipline — no out-of-band apply).

## NI-4 decision — `stop_not_serviced_due_to_safety` `obs_kind = NULL`: **CORRECT** (seeded NULL)

Determination: NULL is **correct, not a defect** — seeded verbatim with an explanatory comment in the
migration. Evidence:
1. `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` **L136**: this key was **RETIRED** and
   replaced by `core.visits.outcome='skipped'` + `reason_code='safety'` — "a duplicate fact in a
   second table… two sources of truth for did this stop get serviced." It is no longer modeled as an
   observation.
2. Same doc **L719–723** (RESOLVED 2026-05-25): it was "the one ambiguous row" that does **not** fit
   the four-kind taxonomy and was retired for exactly that reason. Assigning any kind would
   re-manufacture the duplicate state the design eliminated (no-manufactured-state).
3. The row is `is_active = false` — the write path never offers it for new observations.
4. `observationNormalizer.ts` handles NULL `obs_kind` gracefully (`rule.obs_kind ?? null` → all-NULL
   fields, never throws), so the NULL cannot break normalization.

Contrast: `id=7 safety_concern_present` is also retired but keeps `obs_kind='presence'` (it *was* a
presence observation, superseded by specific `*_present` types). `id=8` differs — replaced by a
non-observation mechanism — so it correctly carries no kind.

## Proof (clean-room rebuild)

Fresh isolated `postgres:14` (port 5499) → `db/init` bootstrap → full chain as `fieldpro_admin`:

1. **Build green:** RUN1 exit 0, **30 applied** (28 prior + the 2 new seeds), "Migration run complete."
2. **Counts match live:** registry 30/30, `core.asset_types` 1/1, `public.asset_types` 1/1, `bases`
   2/2, `route_pools` 12/12.
3. **Row-for-row equality (full column md5, ordered):** registry `bf97d8da…` **identical** live==clean;
   all four config tables md5-identical live==clean.
4. **Idempotent:** RUN2 exit 0, **0 applies** (both seeds skipped).
5. **Normalizer functions** (the empty-registry break is gone): the exact `loadRegistryRules` SELECT
   returns rules — `trash_volume` → `ok_rule {field:level, lte:1}` + `severity_map {field:level}`
   (graded measurement), presence → `{field:severity}` passthrough, action/condition NULL by design.
   `obs_kind` populated on all active rows (action 5, condition 5, measurement 1, presence 18); the
   **only** NULL is `stop_not_serviced_due_to_safety` (`is_active=false`) — the NI-4 row.

No mutation of the live dev DB (read-only dump for capture). Seeds verified only on the throwaway DB —
not hand-applied to live. The rebuild itself is a separate, founder-run step.

## Follow-ups

- This unblocks a **safe** dev rebuild (the act that collapses the DRIFT-class cards per the recon).
  Remaining LIVE-ONLY item intentionally **not** captured: `mcp_readonly` LOGIN (NI-3 — a credential
  decision, not seed data).
- The KCM stop inventory and field/audit data remain dev data (re-ingestable) — intentionally not
  seeded; a dev rebuild starts them empty.
