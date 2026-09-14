# 2026-09-14 — AGENT-SMOKE-1 #4: storage bootstrap — upload bucket provisioned in the boot chain

## What changed
- `backend/src/scripts/bootstrapStorage.ts` (new): ensures `MINIO_BUCKET` exists
  before the app serves — `HeadBucket` → no-op if present; `NotFound` →
  `CreateBucket`; any other failure (unreachable endpoint, bad credentials,
  AccessDenied on create) logs the specific cause and **exits 1**, stopping the
  boot chain instead of deferring the failure to the first field upload.
  Same env contract as `s3Client.ts` (`MINIO_ENDPOINT/BUCKET/ACCESS_KEY_ID/
  SECRET_ACCESS_KEY/REGION`) — one config, two consumers. Tolerates the
  create race (`BucketAlreadyOwnedByYou`/`BucketAlreadyExists` = success).
- `backend/Dockerfile` CMD chain: `migrate.js && bootstrapStorage.js && index.js`
  — fresh deploys (compose, Render, Azure) now provision the bucket exactly like
  they provision schema.
- `backend/package.json`: `pnpm run bootstrap:storage` for host-run dev /
  manual invocation (mirrors `migrate`).

## Why
- AGENT-SMOKE-1 finding #4 (2026-08-17): the signed-URL photo path assumes the
  bucket exists, nothing created it, and the dev bucket was hand-created — the
  same invisible-drift class as ISSUE-038/039, at the object-storage layer. A
  fresh environment failed its first upload at runtime. Blocks SHADOW-ENV
  standup (a hosted env must be able to upload from day one).
- Fail-visible discipline: bucket-missing-and-uncreatable is a boot failure,
  not a latent runtime error.

## Verification (against live dev MinIO)
1. Existing bucket (`fieldpro-uploads`) → "exists — nothing to do", exit 0.
2. Missing bucket (scratch name) → created, exit 0 — the fresh-env case proven.
3. Idempotent re-run → no-op, exit 0.
4. Unreachable endpoint → clear error, exit 1 (boot chain halts).
- Scratch bucket deleted after the test (smoke discipline); MinIO left with
  only `fieldpro-uploads`. `tsc --noEmit` clean.

## Files touched
- `backend/src/scripts/bootstrapStorage.ts` (new)
- `backend/Dockerfile`
- `backend/package.json`
- `docs/changelog/ops/2026-09-14-minio-bucket-bootstrap.md` (this entry)
