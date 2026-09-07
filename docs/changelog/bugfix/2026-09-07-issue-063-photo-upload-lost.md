# 2026-09-07 — ISSUE-063: photo submission silently lost → stop cannot complete

## Symptom (founder-reproduced)
Submitting an after-photo in the browser failed: the stop never completed
("After photo is required to complete a stop"), returning to My Work still
demanded a photo, and dashboards showed 0% / 0 minutes. Reproduced across every
photo entry point (completion, document-conditions, report-safety skip,
report-infrastructure).

## Root cause — a silent backend evidence skip (the real killer)
`POST /route-runs/:runId/stops/:stopId/photos` uploads to S3 then calls
`createStopPhotos`, which attaches `core.evidence` to the visit via
`INSERT … SELECT FROM core.visits WHERE client_visit_id = deriveClientVisitId(stopId)`.
**When no visit exists, `rowCount = 0` → evidence is skipped → but the endpoint
still returns HTTP 200 with the S3 keys.** Completion then counts 0 evidence
rows and 400s. The photo is lost and the endpoint reported success.

No visit exists in two real cases:
1. **Offline replay order** — the documented order is
   `UPLOAD_STOP_PHOTOS → START_STOP → … → COMPLETE_STOP`, so photos ALWAYS
   replay before the visit is created. Every offline photo hit the skip.
2. **Zombie stop** — a `route_run_stops` row marked `in_progress` whose
   `core.visits` row is absent (start short-circuits on an already-started
   stop and never re-creates it). The founder's stop was one of these.

Three frontend faults compounded it:
- The after-photo gate was a **sticky boolean** set on file *selection*, so the
  requirement read as met while the photo sat only in React state; Finish sent
  a photo-less complete and the photo evaporated on unmount. The gate also
  stayed satisfied after a Discard.
- **Finish did not flush** a selected-but-not-uploaded photo.
- `photoStore.putPhoto` persisted the `File` **by reference**; a mid-flight
  network failure could leave a 0-byte stored blob that replayed as an empty
  multipart and 400'd forever.

## Fix
**Backend** (`ulRoutes.ts` photos route): call `ensureVisitForRouteRunStop`
(idempotent, same `client_visit_id` key as START_STOP) inside the evidence
transaction BEFORE `createStopPhotos`. Evidence can no longer silently vanish;
a later START_STOP reuses the same visit rather than duplicating it.

**Frontend**:
- `StopDetail` photo gate is now **evidence-derived** (uploaded photos OR
  pending files OR durably-queued uploads), never a sticky flag — Discard
  correctly re-closes it.
- **Finish flushes first**: `handleFinish` uploads/queues any pending photo,
  then completes, and refuses to complete if the flush throws.
- `photoStore.putPhoto` **materializes bytes at capture** (copies into a plain
  Blob) and rejects an empty/unreadable source immediately with an actionable
  message; the replay executor rejects a hollow stored blob distinctly instead
  of uploading empty.

## Tests
- Backend `stopPhotosEvidence.test.ts`: new case — photo upload with NO
  pre-existing visit ensures the visit and lands evidence; ensure is idempotent
  (one visit across upload + start). Suite 213/213.
- Frontend `StopWizard.test.tsx`: Finish flushes-then-completes (order asserted);
  Finish does not complete when the flush fails; Discard re-closes the gate.
  `photoStore.test.ts`: empty blob rejected at put. Suite 119/119.

## Verification
Full click-driven E2E on a real Entra session (fresh run, stop 108): attach
photo → **Finish directly** (the exact path that failed) → stop `done`, visit
`completed`+`ended`, 3 normalized observations, `core.evidence` + encrypted
sidecar, effort-history row, run `finished`. DB is the source of truth here —
the My Work view surfaced a different stacked scaffold run afterward, which is a
test-data artifact, not a regression.

## Files touched
- `backend/src/modules/work/ulRoutes.ts`
- `backend/tests/canonical/stopPhotosEvidence.test.ts`
- `frontend/src/offline/photoStore.ts`
- `frontend/src/offline/OfflineSyncManager.tsx`
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/offline/__tests__/photoStore.test.ts` (new)
- `frontend/src/components/today-route/__tests__/StopWizard.test.tsx`
- `docs/changelog/bugfix/2026-09-07-issue-063-photo-upload-lost.md` (this entry)

## Adjacent, not addressed (kept honest)
- §5.9 lifecycle: a photo-before-start now *creates* the visit at upload time
  (started_at = upload time). Given the offline replay order this is the
  pragmatic fix; a fuller lifecycle rework (visit tied strictly to arrival)
  remains §5.9's scope.
- The photo-list reader still reads the frozen `public.stop_photos` adapter
  (ISSUE-035/036 repoint) — unrelated to this loss bug.
