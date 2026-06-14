# 2026-06-14 — CANON-NORM Step 2: extend observation_type_registry to the §4.1 contract shape

ISSUE-031 / CANON-NORM — Finish the Canonical State Layer normalized observation
shape. Step 2 of the multi-step build. Step 1 (the five normalized columns on
`core.observations`, commit 78ef838) is on its own branch / draft PR and is not
touched here.

## What changed

- **New migration** `backend/migrations/20260614_canon_norm_step2_registry_contract.sql`
  extends `core.observation_type_registry` from the seeder shape to the
  CANONICAL_STATE_LAYER_DESIGN.md §4.1 contract shape, adding four columns
  (`IF NOT EXISTS`, all NULLABLE):
  - `obs_kind text` — the four-kind taxonomy (`condition|action|measurement|presence`)
  - `payload_schema jsonb` — JSON-Schema fragment for write-time payload validation
  - `ok_rule jsonb` — the per-kind OK rule that produces `norm_status` (§4.2)
  - `severity_map jsonb` — payload → `norm_severity` mapping
- **`obs_kind` populated** for 29 of 30 rows from the verified four-kind
  classification (explicit `observation_key` lists, not string-pattern derivation):
  - condition (5): `ground_condition`, `shelter_condition`, `pad_condition`,
    `trash_can_condition`, `spot_check`
  - action (5): `washed_can`, `picked_up_litter`, `emptied_trash`,
    `washed_shelter`, `washed_pad`
  - measurement (1): `trash_volume`
  - presence (18): `safety_concern_present` (retired umbrella),
    `infrastructure_issue_present` (surviving umbrella), the 8 specific safety
    `*_present` types, and the 8 specific infrastructure presence types
- **One row left `obs_kind = NULL` and flagged:** `stop_not_serviced_due_to_safety`
  (id 8, retired `is_active=false`). §9 item 2 names this the single ambiguous row
  — it was a duplicate of `core.visits.outcome='skipped'` and was retired under
  §2.1, never reclassified into one of the four kinds. Per the brief, it stays NULL.
- **`payload_schema` / `ok_rule` / `severity_map` left NULL on all 30 rows.**
  Defining these correctly requires the Step 3 normalizer design; the brief
  explicitly forbids guessing ok_rules.
- **`obs_kind` value-domain CHECK** `obs_type_registry_obs_kind_chk` added
  (guarded; passes on the one NULL row).
- **Rollback** `backend/migrations/rollback/20260614_canon_norm_step2_registry_contract_rollback.sql`.

## Why

- §4.1 is the registry contract the Step 3 normalizer reads to classify each
  observation and compute `norm_status` / `norm_severity` / `intervention`. The
  live registry carried only the seeder columns; the four contract columns were
  absent (per the §9 live-schema reconciliation table). This step adds them and
  grounds `obs_kind` in the verified ratification classification so the normalizer
  has a real `obs_kind` to switch on.
- `obs_kind` is populated now (the classification is settled and documented);
  `payload_schema` / `ok_rule` / `severity_map` are deferred because they are
  normalizer-design decisions, not transcription.

## Migration shape / constraints

- Migration is idempotent: `IF NOT EXISTS` on each ADD COLUMN, guarded CHECK, and
  obs_kind UPDATEs that re-assert the same value on re-run.
- `core.observation_type_registry` is FORCE ROW LEVEL SECURITY — the migration
  must run as superuser/bypassrls (the repo convention; applied via the postgres
  superuser). An UPDATE under a non-superuser role without `app.current_org_id`
  would silently affect zero rows (CLAUDE.md § RLS Context Gotcha / PATTERN-001).
- §4.1 shows `obs_kind`/`payload_schema` NOT NULL; this step lands them NULLABLE
  because the deferred columns cannot yet satisfy NOT NULL. Tightening is a
  follow-on after Step 3.

## Verification

- Applied cleanly to dev DB (`UPDATE 5 / 5 / 1 / 18` = 29 classified, 1 NULL).
- Distribution after apply: condition 5, action 5, measurement 1, presence 18,
  NULL 1 (= 30 rows). All `payload_schema`/`ok_rule`/`severity_map` NULL on every
  row.
- Columns confirmed present and NULLABLE; CHECK constraint
  `obs_type_registry_obs_kind_chk` confirmed.

## Files touched

- `backend/migrations/20260614_canon_norm_step2_registry_contract.sql` (new)
- `backend/migrations/rollback/20260614_canon_norm_step2_registry_contract_rollback.sql` (new)
- `docs/changelog/refactor/2026-06-14-issue-031-canon-norm-step2-registry.md` (this entry)
