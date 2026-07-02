-- ============================================================
-- ISSUE-052 resolution: export_delete_tokens.org_id is INTENTIONALLY text
-- 2026-07-01 — Branch B (INTENTIONAL) of the pre-authorized 052 decision.
--
-- RECON EVIDENCE (the reason this file documents instead of migrating):
--   * WRITER — backend/src/modules/admin/exportDeleteRoutes.ts:193 INSERTs
--     org_id = tenantUuid (reqTenantUuid(req) = the Azure Entra tenant UUID,
--     e.g. '66d756aa-…'), NOT the numeric organizations.id. The original DDL
--     (legacy_20260513_s1_4_export_delete_tokens.sql:46) comments the column:
--     "Azure tenant UUID (req.user.tid)".
--   * READERS — exportDeleteRoutes.ts:265/:332 read org_id back and do a
--     STRING equality against the caller's tenant UUID for the cross-org
--     check (`tokenOrgId !== tenantUuid` → 403). Readers depend on the UUID
--     string semantics.
--   * DATA — live table empty at decision time; decision rests on writer
--     intent, which is unambiguous.
-- A bigint migration would therefore BREAK the export-and-delete flow, not
-- fix drift. Per the strict 052 bar (any non-numeric writer → intentional),
-- the type stays text.
--
-- CONSEQUENCES THIS RECORDS (so no future author "fixes" them):
--   * MT-2's fail-closed RLS predicate on THIS table correctly keeps the
--     TEXT form (org_id = NULLIF(current_setting('app.current_org_id',true),''))
--     with NO ::bigint cast — a uniform bigint-cast template errors here.
--   * This table is EXCLUDED from the ISSUE-053 org-FK set BY THIS DECISION
--     (org_id does not reference organizations.id — it holds a tenant UUID),
--     not by oversight.
--
-- Structural change: NONE. This migration only attaches the decision to the
-- column itself, where the next migration author will see it.
-- Idempotent: COMMENT ON overwrites the same comment.
-- ============================================================

COMMENT ON COLUMN public.export_delete_tokens.org_id IS
  'INTENTIONALLY text, not bigint (ISSUE-052, decided 2026-07-01). Holds the '
  'Azure Entra tenant UUID (req.user.tid via reqTenantUuid) — NOT the numeric '
  'organizations.id every other org-scoped table keys on. Writer: '
  'exportDeleteRoutes.ts POST /admin/export-and-delete/request; readers compare '
  'it to the caller''s tenant UUID for the cross-org check. Its RLS predicate '
  'must keep the TEXT form (no ::bigint cast — see 20260627_mt2_rls_fail_closed). '
  'Do NOT migrate this column to bigint and do NOT add an FK to '
  'organizations(id) — either change breaks the export-and-delete flow.';
