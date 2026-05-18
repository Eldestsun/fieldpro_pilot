# 2026-05-17 — Local DB Connection & Auth Bypass Audit

Analysis-only. No code changes. No changelog entry required.

---

## 1. `backend/src/db.ts` — Connection fallback behavior

The pool is constructed with a two-branch conditional:

```ts
// db.ts:3-11
process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host:     process.env.PGHOST     ?? "localhost",
      port:     Number(process.env.PGPORT ?? 5432),
      user:     process.env.PGUSER     ?? "fieldpro",
      password: process.env.PGPASSWORD ?? "fieldpro_pass",
      database: process.env.PGDATABASE ?? "fieldpro_db",
    });
```

**Behavior when nothing is set:** Silent fallback — the process does not throw at startup. It quietly connects to `localhost:5432` as `fieldpro / fieldpro_pass / fieldpro_db`. This is intentional for local dev where the Docker Compose postgres service is mapped to host port 5432.

---

## 2. `docker-compose.yml` — Postgres service and backend env injection

**Postgres service:** Defined. Credentials match the `db.ts` defaults exactly:
- User: `fieldpro`, password: `fieldpro_pass`, db: `fieldpro_db`, host port `5432`.

**Backend container injection:** Uses individual `PG*` vars, not `DATABASE_URL`:
```yaml
PGHOST: postgres          # Docker Compose service name — resolves inside the network
PGPORT: "5432"
PGUSER: fieldpro
PGPASSWORD: fieldpro_pass
PGDATABASE: fieldpro_db
```

Effective connection string: `postgres://fieldpro:fieldpro_pass@postgres:5432/fieldpro_db`

`DATABASE_URL` is never set in `docker-compose.yml`, so the fallback branch in `db.ts` is always taken in Docker. `PGHOST=postgres` is the only thing that differs from local-dev defaults, and it's what routes the backend container to the postgres container rather than localhost.

**`DEV_AUTH_BYPASS` in Docker:** Not injected into the backend container at all. And `NODE_ENV: production` is explicitly set, so Gate 1 in `devAuthBypass.ts` blocks the bypass even if the env var somehow leaked in. Bypass cannot activate inside Docker.

---

## 3. `backend/.env.example` — Documented defaults

- `DATABASE_URL` is documented but commented out, listed as "takes precedence over PG* vars."
- Active documented defaults: individual `PG*` vars at `localhost:5432` (matches `db.ts` hardcoded fallbacks).
- `DEV_AUTH_BYPASS` is documented but commented out (safe default).
- `DEV_BYPASS_OID`, `DEV_BYPASS_ROLES`, `DEV_BYPASS_ORG_ID` are not documented in `.env.example` at all. (See Finding 1.)

---

## 4. `backend/.env.ci` — CI connection

This file is a **template only** — all values are blank placeholders. `DATABASE_URL` is listed as:
```
DATABASE_URL=              # postgres://user:pass@host:5432/db
```

CI is expected to populate this from GitHub Actions secrets. No real connection string is committed.

---

## 5. `backend/.env` (current local dev) — Active state and one discrepancy

**DB connection:** No explicit `PGHOST`, `PGPORT`, `DATABASE_URL`, or any PG* var is set. The backend running locally falls through to the hardcoded defaults: `localhost:5432 / fieldpro / fieldpro_pass / fieldpro_db`. This works because Docker Compose maps the postgres container to host port 5432.

**Auth bypass state:**
```env
DEV_AUTH_BYPASS=true        # Gate 2 passes
DEV_BYPASS_OID=dev-user-oid
DEV_BYPASS_ROLES=UL,Lead
DEV_BYPASS_ORG_ID=1
```

`NODE_ENV` is not set in `.env`, so when the backend runs locally (outside Docker), Gate 1 passes and the bypass is active.

**The discrepancy — `DEV_BYPASS_*` vars are dead:**

`devAuthBypass.ts` reads **request headers**, not env vars:
```ts
// devAuthBypass.ts:57-59
const oid      = req.headers['x-dev-user-oid'];
const rolesRaw = req.headers['x-dev-user-roles'];
const orgIdRaw = req.headers['x-dev-user-org-id'];
```

`DEV_BYPASS_OID`, `DEV_BYPASS_ROLES`, and `DEV_BYPASS_ORG_ID` are **not read anywhere in the backend source.** They appear to be a vestigial pattern from an earlier design where the bypass identity was fixed at server startup. The current implementation is header-driven per-request — the caller must supply those headers on every request. The env vars in `.env` are harmless but misleading.

---

## 6. Bypass mechanism summary

| Gate | Check | Local dev result |
|------|-------|-----------------|
| Gate 1 | `NODE_ENV !== 'production'` | Passes — NODE_ENV not set |
| Gate 2 | `DEV_AUTH_BYPASS === 'true'` | Passes — explicitly set |
| Gate 3 | Boot banner to stderr | Fires on server start |

Per-request: all three headers (`x-dev-user-oid`, `x-dev-user-roles`, `x-dev-user-org-id`) must be present. Missing any → falls through to real MSAL/Entra auth. Every bypass activation writes an `auth.dev_bypass` row to `audit_log` (fire-and-forget).

---

## Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | `DEV_BYPASS_OID`, `DEV_BYPASS_ROLES`, `DEV_BYPASS_ORG_ID` in `.env` are dead — nothing reads them | Low — misleading to future readers but functionally inert |
| 2 | `backend/.env.example` does not document these vars, correctly omitting them — but `.env` silently diverges | Low — documentation gap only |
| 3 | No `DATABASE_URL` or explicit `PG*` vars in `.env` — works today because Docker maps port 5432 to host, but would silently fail if the compose service name or port changed | Low — fragile implicit dependency |
| 4 | CI `DATABASE_URL` is a blank template; any CI workflow that actually runs DB tests needs a real secret wired up | Blocking for R8 (CI pipeline) |
