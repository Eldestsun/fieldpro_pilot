# 2026-08-18 — PATTERN-001/PHOTOS: photo→evidence silently skipped (bare pool into createStopPhotos)

## What changed
- `ulRoutes.ts` POST `/route-runs/:runId/stops/:stopId/photos`: the persist block
  now resolves org fail-closed (`resolveNumericOrgId`) and runs
  `createStopPhotos` + the response list on a `withOrgContext` client inside an
  explicit BEGIN/COMMIT (Q-D atomicity — evidence + identity sidecar together or
  not at all). Previously it passed the **bare pool**: `createStopPhotos`' visit
  lookup ran with no `app.current_org_id` against FORCE RLS, saw no visit,
  skipped `core.evidence` — and the route still returned `ok:true, photos:[]`.
- New canonical tests (`stopPhotosEvidence.test.ts`, 2 — this path had ZERO
  coverage, which is why the suite stayed green while the route wrote nothing):
  org-context path writes evidence + encrypted sidecar atomically; context-less
  connection cannot see the visit (the exact silent-skip condition, with the
  GUC cleared explicitly — see intermittency note).

## Why
- Root cause of AGENT-SMOKE-1 finding #2 (photo→evidence never persisting),
  caught by the first live agent write-path smoke and pinned by the
  founder-verification audit-log trace. CLAUDE.md's own hard rule ("never bare
  `pool.query()` on RLS tables") violated at one call site.
- **Intermittency explained:** pooled connections recycle session GUCs; a
  bare-pool call sometimes rode a connection still carrying a previous
  request's org context (and worked), sometimes hit a clean one (and silently
  skipped). The regression test's first run caught a recycled context live.
- **Corrections recorded:** the "VISIT-SKIP-1 nondeterministic visit skip" and
  the 2026-08-17 18:00Z "mystery actor" were both artifacts of an 8.5-hour turn
  gap in the testing session — block-D smoke calls executed at 18:00Z; the visit
  was created normally by `start`. Both retracted on the board card
  (PATTERN-001/PHOTOS, formerly VISIT-SKIP-1).

## Verification
- Backend canonical suite **198/198** (196 + 2 new).
- Live end-to-end on the fixed route: start → multipart upload → `core.evidence`
  row + `actor_ref='encrypted'` sidecar landed; response returns the photo
  (previously `[]`). All test data cleaned per the new Agent Smoke-Test
  Discipline (DB scaffolds + MinIO objects removed; audit rows retained by
  design); founder can confirm with the verification query pack.

## Files touched
- backend/src/modules/work/ulRoutes.ts
- backend/tests/canonical/stopPhotosEvidence.test.ts (new)
- backend/tests/run.ts
- docs/changelog/bugfix/2026-08-18-pattern-001-photos-org-context.md (this file)
