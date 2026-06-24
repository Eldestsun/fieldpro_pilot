# Role-Provisioning Fix — codify the role layer into the runner (ISSUE-039 class)

**Date:** 2026-06-23 · **Branch:** `refactor/role-provisioning-codify` (off `main`, **separate from the D3 branch**) · **Migration:** `backend/migrations/20260624_role_provisioning_codify.sql`

Follows the recon `docs/audit/2026-06-23-role-provisioning-drift-recon.md`. Closes the role-layer half of the out-of-band-provisioning drift ISSUE-039 closed for grants, and makes the ISSUE-025 RLS-bypass root (fresh init promotes `fieldpro` to superuser) **permanently fixed in version control** rather than only worked around in CI.

## Status: GREEN-PENDING — code written + proven by design; the empty→migrate **gate proof is blocked on Phase 2** (founder must set the `fieldpro_admin` login secret; no working admin credential exists on the dev cluster — `postgres` password is undocumented/failing, `fieldpro` is non-admin). Phases 0–1 done; Phase 2 prepared for the founder; Phase 3 hands off.

---

## Phase 0 — provisioner privilege level (evidence → verdict)

Grep of the active chain (consolidated + non-legacy migrations) for every superuser-forcing construct:

| Construct | Found | Forces superuser? |
|-----------|-------|-------------------|
| `CREATE EXTENSION` | only `pgcrypto` (`WITH SCHEMA public`) | **No** — `pgcrypto` is a TRUSTED extension in PG13+; a non-superuser with CREATE on the DB (the provisioner owns it via `CREATEDB`) can install it |
| `ALTER SYSTEM` / server params | none | — |
| `COPY … FROM PROGRAM` / `lo_import` / `dblink` | none | — |
| `CREATE/ALTER ROLE … SUPERUSER`/`BYPASSRLS` | none (all hits are header comments) | **No** — read roles are `NOLOGIN`, no bypass; `CREATEROLE` suffices to create them |
| migration-time seed DML into FORCE-RLS tables | none — consolidated's only `INSERT` is inside a trigger-function body (runs at app runtime, not migration time); backfills hit 0 rows on a fresh empty build | **No** — gate path never exercises BYPASSRLS |
| `ALTER DEFAULT PRIVILEGES` | none (a comment confirms its deliberate absence) | — (no owner/default-priv consistency trap) |

**VERDICT: provisioner = `fieldpro_admin LOGIN CREATEDB CREATEROLE NOSUPERUSER NOBYPASSRLS`.** Nothing in the chain forces superuser or bypassrls. No migration requires superuser → no STOP-condition triggered. (Operational caveat, surfaced not buried: the FORCE-RLS backfills rely on the running connection's RLS posture to affect rows in a *populated* DB; on a fresh empty build they correctly no-op. Backfilling a populated DB via these migrations would need org-context or a bypass connection — a data-migration concern, **not** grounds to widen the provisioner's standing privilege.)

## Phase 1 — the migration (`20260624_role_provisioning_codify.sql`)

1. **Guarded `CREATE ROLE fieldpro_admin`** at the Phase-0 privilege level (`LOGIN CREATEDB CREATEROLE NOSUPERUSER NOBYPASSRLS`), **no password literal** — the login secret is bootstrap-owned, matching how `20260611` handles `mcp_readonly`.
2. **`ALTER ROLE fieldpro NOSUPERUSER NOBYPASSRLS LOGIN`** — the permanent ISSUE-025 fix; idempotent (no-op when already correct, corrective when a fresh compose init promoted it).
3. **Read roles untouched** (already reproducible).

**Bootstrap / run-as sequence (documented in the migration header, not silently assumed):** canonical model is migrations run as `fieldpro_admin`; the `ALTER ROLE fieldpro NOSUPERUSER` downgrade can only be executed BY a superuser, so on a freshly-compose-promoted cluster the FIRST migrate runs as the bootstrap superuser (which performs the downgrade), and thereafter migrations run as `fieldpro_admin`. On the dev cluster (where `fieldpro` is already non-super) the statement is a no-op a CREATEROLE provisioner may run — so the Phase-3 gate proof under `fieldpro_admin` is clean.

