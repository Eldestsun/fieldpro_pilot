-- ============================================================================
-- ISSUE-013 — make org 1 + its tenant_uuid reproducible from version control.
--
-- resolveNumericOrgId now FAILS CLOSED (no lowest-id fallback): an authenticated
-- caller resolves ONLY via organizations.tenant_uuid = req.user.tid, and throws
-- (403) on no match. For that to be safe in the single-org pilot, org 1 must
-- exist WITH its tenant_uuid on every build — otherwise the fail-closed resolver
-- denies EVERY login.
--
-- Why this is needed (the real Blocker-4, per docs/audit/2026-06-27-multi-tenant-
-- readiness-recon.md): nothing creates the org-1 row. The consolidated schema
-- only CREATEs the organizations table, and 20260518_rls_phase3 step 4's
-- `UPDATE organizations SET tenant_uuid ... WHERE id = 1` no-ops on a clean-room
-- build because the row does not exist yet at that point. Org 1 has only ever
-- lived in DEV DATA. This migration persists it (id, name, slug, tenant_uuid).
--
-- TENANT GUID NOTE: 66d756aa-edfd-46e9-895a-06d9e0e21f3a is the DEV/CURRENT Entra
-- tenant (the founder's own tenant), occupying the org-1 slot. The org is LABELED
-- "King County Metro" / "kcm" ASPIRATIONALLY (target first customer) — BASELINE
-- has never deployed to KCM, so this is NOT a real KCM tenant id. SWAP this value
-- at pilot standup (the KCM cutover). The value is persisted verbatim from the
-- live dev organizations row; it is not invented.
--
-- Per the ISSUE-013 recon, this migration deliberately does NOT add UNIQUE, an
-- index, or NOT NULL to tenant_uuid: it is already partial-unique + indexed, and
-- must stay nullable so a not-yet-mapped org can exist and fail closed.
--
-- Idempotent: ON CONFLICT upsert with a guard so a re-run touches 0 rows when the
-- mapping is already correct; it never clobbers a live name/slug (only tenant_uuid
-- is refreshed on conflict). The runner wraps this file in its own transaction.
-- ============================================================================

INSERT INTO public.organizations (id, name, slug, tenant_uuid)
VALUES (1, 'King County Metro', 'kcm', '66d756aa-edfd-46e9-895a-06d9e0e21f3a')
ON CONFLICT (id) DO UPDATE
  SET tenant_uuid = EXCLUDED.tenant_uuid
  WHERE public.organizations.tenant_uuid IS DISTINCT FROM EXCLUDED.tenant_uuid;

-- Keep the IDENTITY sequence ahead of the explicitly-seeded id=1 so a future
-- auto-id org insert does not collide on the primary key.
SELECT setval(
  pg_get_serial_sequence('public.organizations', 'id'),
  GREATEST((SELECT max(id) FROM public.organizations), 1)
);
