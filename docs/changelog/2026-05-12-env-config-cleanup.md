# 2026-05-12 — Environment variable configuration cleanup

## What changed

- **`backend/.env.example`**:
  - Added a Docker section at the bottom documenting the localhost → service-name swap for containerized deployment (`PGHOST=db`, `OSRM_BASE_URL=http://osrm:5005`, `MINIO_ENDPOINT=minio`).
  - Removed `MINIO_PORT` and `MINIO_PUBLIC_URL`. Neither is read by any file in `backend/src/` (confirmed by grep). They were actively misleading — someone deploying would set them and wonder why nothing changed.
- **`docker-compose.yml`**: reconciled MinIO env var names in the `backend` service block with what `backend/src/s3Client.ts` actually reads. `MINIO_ACCESS_KEY` → `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_KEY` → `MINIO_SECRET_ACCESS_KEY`, and added `MINIO_BUCKET=fieldpro-uploads` + `MINIO_REGION=us-east-1` (both were missing — the bucket omission in particular would have caused uploads to call `PutObjectCommand` with `Bucket: undefined`).
- **Root `.env.example`**: deleted. It predated the Entra auth migration (still referenced `JWT_SECRET` / `SESSION_SECRET` and a `postgresql://postgres:postgres@db:5432/fieldpro` DSN that doesn't match the current compose), and was the kind of artifact someone would copy from in good faith and waste an afternoon on.

## Why

- One authoritative example file (`backend/.env.example`) instead of two that disagree.
- Three-way agreement between source (`backend/src/s3Client.ts`), the example file, and the compose backend env block — so `docker compose up --build` actually wires object storage correctly rather than silently failing on uploads.
- No dead vars in the example file to mislead anyone setting up a new environment.
- Docker section documents the localhost → service-name swap so the same example file covers both local dev and containerized deployment.

## Files touched

- `backend/.env.example`
- `docker-compose.yml`
- `.env.example` (deleted)
