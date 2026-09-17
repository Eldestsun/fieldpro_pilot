# 2026-09-16 — ISSUE-068: complete-stop verifies photo_keys against real uploads

## What changed
- **`routeRunStopRoutes.ts` (complete handler):** the legacy `photo_keys` branch
  of the completion gate — previously presence-only (ANY non-empty string array
  passed) — now verifies every claimed key against the upload bucket via
  HeadObject before accepting:
  - any missing key → **400** with `missing_keys` listing exactly which keys
    have no object behind them;
  - entries must be non-empty strings; array capped at 20 keys (DoS guard);
  - **storage unreachable ≠ key missing**: on a storage outage the gate falls
    back to the DB evidence trail (`core.evidence` rows exist only via the
    server's own multipart uploads, so they prove real photos without touching
    storage). Only when storage is unreachable AND no evidence exists does it
    refuse — **503** (retryable), never a silent pass.
- **`s3Client.ts`:** new `findMissingObjects(keys)` (sequential HeadObject;
  metadata-only, 1–3 keys per completion at pilot scale — cost decision noted
  per the card) and typed `StorageUnreachableError` separating "definitively
  absent" (client error) from "cannot check" (service condition).
- **New regression `photoKeysVerified.test.ts`** (registered): drives the REAL
  HTTP handler against REAL MinIO — fabricated key → 400 + named in
  `missing_keys` + stop stays pending; genuinely uploaded object → 200 + stop
  done; mixed real+fabricated → 400 naming only the fabricated key. Test
  objects deleted after each case (MinIO left clean).

## Why
- AGENT-SMOKE-1 finding #3: a client (or corrupted replay) could complete a
  stop with fabricated or failed-upload keys — the completion gate was
  satisfiable by any string. Scope note: the modern photos path was already
  sound (the server generates keys and uploads the bytes itself, so
  `core.evidence` cannot point at nothing from that path); the legacy
  `photo_keys` branch was the actual hole — and it is the LIVE branch (the UI
  sends `photo_keys`, checked first).

## Offline-replay safety (the card's guardrail)
- Replay order is `START(1) → UPLOAD_STOP_PHOTOS(2) → SKIP(3) → COMPLETE(4)`
  and the photo upload is server-side — so a legitimate offline completion's
  objects exist before this gate runs. A hard 400 therefore only fires on keys
  that were never uploaded (fabrication or a dead upload action, which already
  dead-letters visibly today); the queue marks the complete failed — visible,
  not silent. Transient storage outages take the evidence-fallback/503 path,
  not a 400.

## Verification
- `tsc --noEmit` clean; full backend suite **220/220** (217 prior + 3 new).
- No migration (code-only); no frozen files touched; MinIO verified clean of
  test objects after the run.

## Files touched
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/s3Client.ts`
- `backend/tests/canonical/photoKeysVerified.test.ts` (new)
- `backend/tests/run.ts`
- `docs/changelog/bugfix/2026-09-16-issue-068-verify-photo-keys.md` (this entry)
