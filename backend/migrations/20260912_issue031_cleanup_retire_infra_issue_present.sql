-- ============================================================================
-- ISSUE-031-CLEANUP — retire the orphaned 'infrastructure_issue_present'
-- registry entry (last thread of the ISSUE-031 adapter→core arc).
--
-- WHY: the generic infra umbrella was retired under the §2.1 umbrella
-- anti-pattern (CANONICAL_STATE_LAYER_DESIGN.md, 2026-05-25 write-path cleanup)
-- and no write path has emitted it since — the 8 specific infra `*_present`
-- types are the live discriminator, confirmed again by the ISSUE-031
-- infrastructure_issues Stage-2 clip (2026-06-18). The long-lived dev DB
-- carries is_active=false from the pre-consolidation legacy retirement, but the
-- consolidated seed (20260628_seed_b_observation_type_registry.sql, row id 17)
-- seeds the entry is_active=TRUE and no later migration corrects it — so a
-- FRESH clean-room build resurrects the orphan and diverges from every
-- long-lived environment. This migration re-asserts the retirement on top of
-- the seed (lexical order guarantees it runs after seed_b on fresh builds).
--
-- RETIREMENT NOTE (per the board card; the registry has no per-row note
-- column, so this header + the changelog entry are the durable note):
--   "Retired — write path removed by ISSUE-031 infrastructure_issues Stage-2
--    clip. Historical rows (if any) preserved."
--
-- DATA SAFETY: registry flag only; touches ZERO core.observations rows.
-- Verified live 2026-09-12: 0 rows with
-- observation_type = 'infrastructure_issue_present'.
--
-- RLS NOTE: core.observation_type_registry is FORCE ROW LEVEL SECURITY. The
-- runner connects as fieldpro_admin (BYPASSRLS) on the provisioner path, so the
-- UPDATE matches across every org — correct, because retirement is a property
-- of the type's SEMANTICS, not of an org (same rationale as the 20260614 step2
-- header). SET LOCAL app.current_org_id keeps the statement effective under a
-- non-bypass fallback runner too (all live registry rows are org 1 — matches
-- seed_b's own convention).
--
-- IDEMPOTENT: the WHERE clause matches zero rows on re-run.
-- ============================================================================
BEGIN;
SET LOCAL app.current_org_id = '1';

UPDATE core.observation_type_registry
   SET is_active = false
 WHERE observation_key = 'infrastructure_issue_present'
   AND is_active = true;

COMMIT;
