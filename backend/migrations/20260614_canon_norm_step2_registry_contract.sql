-- ============================================================
-- Canonical State Layer — normalized observation shape, STEP 2: registry contract
-- 2026-06-14 — feat/issue-031-canon-norm-step2-registry — ISSUE-031 / CANON-NORM
--
-- Extends core.observation_type_registry from the SEEDER shape to the §4.1 design
-- contract shape (CANONICAL_STATE_LAYER_DESIGN.md §4.1). The live registry today
-- carries only the seeder columns (observation_key, value_type, valid_values,
-- is_required, is_active, sort_order, display_name + the id/org/asset_type keys).
-- The four §4.1 contract columns are ABSENT and added here:
--   * obs_kind       — which of condition|action|measurement|presence this type is
--   * payload_schema — JSON-Schema fragment for the expected payload shape
--   * ok_rule        — rule that produces norm_status (per-kind, §4.2)
--   * severity_map   — rule mapping payload -> norm_severity (NULL if none)
--
-- ── SCOPE OF THIS STEP (intentionally narrow) ───────────────────────────────
--   * Registry columns + obs_kind population ONLY. No application code, no change
--     to core.observations, no normalizer.
--   * obs_kind is POPULATED from the verified four-kind classification (see the
--     grounding table below). payload_schema / ok_rule / severity_map land NULL
--     on purpose — defining them requires the normalizer design (Step 3), and the
--     brief explicitly forbids guessing ok_rules.
--   * Every ADD COLUMN uses IF NOT EXISTS; the CHECK constraint is guarded by an
--     existence check; the obs_kind UPDATEs are by explicit observation_key lists
--     and re-assert the same value on re-run -> the whole migration is idempotent.
--
-- ── RLS NOTE (apply as superuser / bypassrls) ───────────────────────────────
-- core.observation_type_registry is FORCE ROW LEVEL SECURITY. An UPDATE run under
-- a non-superuser role WITHOUT app.current_org_id set would silently affect ZERO
-- rows (CLAUDE.md § RLS Context Gotcha / PATTERN-001). This migration is applied
-- as the postgres superuser (the repo migration convention), which bypasses RLS,
-- so the UPDATEs match across every org. obs_kind is a property of the type_key's
-- SEMANTICS, not of the org, so updating all matching keys org-agnostically is
-- correct.
--
-- ── obs_kind CLASSIFICATION — grounded in the verified design docs ───────────
-- Source of truth: CANONICAL_STATE_LAYER_DESIGN.md §3.5, §4.1, §7 worked example,
-- and the 2026-05-25 ratification changelog (state-layer-ratification-seeding.md
-- + state-layer-observation-model.md). NOT derived from the observation_key string
-- alone (per the brief). Live registry SELECT (id, key, value_type, is_active)
-- pasted into the changelog entry for this migration.
--
--  condition (5):  ground_condition, shelter_condition, pad_condition,
--                  trash_can_condition  -- gradable state assertions, §4.2 condition
--                  spot_check           -- §3.5 stop-level positive anchor, kind=condition
--  action (5):     washed_can           -- §2 inv#7 "can wash"; ratification groups w/ cleaning
--                  picked_up_litter, emptied_trash, washed_shelter, washed_pad
--                                       -- ratification + §7: kind=action
--  measurement (1):trash_volume         -- §7 worked example: explicitly measurement
--  presence (18):  safety_concern_present (retired umbrella, §2.1 — presence kind),
--                  encampment_present, fire_present, dangerous_activity_present,
--                  drug_use_present, violence_present, biohazard_present,
--                  access_blocked, other_safety_concern_present,
--                  infrastructure_issue_present (surviving umbrella, §2.1),
--                  glass_damage_present, graffiti_present, receptacle_damage_present,
--                  shelter_panel_damage_present, lighting_failure_present,
--                  access_obstructed_by_landscape, structural_damage_present,
--                  other_infrastructure_issue_present
--                                       -- ratification reconciliation tables + §7: presence
--
--  UNCLASSIFIED — LEFT NULL ON PURPOSE (1):
--                  stop_not_serviced_due_to_safety (id 8, RETIRED is_active=false)
--    §9 item 2 names this the ONE ambiguous row: it does NOT map cleanly to any of
--    the four kinds — it was a duplicate of core.visits.outcome='skipped' and was
--    retired under §2.1, not reclassified into a kind. Per the brief ("leave NULL
--    if the ratification doc doesn't cover them — flag any unclassified rows"), it
--    stays NULL. The obs_kind CHECK passes on NULL, so the row remains valid.
--
-- ── LIVE-SCHEMA RECONCILIATION (verified 2026-06-14, postgres superuser) ─────
--   * None of obs_kind / payload_schema / ok_rule / severity_map exist on the
--     registry yet (confirmed absent).
--   * §4.1 DDL shows obs_kind NOT NULL + payload_schema NOT NULL. This step lands
--     them NULLABLE: obs_kind is populated for all rows but one (the retired
--     ambiguous row stays NULL), and payload_schema/ok_rule are deferred to the
--     normalizer step, so NOT NULL cannot be asserted yet. Tightening to NOT NULL
--     is a follow-on once Step 3 fills the remaining columns.
-- ============================================================

BEGIN;

-- 1. obs_kind — the four-kind taxonomy (§4.1). Lands NULLABLE; populated below for
--    every active type and every retired type with a clean classification.
ALTER TABLE core.observation_type_registry
    ADD COLUMN IF NOT EXISTS obs_kind text NULL;

-- 2. payload_schema — JSON Schema for write-time payload validation (§4.1, §6).
--    NULL until the normalizer design (Step 3) defines per-type schemas.
ALTER TABLE core.observation_type_registry
    ADD COLUMN IF NOT EXISTS payload_schema jsonb NULL;

-- 3. ok_rule — the per-kind OK rule that yields norm_status (§4.1, §4.2). NULL for
--    now; defining these correctly requires the normalizer design (brief: do NOT
--    guess ok_rules).
ALTER TABLE core.observation_type_registry
    ADD COLUMN IF NOT EXISTS ok_rule jsonb NULL;

-- 4. severity_map — raw reading -> 0..N common severity scale (§4.1). NULL until
--    the normalizer step; may stay NULL for types without severity.
ALTER TABLE core.observation_type_registry
    ADD COLUMN IF NOT EXISTS severity_map jsonb NULL;

-- obs_kind value-domain CHECK (§4.1). Guarded — ADD CONSTRAINT has no IF NOT
-- EXISTS form. A CHECK is satisfied when its expression is not FALSE, so this
-- PASSES on the one NULL row (stop_not_serviced_due_to_safety) left behind.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'core.observation_type_registry'::regclass
          AND conname  = 'obs_type_registry_obs_kind_chk'
    ) THEN
        ALTER TABLE core.observation_type_registry
            ADD CONSTRAINT obs_type_registry_obs_kind_chk
            CHECK (obs_kind IN ('condition','action','measurement','presence'));
    END IF;
