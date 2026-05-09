-- 002_identity_directory.sql

CREATE TABLE identity_directory (
  oid TEXT PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  last_seen_role TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- rollback_002_identity_directory.sql

--DROP TABLE IF EXISTS identity_directory;