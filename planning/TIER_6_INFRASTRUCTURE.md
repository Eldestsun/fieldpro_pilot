# Tier 6 — Infrastructure

> **Goal**: Give the codebase a migration runner, integration test coverage for canonical write paths, production Dockerfiles, and a documented CI setup — so the refactor can be verified automatically and the application can be deployed outside of local dev.
>
> **Status**: 🟡 In progress — Sub-tasks A and D complete; B and C pending
> **Depends on**: Nothing (unblocked)
> **Runs alongside**: Every other tier — write tests as each tier completes, not all at the end

---

## How This Tier Works Differently

Tier 6 is not a sequential block of work. It is a parallel track that runs alongside every other tier:

- When Tier 1 is done → write integration tests for Tier 1's canonical write paths
- When Tier 3 is done → add a smoke test for Control Center endpoint reachability
- When Tier 4 is done → test the migration runner against the schema cleanup migrations
- When Tier 5 is done → write integration tests for assignment creation + assignment_id on visits

The sub-tasks below can be started in any order. None depend on each other.

---

## Sub-task A — Migration Runner 🟢 Done

### Why

The `backend/migrations/` directory has 30+ ad hoc SQL files with inconsistent naming (`V1_add_stop_photos.sql`, `20251226_core_stop_2_location_view.sql`, `20261226_...`). There is no script to apply them in order, no tracking of which have been applied, and no way to detect drift between environments.

### Files to Touch

| File | Change |
|------|--------|
| `backend/scripts/migrate.ts` (new) | Migration runner script |
| `backend/migrations/migrations_manifest.sql` (new) | Creates `schema_migrations` tracking table |

### Implementation

Create a `schema_migrations` table:
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

Runner logic (`migrate.ts`):
1. Connect to DB using env vars (`DATABASE_URL` or individual `PG*` vars)
2. Create `schema_migrations` table if not exists
3. Read all `.sql` files from `backend/migrations/` sorted by filename
4. For each file not already in `schema_migrations`: run in a transaction, insert filename into `schema_migrations` on success
5. Log each migration applied

Add to `backend/package.json` scripts:
```json
"migrate": "ts-node scripts/migrate.ts"
```

### Done criteria
- [x] `npm run migrate` in `backend/` applies all pending migrations in filename order
- [x] Re-running is idempotent (already-applied migrations are skipped)
- [x] Failed migrations roll back cleanly and report the filename that failed

**Verified 2026-05-08.** 43 existing migrations stamped as pre-runner baseline. Runner confirmed all-skip on re-run. Changelog: `docs/changelog/2026-05-08-tier-6a-migration-runner.md`

**Pending — observed_at rename (2026-05-10):** `ALTER TABLE core.observations RENAME COLUMN created_at TO observed_at` was applied ad hoc (outside the runner) as part of R2 / pre-Tier-2 cleanup. A formal migration file must be added to `backend/migrations/` so the runner can stamp it on other environments. Add as `backend/migrations/20260510_rename_observations_created_at_to_observed_at.sql` before Tier 2 ships.

---

## Sub-task B — Integration Tests for Canonical Write Paths

### Why

Zero tests means the refactor is blind. Every Tier 1 change touches a write path that currently has no regression protection. This sub-task adds the minimum tests needed to verify the canonical model is behaving correctly.

### Files to Touch

| File | Change |
|------|--------|
| `backend/tests/setup.ts` (new) | Test DB connection + teardown helpers |
| `backend/tests/canonical/visits.test.ts` (new) | Tests for Tier 1 visit lifecycle changes |
| `backend/tests/canonical/observations.test.ts` (new) | Tests for Tier 1 observation writes |
| `backend/tests/canonical/evidence.test.ts` (new) | Tests for Tier 1 evidence writes |
| `backend/tests/canonical/assignments.test.ts` (new) | Tests for Tier 5 assignment writes (write after Tier 5 ships) |
| `backend/package.json` | Update `test` script from `echo "No tests yet"` to run actual test suite |

### Test setup

Use `pg` directly (already a dependency). Tests connect to the same local DB using `PGPASSWORD=fieldpro_pass` / `DATABASE_URL`. Each test:
1. Inserts minimal fixture data (route_run, route_run_stop, etc.)
2. Calls the service function under test
3. Queries `core.*` tables to assert canonical state
4. Cleans up (DELETE fixture rows in reverse order)

No mocking of the DB. Real DB, real queries, real canonical state.

### Key tests to write (after Tier 1)

```
visits.test.ts:
  ✓ ensureVisitForRouteRunStop creates exactly one visit row
  ✓ calling it twice produces no duplicate (UUIDv5 idempotency)
  ✓ visit.started_at is set
  ✓ visit.assignment_id is null before Tier 5, non-null after

observations.test.ts:
  ✓ submitObservations writes ground_condition observation
  ✓ submitObservations writes washed_can observation when flag is set
  ✓ submitObservations does NOT write washed_can when flag is absent
  ✓ observations are inside the same transaction as the stop completion

evidence.test.ts:
  ✓ createStopPhotos writes a core.evidence row
  ✓ stop_photos row is also created (no regression)
  ✓ createStopPhotos does NOT create a visit row (lifecycle fix verified)
  ✓ evidence write is skipped (not errored) if no visit exists for the stop

assignments.test.ts (write after Tier 5):
  ✓ createRouteRun writes one core.assignments row per stop
  ✓ assignment has correct assignment_type, status, source_system, source_ref
  ✓ ensureVisitForRouteRunStop writes assignment_id onto the visit
  ✓ pre-Tier-5 routes (no assignments) produce null assignment_id — no error
```

