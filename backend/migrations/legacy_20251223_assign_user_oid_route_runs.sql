-- 001_route_run_identity.sql

ALTER TABLE route_runs
ADD COLUMN assigned_user_oid TEXT,
ADD COLUMN created_by_oid TEXT;

CREATE INDEX idx_route_runs_assigned_user_oid
ON route_runs (assigned_user_oid);

CREATE INDEX idx_route_runs_created_by_oid
ON route_runs (created_by_oid);

-- rollback_001_route_run_identity.sql

--DROP INDEX IF EXISTS idx_route_runs_assigned_user_oid;
--DROP INDEX IF EXISTS idx_route_runs_created_by_oid;

--ALTER TABLE route_runs
--DROP COLUMN IF EXISTS assigned_user_oid,
--DROP COLUMN IF EXISTS created_by_oid;