**Ownership note (flagged, not silently changed):** in a clean empty→migrate run *as `fieldpro_admin`*, the provisioner owns every object it creates → no ownership mismatch. A *mixed* bootstrap (bootstrap-super `fieldpro` creates some objects, `fieldpro_admin` later others) would split ownership; the operational rule "always run migrations as `fieldpro_admin`" avoids it. If the founder prefers `fieldpro_admin` to inherit `fieldpro`'s object rights instead, that is a `GRANT fieldpro TO fieldpro_admin` membership decision (the pattern CI uses for `fieldpro_test`) — deliberately NOT taken here, to avoid silently changing ownership semantics. Founder call.

## Phase 2 — provisioner password reset (FOUNDER executes; no secret value invented here)

The working provisioner password is documented nowhere (recon §5: `.mcp.json` + `docs/dev/mcp-tools.md` show `postgres:postgres`, which fails auth). **Reset, do not recover.** Exact procedure:

1. **Dev — set `fieldpro_admin`'s password** (founder chooses the value; do not paste it into the repo or Notion):
   ```
   docker exec -it fieldpro_db psql -U fieldpro -c \
     "ALTER ROLE fieldpro_admin WITH PASSWORD '<choose-a-dev-secret>';"
   ```
   (After `20260624` has created the role; or create+password in one step if running before the migration.)
2. **Record the dev value** in `backend/.env` (e.g. a `PGADMIN_USER=fieldpro_admin` / `PGADMIN_PASSWORD=…` pair used only for `npm run migrate`), and add the same to the compose **postgres** service env if you want a fresh `docker-compose up` to reproduce it via an init step. **Production target: Azure Key Vault** — `fieldpro_admin`'s secret is provisioned there, never in version control.
3. **Retire the default superuser as provisioner of record.** The hand-added `postgres` superuser is no longer the migration runner; if retained at all it is break-glass only. Update `.mcp.json` + `docs/dev/mcp-tools.md` (which still point the postgres MCP at the broken `postgres:postgres`) to a working role once the credential is set — that is what restores the postgres MCP server.
4. **Auth method:** `pg_hba.conf` already uses **`scram-sha-256` for host connections** (✓ — the password-authenticated path). It uses **`trust` for `local`/loopback** — acceptable dev convenience, but it must not propagate to Azure (managed Postgres enforces scram + TLS, so it won't; flagged for awareness).

## Phase 3 — the gate proof (BLOCKED → handed off)

The empty→migrate proof D3 has been blocked on, and the new role-layer proof (`\du` showing `fieldpro` NOSUPERUSER, `fieldpro_admin` at the intended level, read roles NOLOGIN; `\dp` showing the 30-object `mcp_readonly` set, identity-leak 0; idempotent re-run), both require a working admin login — which is exactly what Phase 2 produces. **Cannot run until the founder completes Phase 2.** Once `fieldpro_admin` exists at a known password (host scram), the run is:
```
PGUSER=fieldpro_admin PGPASSWORD=<dev secret> PGDATABASE=<fresh scratch db> npm run migrate
```
…then `\du` / `\dp` / second-run captures. This will be filled in once unblocked.

## Bottom line
- **(a) Role drift — closed in code (pending gate proof):** `20260624` makes a fresh init reproduce `fieldpro` NOSUPERUSER + a least-privilege `fieldpro_admin` provisioner; the three read roles already reproduced. The ISSUE-025 root (fresh init → superuser app role → RLS bypass) is now fixed in version control, not just CI.
- **(b) D3 gate proof:** still blocked on the same missing admin credential — Phase 2 unblocks **both** D3's gate proof and this one.
- **(c) Founder must run:** Phase 2 — set `fieldpro_admin`'s password (dev `.env`/compose now, Key Vault for prod), then hand back a usable admin login (or run the Phase-3 one-liner) so the gate proof can be captured and both this migration and D3 verified green.

*Recon/implementation by desktop Claude Code, 2026-06-23. No DB mutations: read-only catalog inspection only; the migration is written + committed to its branch but NOT applied (no admin credential, and per discipline migrations land via the runner post-merge). No password set or guessed.*