END $$;

-- Populate obs_kind from the verified classification (explicit key lists, not a
-- string-pattern derivation). Re-running re-asserts the same value -> idempotent.

-- condition (5)
UPDATE core.observation_type_registry
   SET obs_kind = 'condition'
 WHERE observation_key IN (
        'ground_condition',
        'shelter_condition',
        'pad_condition',
        'trash_can_condition',
        'spot_check'
       );

-- action (5)
UPDATE core.observation_type_registry
   SET obs_kind = 'action'
 WHERE observation_key IN (
        'washed_can',
        'picked_up_litter',
        'emptied_trash',
        'washed_shelter',
        'washed_pad'
       );

-- measurement (1)
UPDATE core.observation_type_registry
   SET obs_kind = 'measurement'
 WHERE observation_key IN (
        'trash_volume'
       );

-- presence (18) — incl. the retired safety umbrella and the surviving infra
-- umbrella (both are presence-kind problem flags, §2.1).
UPDATE core.observation_type_registry
   SET obs_kind = 'presence'
 WHERE observation_key IN (
        'safety_concern_present',
        'encampment_present',
        'fire_present',
        'dangerous_activity_present',
        'drug_use_present',
        'violence_present',
        'biohazard_present',
        'access_blocked',
        'other_safety_concern_present',
        'infrastructure_issue_present',
        'glass_damage_present',
        'graffiti_present',
        'receptacle_damage_present',
        'shelter_panel_damage_present',
        'lighting_failure_present',
        'access_obstructed_by_landscape',
        'structural_damage_present',
        'other_infrastructure_issue_present'
       );

-- stop_not_serviced_due_to_safety (retired, ambiguous) is intentionally NOT in
-- any list above and remains obs_kind = NULL. See header.

COMMIT;
