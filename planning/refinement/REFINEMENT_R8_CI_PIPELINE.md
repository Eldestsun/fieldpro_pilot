# R8 — CI Pipeline

> **Goal**: Wire a GitHub Actions pipeline that runs backend tests, builds Docker images, and deploys to a staging environment on every push to `main`.
>
> **Status**: 🔴 Not started — unblocked (Tier 6 Sub-task C done 2026-05-12)
> **Depends on**: Tier 6 Sub-task C (Dockerfiles must exist first) — satisfied
> **Blocks**: Nothing

---

## Files to Touch

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` (new) | Main CI pipeline |
| `.github/workflows/deploy-staging.yml` (new) | Staging deploy pipeline |
| `backend/.env.ci` (new) | CI environment variable template (no secrets — references GitHub secrets) |

---

## Pipeline 1 — CI (runs on every push and PR)

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: fieldpro
          POSTGRES_PASSWORD: fieldpro_pass
          POSTGRES_DB: fieldpro_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Install backend dependencies
        run: npm ci
        working-directory: backend

      - name: Run migrations
        run: npm run migrate
        working-directory: backend
        env:
          DATABASE_URL: postgres://fieldpro:fieldpro_pass@localhost:5432/fieldpro_test

      - name: Run tests
        run: npm test
        working-directory: backend
        env:
          DATABASE_URL: postgres://fieldpro:fieldpro_pass@localhost:5432/fieldpro_test
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_API_AUDIENCE: ${{ secrets.AZURE_API_AUDIENCE }}

  build-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend

      - name: Build frontend
        run: npm run build
        working-directory: frontend
        env:
          VITE_API_BASE_URL: /api

  build-docker-images:
    needs: [test-backend, build-frontend]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Build backend image
        run: docker build -t baseline-backend:${{ github.sha }} ./backend

      - name: Build frontend image
        run: docker build -t baseline-frontend:${{ github.sha }} ./frontend
```

---

## Pipeline 2 — Deploy to Staging (runs on push to main after CI passes)

```yaml
name: Deploy to Staging

on:
  workflow_run:
    workflows: [CI]
    branches: [main]
    types: [completed]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        # Implementation depends on hosting choice:
        # - Fly.io: fly deploy --config fly.staging.toml
        # - Railway: railway up
        # - AWS ECS: aws ecs update-service ...
        # - DigitalOcean App Platform: doctl apps update ...
        run: echo "Configure deploy step for chosen hosting provider"
```

---

## Required GitHub Secrets

Document these in `backend/.env.ci`:

```
# Required GitHub Actions secrets (set in repo Settings → Secrets → Actions)
AZURE_TENANT_ID=           # Azure Entra tenant ID
AZURE_API_AUDIENCE=        # Azure app registration audience
AZURE_CLIENT_ID=           # (optional, for staging auth)

# Staging database (set for staging deploys)
DATABASE_URL=              # postgres://user:pass@host:5432/db

# Container registry (if pushing images)
REGISTRY_URL=              # e.g. ghcr.io/org/baseline
REGISTRY_TOKEN=            # GitHub token or registry PAT
```

---

## R8 Overall Done Definition

R8 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `.github/workflows/ci.yml` runs on every PR — tests pass, frontend builds
- [ ] Docker images build successfully in CI
- [ ] Staging deploy pipeline defined (even if deploy step is a placeholder pending hosting choice)
- [ ] Required secrets documented in `.env.ci`
- [ ] A PR to `main` with a failing test blocks the merge (branch protection rule set)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r8-ci-pipeline.md`

---

## Agent Launch Block

```
Ops task. Read CLAUDE.md, then planning/REFINEMENT_R8_CI_PIPELINE.md.
Create .github/workflows/ci.yml with the pipeline defined in the file:
  - test-backend job with a Postgres service container
  - build-frontend job
  - build-docker-images job (runs on main only, after tests pass)
Create .github/workflows/deploy-staging.yml as a stub triggered after CI passes.
Create backend/.env.ci documenting required secrets.
Do not change any application source files.
```
