# 2026-05-12 — R8 CI Pipeline

## What changed
- Added `.github/workflows/ci.yml` with three jobs: `test-backend` (Postgres 14 service container, runs migrations + tests), `build-frontend` (vite build), and `build-docker-images` (gated on `refs/heads/main`, needs both prior jobs).
- Added `.github/workflows/deploy-staging.yml` as a stub triggered via `workflow_run` after CI completes successfully on `main`. Deploy step is a placeholder pending hosting choice.
- Added `backend/.env.ci` documenting the GitHub Actions secrets required by the pipeline (Azure Entra, staging DB, optional container registry).
- Used `pnpm/action-setup@v4` with pnpm 10.14.0 and `pnpm install --frozen-lockfile` to match the Tier 6C Dockerfiles, instead of npm/`npm ci` as drafted in the spec.

## Why
- R8 done-criteria require a CI pipeline that runs backend tests, builds the frontend, and builds Docker images on `main`. Tier 6C unblocked this by providing the Dockerfiles.
- The spec's draft used npm, but both `backend/Dockerfile` and `frontend/Dockerfile` install with pnpm 10.14.0 and the repo has `pnpm-lock.yaml` (no `package-lock.json`). CI must match so image builds and CI installs resolve identical dependency trees.
- `.env.ci` keeps the secret contract visible in the repo without storing actual values.

## Files touched
- `.github/workflows/ci.yml` (new)
- `.github/workflows/deploy-staging.yml` (new)
- `backend/.env.ci` (new)
- `docs/changelog/2026-05-12-r8-ci-pipeline.md` (new)
