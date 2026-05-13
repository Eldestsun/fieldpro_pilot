-- ============================================================
-- S1-1 — Admin Action Audit Log
-- Append-only compliance audit table. Records administrative and
-- security-relevant actions keyed to Azure Entra OID only — never
-- a worker name, never a role-inferrable value.
--
-- Append-only enforcement: UPDATE and DELETE are blocked via Row Level
-- Security with FORCE ROW LEVEL SECURITY. Permissive policies exist
-- only for SELECT and INSERT; the absence of any UPDATE or DELETE
-- policy causes those commands to be denied by default — including
-- for the table owner — when FORCE ROW LEVEL SECURITY is active.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_oid     TEXT NOT NULL,          -- Azure Entra OID only — NOT a name, NOT a role-inferrable value
  org_id        UUID NOT NULL,
  action        TEXT NOT NULL,          -- see action registry in SECURITY_SPRINT_1_CODE_GAPS.md
  resource_type TEXT,                   -- e.g. 'route', 'stop', 'user', 'export', 'config'
  resource_id   TEXT,                   -- the ID of the affected resource, if applicable
  detail        JSONB,                  -- action-specific detail payload (no PII)
  ip_address    TEXT,                   -- request IP for security audit trail
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_org_occurred ON audit_log (org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor        ON audit_log (actor_oid, occurred_at DESC);

-- Append-only enforcement via RLS.
-- FORCE ROW LEVEL SECURITY applies policies even to the table owner.
-- Permissive SELECT and INSERT policies allow normal reads and writes.
-- The absence of UPDATE or DELETE policies means those commands are denied
-- by default under permissive RLS — for all roles, including the owner.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (true);
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true);

COMMENT ON TABLE audit_log IS
  'Append-only compliance audit trail. Stores Azure Entra OIDs (actor_oid) only — '
  'never worker names, display names, or role-inferrable identifiers. '
  'Admin-tier access only (enforced at the route layer in S1-3). '
  'UPDATE and DELETE are blocked by RLS policy (FORCE ROW LEVEL SECURITY).';
