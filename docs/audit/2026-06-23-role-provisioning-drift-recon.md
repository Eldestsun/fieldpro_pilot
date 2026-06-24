# Role-Provisioning Drift Recon (ISSUE-039 class, role layer)

**Date:** 2026-06-23 · **Type:** RECON-ONLY (no mutations: no `CREATE`/`ALTER ROLE`, no migration written) · **Class:** out-of-band provisioning drift, one layer below ISSUE-039 (which closed it for GRANTs)

ISSUE-039 proved **grants** reproduce from version control. This recon establishes whether **roles** do. Short answer: the three *read roles* are reproducible (migration-authored); the two *privilege roles* (`fieldpro`, `postgres`) are **not** — and the live cluster's privilege posture is the inverse of what `docker-compose` would produce on a fresh init.

---

## 1. Full role inventory (live dev `fieldpro_db`)

```
            List of roles
      Role name      |                         Attributes
---------------------+------------------------------------------------------------
 audit_reader        | Cannot login
 fieldpro            | (none — LOGIN only)
 intelligence_reader | Cannot login
 mcp_readonly        | (none — LOGIN only)
 postgres            | Superuser, Create role, Create DB, Replication, Bypass RLS
```
```
audit_reader        | super=false createdb=false createrole=false login=false inherit=true bypassrls=false
fieldpro            | super=false createdb=false createrole=false login=true  inherit=true bypassrls=false
intelligence_reader | super=false createdb=false createrole=false login=false inherit=true bypassrls=false
mcp_readonly        | super=false createdb=false createrole=false login=true  inherit=true bypassrls=false
postgres            | super=true  createdb=true  createrole=true  login=true  inherit=true bypassrls=true
```
**Memberships among these roles: none** (only built-in `pg_monitor` system grants exist). The CI `GRANT fieldpro TO fieldpro_test` membership is CI-only and not present in dev.

---

## 2. What compose / image would produce on a fresh init — and the delta

`docker-compose.yml` (the only role-relevant config; **no `docker-entrypoint-initdb.d` mount, no init SQL/shell anywhere in the repo**):
```yaml
postgres:
  image: postgres:14
  environment:
    POSTGRES_USER: fieldpro
    POSTGRES_PASSWORD: fieldpro_pass
    POSTGRES_DB: fieldpro_db
  volumes: [ ./data/db:/var/lib/postgresql/data ]
```

**A fresh init from this compose produces:** `fieldpro` as a **SUPERUSER** (the `postgres:14` image makes `POSTGRES_USER` the bootstrap superuser), a `fieldpro_db` database, **no `postgres` role**, and **none of the read roles** (those are created later, by migrations).

**Delta — live vs fresh-init (the drift):**

| | Fresh compose init | Live dev (now) |
|---|---|---|
| `fieldpro` | **SUPERUSER** | **non-super, login-only** (hand-downgraded) |
| `postgres` | **does not exist** | **superuser** (hand-added; password undocumented-working) |
| read roles | absent until migrations run | present (migration-authored — see §3) |

The live privilege layer is the **inverse** of fresh-init for the two privilege roles. Both inversions are out-of-band: someone `ALTER ROLE fieldpro NOSUPERUSER`-equivalent and hand-created a `postgres` superuser. Neither is in compose, an init script, or a migration.

**This inversion is not random — it is correct, and CI documents why (see §4).** It just isn't codified.

---

## 3. Where roles are provisioned today (per-role authoring verdict)

