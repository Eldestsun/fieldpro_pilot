#!/bin/sh
# ============================================================================
# ISSUE-041 (deploy-wiring half) — one-time superuser bootstrap of the role split.
#
# Runs ONCE at first `initdb` (fresh volume), as the bootstrap superuser
# POSTGRES_USER (= fieldpro on a fresh `docker-compose up`). After this script:
#   - fieldpro_admin exists = the PROVISIONER  (NOSUPERUSER BYPASSRLS CREATEDB
#     CREATEROLE, member of fieldpro) → the migration runner connects as this.
#   - fieldpro            = the RUNTIME app role (NOSUPERUSER NOBYPASSRLS) → the
#     app's pool (backend/src/db.ts) connects as this, so FORCE ROW LEVEL
#     SECURITY actually enforces on every app query.
#
# This is the superuser-only prerequisite the 20260624 migration header documents
# ("a one-time superuser BOOTSTRAP before the chain runs"): creating fieldpro_admin
# with BYPASSRLS + membership, and the permanent ISSUE-025 downgrade of fieldpro,
# both require a superuser and therefore cannot live in a migration run by the
# non-super provisioner. Doing it here means the chain — run AS fieldpro_admin —
# sees 20260624's guarded `ALTER ROLE fieldpro NOSUPERUSER` as a no-op.
#
# SCOPE: this is the deploy-wiring (role) half of ISSUE-041 only. It uses the
# EXISTING dev secret (FIELDPRO_ADMIN_PASSWORD from env) — it does NOT rotate
# credentials, edit pg_hba, or touch Key Vault (the Azure-gated other half).
# Idempotent: guarded CREATE; ALTER/GRANT re-assert the same state.
# ============================================================================
set -e

: "${FIELDPRO_ADMIN_PASSWORD:?FIELDPRO_ADMIN_PASSWORD must be set for the provisioner bootstrap}"

psql -v ON_ERROR_STOP=1 \
     -v admin_pw="$FIELDPRO_ADMIN_PASSWORD" \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" <<-'SQL'
  -- 1. Provisioner role of record. Guarded create; login secret set via the
  --    psql :admin_pw variable (properly quoted by psql, never shell-interpolated).
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldpro_admin') THEN
      CREATE ROLE fieldpro_admin LOGIN NOSUPERUSER BYPASSRLS CREATEDB CREATEROLE;
    END IF;
  END
  $$;
  ALTER ROLE fieldpro_admin WITH PASSWORD :'admin_pw';

  -- 2. Membership so the chain's `SET ROLE fieldpro` / `OWNER TO fieldpro`
  --    (20260613_p1_2) works when run as fieldpro_admin.
  GRANT fieldpro TO fieldpro_admin;

  -- 2b. Pre-install pgcrypto as the bootstrap superuser. The consolidated schema
  --     does `CREATE EXTENSION IF NOT EXISTS pgcrypto`; installing a C-backed
  --     extension needs superuser, which the non-super provisioner lacks. Doing it
  --     here makes that statement a no-op when the chain runs AS fieldpro_admin.
  --     (Extension stays superuser/extension-owned; never reassigned — matches the
  --     20260624 EXCLUSIONS note.)
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

  -- 3. PERMANENT ISSUE-025 FIX (superuser-only): the runtime app role must never
  --    be SUPER/BYPASSRLS, or FORCE RLS silently stops enforcing. Done last so the
  --    remaining (none) statements don't need the privilege we just dropped.
  ALTER ROLE fieldpro WITH NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
SQL

echo "[issue-041 bootstrap] provisioner fieldpro_admin ready; fieldpro downgraded to NOSUPERUSER NOBYPASSRLS"
