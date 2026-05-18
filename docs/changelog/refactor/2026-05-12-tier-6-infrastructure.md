# 2026-05-12 — Tier 6 Infrastructure complete

## What changed

- **Sub-task A — Migration runner**: `backend/scripts/migrate.ts` applies `.sql` files from `backend/migrations/` in filename order and tracks applied migrations in a `schema_migrations` table created by `backend/migrations/migrations_manifest.sql`. 43 existing migrations stamped as baseline on first run; re-runs are idempotent.
- **Sub-task B — Integration tests for canonical write paths**: `backend/tests/setup.ts`, `tests/run.ts`, and four files in `tests/canonical/` (`visits.test.ts`, `observations.test.ts`, `evidence.test.ts`, `assignments.test.ts`) provide 20 integration tests covering every Tier 1 and Tier 5 canonical write path done-criteria. Tests run against the real local DB using `pg` directly — no mocking. Each test scopes itself to its own `route_runs` / `route_run_stops` fixture and deletes everything on completion; cleanup verified to leave no residue.
- **Sub-task C — Production Dockerfiles**: `backend/Dockerfile` (multi-stage Node 20 build → runtime), `frontend/Dockerfile` (multi-stage Vite build → nginx serve), and `frontend/nginx.conf` (SPA routing + `/api` proxy) added. `docker-compose.yml` extended with `backend` and `frontend` services so `docker compose up --build` starts the full stack. End-to-end smoke verified against the built images: backend `/api/health` → 200, frontend `/` and SPA deep-path → 200, `/api/health` via the nginx proxy → 200.

  Three issues were found and fixed during the `docker compose up --build` validation pass — none of which were visible from spec review or `docker compose config`, only from actually building and starting the containers:

  1. **`nginx.conf` location** — the spec placed it at the repo root, but the frontend build context is `./frontend`, so the `COPY nginx.conf ...` line in `frontend/Dockerfile` could not resolve it. Moved to `frontend/nginx.conf`.
  2. **pnpm version drift** — corepack's current default is pnpm 11, which crashes on Node 20 with `ERR_UNKNOWN_BUILTIN_MODULE` during `pnpm install`. Pinned `pnpm@10.14.0` via `corepack prepare pnpm@10.14.0 --activate` in both Dockerfiles to match the repo's `packageManager` field.
  3. **Missing `AZURE_*` env vars in compose** — the backend refuses to boot without `AZURE_TENANT_ID` / `AZURE_API_AUDIENCE`, so the container crash-looped on first start. `docker-compose.yml` now passes these through from the host env using `${AZURE_TENANT_ID:?...}` syntax so compose fails fast with a clear message if they're unset.

  These three were only discoverable by running the tier's stated done-criteria (`docker compose up --build`) — confirming the tier file was right to make image build + boot the verification gate rather than treating spec review or config validation as sufficient.
- **Sub-task D — Remove hardcoded localhost**: `backend/src/osrmClient.ts` and `backend/src/db.ts` converted to environment-variable lookups (`OSRM_BASE_URL`, `PG*` / `DATABASE_URL`). `backend/.env.example` rewritten with the full var inventory.
- **`backend/package.json`**: `migrate` and `test` scripts added (`ts-node scripts/migrate.ts`, `ts-node --transpile-only tests/run.ts`).

## Why

- Canonical write paths now have regression protection — 20 passing integration tests covering Tier 1 visit lifecycle, observations (including `washed_can`), evidence, and Tier 5 assignment writes.
- Migration runner eliminates environment-drift risk and gives every environment a single source of truth for schema state.
- Docker setup enables deployment outside local dev and unblocks the R8 CI pipeline.
- No hardcoded service addresses remain in backend source, so the same image runs identically across local, CI, and deployed environments.

## Files touched

- `backend/scripts/migrate.ts`
- `backend/migrations/migrations_manifest.sql`
- `backend/tests/setup.ts`
- `backend/tests/run.ts`
- `backend/tests/canonical/visits.test.ts`
- `backend/tests/canonical/observations.test.ts`
- `backend/tests/canonical/evidence.test.ts`
- `backend/tests/canonical/assignments.test.ts`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`
- `frontend/nginx.conf`
- `backend/src/osrmClient.ts`
- `backend/src/db.ts`
- `backend/.env.example`
- `backend/package.json`
- `planning/TIER_6_INFRASTRUCTURE.md` (status update)