### Done criteria
- `npm test` in `backend/` runs the test suite and all tests pass
- Tests run against the real local DB (not mocked)
- Each Tier 1 and Tier 5 canonical write path has at least one passing test
- Test cleanup leaves no fixture data in the DB

---

## Sub-task C — Production Dockerfiles

### Why

There are no `Dockerfile` for either the frontend or backend. The `docker-compose.yml` covers Postgres, MinIO, and OSRM but nothing builds or runs the application code. Deployment outside of local dev requires `npm run dev` manually.

### Files to Touch

| File | Change |
|------|--------|
| `backend/Dockerfile` (new) | Multi-stage: build TypeScript → run compiled JS |
| `frontend/Dockerfile` (new) | Multi-stage: build Vite → serve with nginx |
| `docker-compose.yml` | Add `backend` and `frontend` services |

### Backend Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

The `nginx.conf` must handle SPA routing (`try_files $uri /index.html`) and proxy `/api` to the backend.

### Done criteria
- `docker compose up --build` starts all services including frontend and backend
- Frontend is reachable at `localhost:80` (or configured port)
- Backend API is reachable at `localhost:4000`
- Auth flow works through the containerised setup

---

## Sub-task D — Remove Hardcoded Localhost 🟢 Done

### Why

`backend/src/` has hardcoded `localhost` references for the OSRM client and DB connection that will fail in a containerised environment where services are addressed by container name, not `localhost`.

### Files to Touch

| File | Change |
|------|--------|
| `backend/src/osrmClient.ts` | Replace hardcoded URL with `process.env.OSRM_URL` |
| `backend/src/db.ts` (or wherever pool is configured) | Confirm DB connection uses env vars, not hardcoded values |
| `backend/.env.example` (new) | Document all required env vars |

### Done criteria
- [x] No `localhost` hardcodes remain in backend source
- [x] All service addresses come from environment variables
- [x] `.env.example` documents `DATABASE_URL`, `OSRM_BASE_URL`, `PORT`, `AZURE_*`, `MINIO_*`

**Verified 2026-05-08.** `db.ts` converted to `PG*` / `DATABASE_URL` env vars with local-dev fallbacks. `osrmClient.ts` was already env-var-backed. `.env.example` rewritten with full var inventory. Changelog: `docs/changelog/2026-05-08-tier-6d-remove-hardcoded-localhost.md`

---

## Tier 6 Overall Done Definition

Tier 6 is complete when ALL of the following are true, **and a changelog entry has been written to `docs/changelog/`**:

- [x] Sub-task A: `npm run migrate` applies all pending migrations idempotently
- [ ] Sub-task B: `npm test` runs and all canonical write path tests pass
- [ ] Sub-task B: Tier 1 and Tier 5 canonical paths each have at least one test
- [ ] Sub-task C: `docker compose up --build` starts the full stack
- [x] Sub-task D: No hardcoded `localhost` in backend source
- [x] Sub-task D: `.env.example` documents all required env vars
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-6-infrastructure.md`

---

## What Tier 6 Does NOT Do

- Does not add frontend tests (that is a future scope)
- Does not set up a hosted CI service (GitHub Actions, etc.) — that is documented but not configured
- Does not add end-to-end (Playwright/Cypress) tests — integration tests at the DB layer are the first priority
- Does not change any canonical write path logic — infrastructure only

---

## Agent Launch Blocks

### Sub-task A — Migration runner

```
Infrastructure task. Read CLAUDE.md, then planning/TIER_6_INFRASTRUCTURE.md, Sub-task A.
Write backend/scripts/migrate.ts: a Node/ts-node script that reads all .sql files
from backend/migrations/ in filename order, tracks applied migrations in a
schema_migrations table, and skips already-applied files.
Add "migrate": "ts-node scripts/migrate.ts" to backend/package.json scripts.
Do not modify any migration files. Do not touch any other source files.
```

### Sub-task B — Integration tests (run after Tier 1 is done)

```
Testing task. Read CLAUDE.md, then planning/TIER_6_INFRASTRUCTURE.md Sub-task B,
then planning/TIER_1_CANONICAL_COMPLETENESS.md done-criteria.
Write integration tests in backend/tests/canonical/ that verify each Tier 1
done-criteria item against the real local database.
Use the pg package directly. No mocking. Each test must clean up its fixture data.
Update the "test" script in backend/package.json to run the test suite.
Do not change any source files — test files only.
```

### Sub-task C — Dockerfiles

```
Ops task. Read CLAUDE.md, then planning/TIER_6_INFRASTRUCTURE.md, Sub-task C.
Write backend/Dockerfile and frontend/Dockerfile using the specs in the tier file.
Add backend and frontend services to docker-compose.yml.
Write a minimal nginx.conf for the frontend container that handles SPA routing
and proxies /api to the backend service.
Do not change any application source files.
```

### Sub-task D — Remove hardcoded localhost

```
Refactor task. Read CLAUDE.md, then planning/TIER_6_INFRASTRUCTURE.md, Sub-task D.
Find all hardcoded localhost references in backend/src/ (grep for 'localhost').
Replace OSRM_URL and any other service addresses with environment variable lookups.
Write backend/.env.example documenting all required env vars.
Do not change any business logic.
```
