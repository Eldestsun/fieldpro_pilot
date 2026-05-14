-- ============================================================
-- S1-4 — Export-and-Delete Token Table
--
-- Implements the two-step export-and-delete flow for contract
-- termination data deletion per KCM procurement requirement.
--
-- Two-step flow:
--   POST /api/admin/export-and-delete/request  — exports all org
--     data as a gzipped JSON bundle, issues a confirmation token.
--   POST /api/admin/export-and-delete/execute  — consumes the
--     token and hard-deletes all canonical rows for the org.
--
-- Token security:
--   Only the sha256 hash is stored. The raw token is returned
--   exactly once in the /request response and is never retrievable.
--
-- Audit log delete:
--   Normal operations cannot delete from audit_log (FORCE RLS,
--   no DELETE policy). The export-and-delete transaction sets two
--   LOCAL variables to unlock deletion for its own session only:
--     SET LOCAL app.export_delete_active = 'true';
--     SET LOCAL app.export_delete_org_id = '<tenant-uuid>';
--   These LOCAL settings revert automatically at COMMIT.
-- ============================================================

-- 1. Add tenant_uuid to organizations.
--    Pilots with a single org leave this null; multi-org deployments
--    set it to the Azure Tenant ID so the API can resolve bigint org_id
--    from the JWT tid claim without guessing.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tenant_uuid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_tenant_uuid_key
  ON public.organizations (tenant_uuid)
  WHERE tenant_uuid IS NOT NULL;

COMMENT ON COLUMN public.organizations.tenant_uuid IS
  'Azure AD Tenant UUID. Populated for multi-tenant deployments to map '
  'req.user.tid → organizations.id without a hardcoded lookup. '
  'Null in single-org pilot mode.';

-- 2. Export-and-delete token table.
CREATE TABLE IF NOT EXISTS export_delete_tokens (
  id            BIGSERIAL PRIMARY KEY,
  token_hash    TEXT    NOT NULL UNIQUE,   -- sha256 of the raw token; raw token never stored
  org_id        TEXT    NOT NULL,          -- Azure tenant UUID (req.user.tid), matches audit_log.org_id type
  actor_oid     TEXT    NOT NULL,          -- Azure Entra OID of the issuing Admin
  export_path   TEXT    NOT NULL,          -- filesystem path to the gzipped export bundle
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,      -- issued_at + 7 days
  consumed_at   TIMESTAMPTZ                -- NULL until token is consumed by /execute
);

CREATE INDEX IF NOT EXISTS export_delete_tokens_org_expires
  ON export_delete_tokens (org_id, expires_at);

COMMENT ON TABLE export_delete_tokens IS
  'Confirmation tokens for the two-step export-and-delete flow. '
  'token_hash is sha256 of the raw token — raw token is returned once and never stored. '
  'consumed_at marks irreversible deletion. '
  'WARNING: hard delete via /execute is permanent and cannot be undone.';

-- 3. Unlock audit_log DELETE during export-and-delete transactions.
--
--    The audit_log table uses FORCE ROW LEVEL SECURITY with only SELECT
--    and INSERT policies, making it effectively append-only for all normal
--    operations. This policy adds a narrowly scoped DELETE path that requires
--    two LOCAL session variables to be set within the same transaction:
--      app.export_delete_active = 'true'
--      app.export_delete_org_id = '<the UUID org_id being deleted>'
--    SET LOCAL resets at COMMIT, so the unlock cannot leak to other requests.
DROP POLICY IF EXISTS audit_log_delete ON audit_log;
CREATE POLICY audit_log_delete ON audit_log FOR DELETE USING (
  current_setting('app.export_delete_active', true) = 'true'
  AND org_id::text = NULLIF(current_setting('app.export_delete_org_id', true), '')
);

COMMENT ON POLICY audit_log_delete ON audit_log IS
  'Allows DELETE only when SET LOCAL app.export_delete_active = true '
  'and app.export_delete_org_id matches the row''s org_id. '
  'SET LOCAL resets at COMMIT — cannot be exploited outside a transaction. '
  'Used exclusively by POST /api/admin/export-and-delete/execute.';
