# 2026-09-12 — ISSUE-031-CLEANUP: retire orphaned `infrastructure_issue_present` registry entry

## What changed
- New migration `backend/migrations/20260912_issue031_cleanup_retire_infra_issue_present.sql`:
  idempotent `UPDATE core.observation_type_registry SET is_active = false` for
  `observation_key = 'infrastructure_issue_present'`. Registry flag only — zero
  `core.observations` rows touched (verified live: **0 rows** carry
  `observation_type = 'infrastructure_issue_present'`, so there is no historical
  data to preserve, and none was deleted).
- Retirement note (the registry has no per-row note column; the migration header
  and this entry are the durable note): *"Retired — write path removed by
  ISSUE-031 infrastructure_issues Stage-2 clip. Historical rows (if any)
  preserved."*
- Applied to the dev DB via `npm run migrate` on the provisioner path
  (`fieldpro_admin`, BYPASSRLS) and recorded in `public.schema_migrations` in the
  same run (ISSUE-038 discipline). On dev the UPDATE was a no-op by design — see
  the finding below.

## Finding — the card's premise had shifted; the real defect was seed regression
- The board card (written 2026-06-19) said the live entry was `is_active=true`.
  The **live dev DB already carries `is_active=false`** (30 registry rows /
  27 active — matching the design doc §9 tombstone accounting), from the
  pre-consolidation legacy retirement (2026-05-25 write-path cleanup), preserved
  through the consolidated seed's `ON CONFLICT DO NOTHING`.
- But the consolidated seed **`20260628_seed_b_observation_type_registry.sql`
  (row id 17) seeds the entry `is_active=TRUE`**, and no later migration
  corrected it. A fresh clean-room build therefore **resurrected the orphan**
  and diverged from every long-lived environment — exactly the ISSUE-038/039
  "fresh build ends in a different posture" failure class, one layer up
  (seed data instead of grants).
- The new migration closes that: it sorts lexically after seed_b, so fresh
  builds seed-then-retire and converge with dev. On long-lived DBs it matches
  zero rows (idempotent re-assert).
- seed_b itself was deliberately **not** edited — it is already recorded as
  applied; correcting forward via a new runner-owned migration keeps history
  auditable and apply-order semantics intact.

## Verification
- **Dev DB:** migration applied + recorded (`schema_migrations` row present);
  registry id 17 `is_active=f`; observations count for the type = 0.
- **Clean-room gate (ISSUE-038):** ephemeral `postgres:14` container with the
  repo's `db/init/00_bootstrap_provisioner.sh` bootstrap → full chain
  `npm run migrate` as `fieldpro_admin` → **exit 0**, all migrations apply,
  registry lands **30 rows / 27 active** with id 17 retired — byte-identical
  posture to dev. Container destroyed after verification.
  (Note: a scratch DB inside the *dev* cluster cannot run the gate — the
  cluster retains no superuser post-ISSUE-041 downgrade, so the consolidated
  schema's C-extension step fails there. The ephemeral-container mirror of the
  CI bootstrap is the correct local gate.)
- RLS: the migration uses `SET LOCAL app.current_org_id = '1'` (seed_b
  convention) so it stays effective even under a non-bypass fallback runner;
  on the provisioner path BYPASSRLS applies it org-agnostically, which is
  correct — retirement is a property of the type's semantics, not of an org.
- `pg_state.sql` regenerated (schema-only; unchanged by this data-only
  migration).

## Why
- Last thread of the ISSUE-031 adapter→core arc: the generic infra umbrella
  violates the §2.1 umbrella anti-pattern (CANONICAL_STATE_LAYER_DESIGN.md) —
  the 8 specific infra `*_present` types are the live discriminator; nothing
  has emitted the umbrella since the Stage-2 write-clip (2026-06-18).
- An `is_active=true` registry entry that no write path can produce corrupts
  the §4.4 absence-as-counted-signal denominator (registry-declared possible
  types) the moment Intelligence (P3) builds on it.

## Files touched
- `backend/migrations/20260912_issue031_cleanup_retire_infra_issue_present.sql` (new)
- `docs/changelog/refactor/2026-09-12-issue-031-cleanup-retire-infra-registry.md` (this entry)
