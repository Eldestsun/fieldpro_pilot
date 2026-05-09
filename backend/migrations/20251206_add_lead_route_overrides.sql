CREATE TABLE lead_route_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id text NOT NULL,
  stop_id text NOT NULL,
  override_type text NOT NULL CHECK (override_type IN ('FORCE_INCLUDE','FORCE_EXCLUDE','PRIORITY_BUMP')),
  value numeric NULL,
  created_by text NOT NULL, -- Azure OID string
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_overrides_pool_stop
  ON lead_route_overrides (pool_id, stop_id);

CREATE INDEX idx_overrides_pool_type
  ON lead_route_overrides (pool_id, override_type);