`grep` of `backend/migrations/` for `CREATE ROLE`:
```
20260530_sidecar_extraction_a_additive.sql:215:    CREATE ROLE intelligence_reader NOLOGIN;
20260530_sidecar_extraction_a_additive.sql:218:    CREATE ROLE audit_reader NOLOGIN;
20260611_mcp_readonly_canonical_grant_provision.sql:74:    CREATE ROLE mcp_readonly NOLOGIN;
```
(All three are `pg_roles`-guarded — idempotent.) Grants `TO <role>` in migrations: `mcp_readonly` ×49, `intelligence_reader` ×6, `audit_reader` ×2, `fieldpro` ×9. No `CREATE ROLE fieldpro` / `CREATE ROLE postgres` anywhere in the repo (the only other `CREATE ROLE` is CI's `fieldpro_test`, CI-only).

| Role | Authored in runner? | Source |
|------|---------------------|--------|
| `intelligence_reader` | **YES** | `20260530_sidecar_extraction_a` (guarded `CREATE ROLE … NOLOGIN`) |
| `audit_reader` | **YES** | `20260530_sidecar_extraction_a` (guarded `CREATE ROLE … NOLOGIN`) |
| `mcp_readonly` | **YES** | `20260611` (guarded `CREATE ROLE … NOLOGIN`) |
| `fieldpro` | **NO** | compose bootstrap (`POSTGRES_USER`) only |
| `postgres` | **NO** | hand-added on live; no source anywhere |

**One sub-drift on a reproducible role:** `20260611` creates `mcp_readonly` **NOLOGIN**, but live `mcp_readonly` is **LOGIN**. The LOGIN attribute + password are bootstrap-applied out-of-band — *by the documented 20260611 design* ("login/password is bootstrap-owned, out of VC"). So the *role + grants* reproduce; the *login credential* is intentionally a bootstrap secret. Same pattern will apply to any login role.

---

## 4. What `fieldpro` actually needs (needed vs accidental privilege)

App connection (`backend/src/db.ts`): the pool connects as `PGUSER ?? "fieldpro"` / `PGPASSWORD ?? "fieldpro_pass"`; the compose backend service sets `PGUSER: fieldpro`. RLS context is applied per-request via `withOrgContext()` → `set_config('app.current_org_id', …)`.

**`fieldpro` is the app *runtime* role.** Its needed privileges are: `LOGIN`, ownership of (or grants on) the app schema objects, normal DML — and explicitly **NOT** `SUPERUSER` and **NOT** `BYPASSRLS`. CI spells this out (ISSUE-025, `.github/workflows/ci.yml`):

> *"the `postgres:14` service image makes `POSTGRES_USER=fieldpro` a SUPERUSER, and superusers bypass RLS even on FORCE ROW LEVEL SECURITY tables. The app's runtime role is a NON-superuser… Migrations + seed stay on the superuser fieldpro by design (they need to create schema and seed across orgs)."*

CI therefore runs **migrations as superuser-fieldpro** but **tests as a non-superuser `fieldpro_test`** (`NOSUPERUSER NOBYPASSRLS INHERIT`, `GRANT fieldpro TO fieldpro_test`) so FORCE-RLS actually enforces. **This is the intended two-role model:** a superuser *provisioner* for migrations + a non-superuser *runtime* role for the app.

**Live dev hand-implements exactly that split** — `fieldpro` (non-super) = runtime, `postgres` (super) = provisioner. So live `fieldpro` being non-super is the **labor-safety-correct least-privilege state** (RLS enforces); fresh-init's `fieldpro`-as-superuser is the **latent ISSUE-025 bug** (RLS silently bypassed). The accident is fresh-init; the hand-fix is correct but unreproducible.

---

## 5. The `postgres` superuser password question

**Documented value:** `postgres` — appears in `.mcp.json` (`postgresql://postgres:postgres@localhost:5432/fieldpro_db`) and `docs/dev/mcp-tools.md:15`. A deleted root `.env.example` once carried a similar DSN (per `docs/changelog/ops/2026-05-12-env-config-cleanup.md`).

**Working value:** unknown. The documented `postgres:postgres` is **currently failing auth** (observed this morning via the postgres MCP server) — so the live `postgres` password was changed out-of-band and the documented value is stale. **No source documents a working `postgres` password**, and it is not in `docker inspect` (it wasn't set via image env — the bootstrap user is `fieldpro`). Not brute-forced or guessed, per dispatch.

**Consequence:** the eventual fix dispatch will need either a deliberate `postgres` password reset (founder-set, then documented as a bootstrap secret) or a decision to drop the separate `postgres` role in favor of a codified provisioner role.

---

## Per-role drift table

| Role | Live attributes | Authored in runner? | Fresh-init would produce | Verdict |
|------|-----------------|---------------------|--------------------------|---------|
| `intelligence_reader` | NOLOGIN, non-super | **YES** (20260530a) | NOLOGIN read role (post-migration) | **REPRODUCIBLE** |
| `audit_reader` | NOLOGIN, non-super | **YES** (20260530a) | NOLOGIN read role (post-migration) | **REPRODUCIBLE** |
| `mcp_readonly` | LOGIN, non-super | **YES** (20260611) | NOLOGIN read role; LOGIN added by bootstrap | **REPRODUCIBLE** (login attr = intended bootstrap secret) |
| `fieldpro` | LOGIN, **non-super**, no createdb/role | **NO** (compose bootstrap) | LOGIN **SUPERUSER** | **DRIFTED** — live is the correct least-priv state; fresh-init would wrongly make it superuser (ISSUE-025) |
| `postgres` | **SUPERUSER** (all attrs) | **NO** | **does not exist** | **LIVE-ONLY** — hand-added provisioner; password undocumented-working |

---

## Canonical role posture — RECOMMENDATION (proposal for founder sign-off; NOT applied)

The target is that a fresh init reproduces the **intended two-role privilege model** (per CI/ISSUE-025) plus the already-reproducible read roles, with no out-of-band steps:

1. **App runtime role (`fieldpro`): non-superuser, non-bypassrls, LOGIN, owns app objects.** This is what live already is and what RLS enforcement *requires*. The fix must guarantee fresh init does NOT leave it superuser — i.e. an explicit `ALTER ROLE fieldpro NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` codified into the bootstrap/runner, since the image default makes it superuser.
2. **Provisioner role (the migration admin): superuser (or at least CREATEROLE + CREATEDB + the rights for `CREATE EXTENSION` and FORCE-RLS DML), used ONLY to run migrations/seed — never the app's runtime connection.** Decide its identity: keep a `postgres` superuser (codified + password as a documented bootstrap secret), or rename to an explicit `fieldpro_admin`/`fieldpro_provisioner`. Either way it must be codified, not hand-made.
3. **Read roles (`intelligence_reader`, `audit_reader`, `mcp_readonly`): keep as-is — already migration-authored, guarded, NOLOGIN.** Their LOGIN+password (where needed, e.g. `mcp_readonly` for the diagnostic connection) stays a bootstrap-applied secret, by the 20260611 design — but that bootstrap step should be *documented* (it currently is folklore).
4. **No role should carry BYPASSRLS except the provisioner** — bypassrls on the app or a read role would silently defeat the labor-safety RLS wall.

The seam mirrors ISSUE-039: privilege *posture* (attributes) is codified/idempotent in the runner or a documented bootstrap; secrets (passwords) stay out of version control but are *documented as required bootstrap steps* rather than discovered by accident.

---

## Bottom line — what to codify vs reconcile

**Codify into the runner / a documented bootstrap (so fresh init reproduces it):**
- An explicit downgrade of the bootstrap `fieldpro` to **non-superuser / non-bypassrls** (counter the image default — this is the ISSUE-025 fix made permanent and reproducible).
- The **provisioner role** definition (superuser identity for running migrations), with its password handled as a documented bootstrap secret.
- The **bootstrap login step** for `mcp_readonly` (and any read role that must log in) — document it; the role + grants already reproduce.

**Reconcile on live:**
- `fieldpro` is already correct (non-super) — but make that state *intended*, not incidental.
- The `postgres` superuser: decide keep-and-codify vs replace-with-provisioner; **its password needs a deliberate reset** (no working value is documented) before it can be relied on by tooling (the postgres MCP server is currently broken on the stale `postgres:postgres`).
- `mcp_readonly` LOGIN attribute: confirm it's the intended bootstrap step, document it.

**Net:** the role layer is *half* reproducible — all three read roles reproduce from migrations; the two privilege roles do not, and fresh-init would actively reintroduce the ISSUE-025 RLS-bypass bug by making `fieldpro` a superuser. Bringing the role layer to ISSUE-039 parity means codifying the privilege-role posture (non-super app role + explicit provisioner) and documenting the login-secret bootstrap, after a founder decision on the provisioner identity + a `postgres` password reset.

*Recon by desktop Claude Code, 2026-06-23. Read-only: live `pg_roles`/`pg_auth_members` inspected via the non-privileged `fieldpro` connection (catalog is world-readable); no role or schema mutated; no migration written; no password tested or guessed.*
