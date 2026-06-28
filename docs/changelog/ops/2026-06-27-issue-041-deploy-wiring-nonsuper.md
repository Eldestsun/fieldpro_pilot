# ISSUE-041 (deploy-wiring half) — app runtime connects as non-super `fieldpro`; migrations as `fieldpro_admin`

**Date:** 2026-06-27 · **Type:** Ops / deploy-wiring · **Branch:** `ops/issue-041-deploy-wiring-nonsuper`
**Scope:** the **KIND-1 deploy-wiring half of ISSUE-041 only.** The credential-rotation / Azure Key Vault / `pg_hba` half is **out of scope** (Azure-gated) and remains open on the ISSUE-041 card.

## Why

On a fresh `docker-compose up`, the Postgres entrypoint creates `POSTGRES_USER=fieldpro` as the **DB-owning superuser**. The app pool (`backend/src/db.ts`) connects as `fieldpro`, so on a clean bring-up the app connects as a **superuser → FORCE ROW LEVEL SECURITY is bypassed entirely.** Tenant isolation and the worker-identity wall are unenforced at runtime — the foundation ISSUE-013 (fail-closed `resolveNumericOrgId`) and MT-2 (fail-closed RLS) both rest on. The `20260624` migration defines the correct role split but nothing wired it into the boot sequence.

Verified empirically (throwaway container, fresh init): `fieldpro` comes up `rolsuper=t rolbypassrls=t`. And the **existing** wiring cannot self-heal — running the migrate chain as `fieldpro` **fails at `20260624`** (`must be member of role "fieldpro_admin"`): its guarded `ALTER ROLE fieldpro NOSUPERUSER` self-downgrades the running role mid-migration, then `ALTER DEFAULT PRIVILEGES FOR ROLE fieldpro_admin` fails. The transaction rolls back → `fieldpro` stays superuser → and because the container CMD is `migrate && index`, the app never starts.

## What changed (deploy-wiring only — Option A from `docs/audit/2026-06-23-role-provisioning-fix.md`)

The runtime app connection and the migration-runner connection are now **different roles**:

1. **`db/init/00_bootstrap_provisioner.sh`** (new) — mounted to `/docker-entrypoint-initdb.d`, runs **once at fresh `initdb`** as the bootstrap superuser. It performs the superuser-only prerequisites the `20260624` header documents: creates `fieldpro_admin` (LOGIN, NOSUPERUSER **BYPASSRLS** CREATEDB CREATEROLE, login secret from `FIELDPRO_ADMIN_PASSWORD`), `GRANT fieldpro TO fieldpro_admin`, pre-installs `pgcrypto` (a C-backed extension the non-super provisioner can't install), and applies the permanent ISSUE-025 downgrade `ALTER ROLE fieldpro NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`. Idempotent; uses the **existing dev secret** (no rotation).
2. **`backend/src/scripts/migrate.ts`** — `buildClientConfig()` now prefers `PGADMIN_USER`/`PGADMIN_PASSWORD` (and `PGADMIN_DATABASE_URL`), **falling back to `PG*`/`DATABASE_URL`** when unset, so CI (already runs migrations as a privileged role) is unchanged. The runner connects as `fieldpro_admin`.
3. **`docker-compose.yml`** — postgres service gains `FIELDPRO_ADMIN_PASSWORD` + the `db/init` mount; backend service gains `PGADMIN_USER=fieldpro_admin` / `PGADMIN_PASSWORD=${FIELDPRO_ADMIN_PASSWORD}` for the migrate step. **`PGUSER=fieldpro` is unchanged** — the app runtime still connects as the non-super role.

**`backend/src/db.ts` is NOT touched** — no new pool, no hardcoded role, no `SET ROLE`. The same pool authenticates as the same `PGUSER`; only the role's *privilege posture* (now non-super, reproducibly) and the *migrate* identity changed.

Result on a fresh bring-up: init bootstrap → `fieldpro` non-super, `fieldpro_admin` provisioner → migrate runs as `fieldpro_admin` (owns objects; `20260624` grants the app role back in) → app pool connects as non-super `fieldpro` → **RLS enforces.**

## Proof (throwaway fresh container, port 5439, never the live cluster)

1. **App role posture** — `SELECT current_user, rolsuper, rolbypassrls …` as the app connection → `fieldpro | f | f`. Non-super, non-bypassrls.
2. **RLS bites** under that connection (the gate ISSUE-013 waits on): `app.current_org_id='1'` → only the org-1 `bases` row; `='2'` → only org-2; the BYPASSRLS provisioner sees both regardless → the difference is the role. (Unset context → all rows = fail-OPEN, expected; that is MT-2's job, **not** changed here.)
3. **App connection layer** — the real `db.ts` pool + `withOrgContext(1)`/`(2)` as `fieldpro` returns only org-1 / org-2 rows respectively. The app data path works as the non-super role.
4. **Migrations** — `migrate` as `fieldpro_admin` on the fresh DB → **exit 0**, "Migration run complete"; idempotent re-run → **0 applies, exit 0**.
5. **`pg_state.sql`** — **not regenerated**: this is deploy-wiring only; no schema-changing migration was added and no live DB object/policy/recorded-role state changed. The dump is unaffected.

## Notes / boundaries

- **Live dev cluster unaffected:** its volume already exists (init runs only on a fresh volume) and it already carries the correct posture from the prior Option A run. The wiring makes a **fresh** bring-up (CI / new dev / Render / Azure) reproduce it from version control.
- **Still open on ISSUE-041 (Azure-gated):** strong/rotated secrets in Key Vault, `pg_hba` scram-only + TLS, removing dev plaintext from any non-dev path. None done here.
- Does **not** touch `resolveOrgId.ts` (ISSUE-013) or any RLS policy (MT-2). Fail-open-on-unset is intentionally unchanged — now it is *enforced on a non-super connection*, which is what makes 013 and MT-2 provable.
