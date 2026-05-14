-- ============================================================
-- S1-7 — EAM Bridge Route Log
-- One row per completed route run, structured for EAMS (Hexagon)
-- consumption via SFTP or API pull.
--
-- EAMS-FACING CONTRACT SURFACE:
--   Schema changes to this table require coordination with
--   KCM IT / EAMS team before deployment.
--
-- LABOR SAFETY: This table contains NO worker identity.
--   No actor_oid, no captured_by_oid, no user_id.
--   Route-level aggregates only.
--
-- Access model:
--   Read-only from the EAMS side.
--   Write-only from BASELINE populate script (populateEamBridge.ts).
-- ============================================================

CREATE TABLE eam_bridge_route_log (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT      NOT NULL REFERENCES organizations(id),
  route_run_id      BIGINT      NOT NULL REFERENCES route_runs(id),
  completed_at      TIMESTAMPTZ NOT NULL,          -- route_runs.finished_at
  stop_count        INT         NOT NULL DEFAULT 0,
  exception_count   INT         NOT NULL DEFAULT 0, -- stops with hazard or infra_issue
  canonical_summary JSONB       NOT NULL DEFAULT '{}', -- minimal EAMS work-order data
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT eam_bridge_route_log_run_unique UNIQUE (route_run_id)
);

COMMENT ON TABLE eam_bridge_route_log IS
  'EAMS-facing contract surface. One row per completed route run. '
  'Contains NO worker identity — no actor_oid, no captured_by_oid, no user_id. '
  'Read-only from EAMS; written by BASELINE populate script (populateEamBridge.ts). '
  'Schema changes require coordination with KCM IT / EAMS team.';

CREATE INDEX eam_bridge_org_logged   ON eam_bridge_route_log (org_id, logged_at DESC);
CREATE INDEX eam_bridge_completed_at ON eam_bridge_route_log (completed_at DESC);

-- ──────────────────────────────────────────────────────────────
-- Populate watermark — singleton row tracking the high-water mark
-- of the last successful populate run. The script reads this value,
-- queries route_runs WHERE finished_at > watermark, then advances
-- the watermark to the max finished_at of the rows it processed.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE eam_bridge_populate_state (
  id        INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  watermark TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

INSERT INTO eam_bridge_populate_state DEFAULT VALUES;
