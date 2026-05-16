# 2026-05-15 — Render free-tier staging deployment

## What changed
- Added `render.yaml` at repo root: three-service blueprint (`baseline-db` Postgres,
  `baseline-backend` Docker web service, `baseline-frontend` Docker web service).
- Backend `Dockerfile` CMD updated to run migrations before starting the server:
  `node dist/scripts/migrate.js && node dist/index.js`.
- Migration script moved from `backend/scripts/migrate.ts` to
  `backend/src/scripts/migrate.ts` so it compiles into `dist/scripts/migrate.js`
  via `tsc` (previously it was outside `rootDir` and not compiled).
  MIGRATIONS_DIR path updated from `../migrations` to `../../migrations` to
  remain correct from both ts-node and compiled-dist call sites.
- `backend/package.json` `migrate` script updated to new source path.
- Frontend `nginx.conf` replaced by `nginx.conf.template` using envsubst variable
  `${BACKEND_URL}` for the backend proxy target. The nginx Docker image
  auto-processes templates at container start.
- Frontend `Dockerfile` updated to copy `nginx.conf.template` into
  `/etc/nginx/templates/` (auto-envsubst path) instead of writing a static conf.
- `docker-compose.yml` frontend service gains `BACKEND_URL: http://backend:4000`
  to supply the template variable for local development.
- Added `docs/ops/render-deploy.md` covering environment group setup, service
  connection, deploy order, health verification, log inspection, and free-tier limits.

## Why
- Staging environment needed before pilot demo window.
- Docker CMD previously started the server without running migrations — any new
  deployment would fail silently on a schema mismatch.
- Migration script was compiled to nothing because it lived outside `src/`
  (TypeScript `rootDir` boundary). Moved inside `src/` so `pnpm build` produces
  `dist/scripts/migrate.js` for the compiled container.
- nginx static conf hardcoded `http://backend:4000` (Docker compose service name)
  which doesn't resolve on Render. Templating with `BACKEND_URL` makes the same
  image work in both environments.

## Files touched
- `render.yaml` (new)
- `backend/Dockerfile`
- `backend/src/scripts/migrate.ts` (new — moved from `backend/scripts/migrate.ts`)
- `backend/package.json`
- `frontend/Dockerfile`
- `frontend/nginx.conf.template` (new)
- `docker-compose.yml`
- `docs/ops/render-deploy.md` (new)
- `docs/changelog/2026-05-15-render-deploy.md` (new)
