# 2026-09-17 — CI: MinIO service for the ISSUE-068 photo-verification tests

## What changed
- `.github/workflows/ci.yml` (`test-backend` job):
  - New step **"Start MinIO + bootstrap upload bucket"**: starts the official
    `minio/minio` image via plain `docker run` (a GitHub *service* container
    cannot override the image command, and minio requires `server /data`;
    `bitnami/minio`, which runs by env alone, no longer publishes a `latest`
    tag — first attempt failed on exactly that). Health-polls
    `/minio/health/live`, then creates the bucket with the SAME boot-chain
    script deploys use (`pnpm run bootstrap:storage` — fail-visible, so a
    broken storage setup fails at this step with a legible message instead
    of as three cryptic test failures). Throwaway per-run credentials; the
    container dies with the runner.
  - `MINIO_*` env added to the "Run tests" step.

## Why
- The ISSUE-068 photo-verification tests (`photoKeysVerified.test.ts`)
  exercise the REAL storage chain — server-side upload + HeadObject — by
  design (no mocks). CI had no object storage, so all three failed there:
  the upload throws, and the gate's storage-unreachable fallback correctly
  answers 503 where the test pins 400. **`test-backend` on main has been red
  since PR #132 merged (2026-09-17)** — the suites were verified locally
  (where MinIO exists) but CI wasn't checked on merge; the docs-only PR #137
  surfaced it. Process gap noted: branch protection on main (S3-9) remains an
  open Founder-Infra card — with required checks, a red merge would have been
  blocked.

## Verification
- This PR's own `test-backend` run is the proof: 226/226 green in CI with the
  MinIO service (see PR checks).

## Files touched
- `.github/workflows/ci.yml`
- `docs/changelog/ops/2026-09-17-ci-minio-service.md` (this entry)
