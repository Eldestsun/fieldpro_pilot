# 2026-06-18 — ISSUE-031 Stage 2: stop_photos dual-write mirror clipped (OID-gated)

> ## ⚠️ PRE-CAPABILITY-BUILD GATE — consolidate the accumulating repoints
>
> This is the **fourth** Stage-2 clip, and Capability-Build repoint notes now span
> multiple PRs and remain **unconsolidated**. Running list of scheduled repoints:
>
> 1. **hazards EAM-bridge `is_exception` gap** — hazards Stage-2 clip changelog.
> 2. **hazards admin-summary reader** — hazards Stage-2 clip changelog.
> 3. **`loadRouteRunById.ts` clean-action booleans** — clean_logs Stage-2 clip changelog.
> 4. **`listStopPhotosByRouteRunStop`** — this changelog (Reader inventory below).
>    Repoint to `core.evidence`; **doubles as a labor-safety fix** (the reader currently
>    serves the real capture OID on a live API read path).
>
> **Before Capability Build starts, these repoints MUST be collected into a single
> punch-list.** Consolidation is a **pre-Capability-Build gate, not optional** — scattered
> PR descriptions are exactly how repoints get missed. Whoever kicks off Capability Build:
> sweep every Stage-2 changelog for "scheduled-repoint" / "Capability Build" notes and
> assemble them into one tracked list before any repoint work begins.

## The gate (this clip was conditional)
Unlike the prior three Stage-2 clips, `stop_photos.created_by_oid` carries a **real Entra
OID** (not constant-0). Clipping the mirror was gated on one question: *does the capture
path already dual-write the OID into the grant-walled sidecar `core.evidence_actor_audit`,
or only into the adapter column?* Full recon: `docs/audit/2026-06-18-issue-031-stop-photos-oid-gate-recon.md`.

**GATE PASSED.** The same `createStopPhotos` transaction already wrote `core.evidence` +
`core.evidence_actor_audit` (with the OID) alongside the mirror. Live DB confirmed **9/9**
existing rows carry the OID in the sidecar, matched to canonical evidence. Clipping drops
no copy of capture attribution.

## What changed
- Removed the `public.stop_photos` mirror INSERT (photo data **and** `created_by_oid`) from
  the evidence write path (`createStopPhotos` in `stopPhotosService.ts`). Also removed the
  now-dead `asset_id` lookup that fed only that INSERT. After this change a photo capture
  writes **ONLY** canonical: one `core.evidence` row per photo, and the capture OID into
  the no-grant identity sidecar `core.evidence_actor_audit`. `public.stop_photos` stops
  receiving new rows; the OID is no longer written to the adapter column.
- The canonical `core.evidence` write and the `core.evidence_actor_audit` OID write are
  **unchanged** — kept exactly as-is inside the same owned/joined transaction.

## Why
- Stage 2 of the ISSUE-031 adapter→core clip. The non-identity (photo data) half was
  already canonical-complete: all 9 existing `stop_photos.s3_key` resolve to exactly one
  `core.evidence.storage_key`. The identity half (the OID) was already dual-written to the
  grant-walled sidecar — proven live before clipping (gate recon §1, §2).
- The OID dual-write to the sidecar predates this clip and is independent of the mirror
  INSERT (`stopPhotosService.ts` write path, sidecar insert `ON CONFLICT (evidence_id) DO
  NOTHING`). Removing the mirror cannot break either canonical write.

## Field mapping (mirror column → canonical home)
| `stop_photos` column | Canonical home | Status |
|---|---|---|
| `id` (PK) | succeeded by `core.evidence.id` | ✅ routed (no inbound FK; nothing references it) |
| `visit_id` | `core.evidence.visit_id` | ✅ routed |
| `route_run_stop_id` | `core.visits.client_visit_id` (uuidv5 `route-run-stop:<id>`) | ✅ routed (indirect; no identity) |
| `asset_id` | (not carried on evidence; lookup removed) | ✅ no canonical home needed — asset lives on `core.observations`, not the photo |
| `s3_key` | `core.evidence.storage_key` | ✅ routed (9/9 live match) |
| `kind` | `core.evidence.kind` | ✅ routed |
| `captured_at` | `core.evidence` row creation | ✅ routed |
| **`created_by_oid` (REAL Entra OID)** | **`core.evidence_actor_audit.actor_ref`** (grant-walled sidecar) | ✅ routed — already dual-written; 9/9 live match. Adapter column no longer written. |
| `org_id` | `core.evidence.org_id` | ✅ routed |

## Changes
| Path | Change |
|---|---|
| `backend/src/domains/routeRunStop/stopPhotosService.ts` | Removed the `INSERT INTO stop_photos (…)` mirror write and its no-visit warning; removed the now-dead `asset_id` SELECT that fed only that INSERT; updated the Q-D header comment to describe the two-canonical-table path post-clip |
| `backend/tests/canonical/evidence.test.ts` | Flipped the "still writes stop_photos (no regression)" test to assert the clip (stop_photos rowCount 0; evidence + sidecar written, sidecar carries the real OID); flipped the Q-D pool-path test's `stop_photos` assertion to rowCount 0; repointed the rollback-atomicity injection from the (removed) `INSERT INTO stop_photos` to the 2nd `INSERT INTO core.evidence (` (open-paren match excludes the sidecar insert); repointed the empty-list no-op check from `stop_photos` to `core.evidence`; tidied a stale comment |

## Scope boundaries (explicitly NOT done)
- `public.stop_photos` table NOT dropped (Stage 3). Still exists post-clip; the 9 existing
  rows keep their frozen `created_by_oid`.
- **No FK pointer to null.** `information_schema` FK scan: nothing references
  `public.stop_photos` (no inbound FK). Code grep: no `stop_photo_id` / `photo_id` /
  `stop_photos.id` denormalized pointer. Unlike hazards (`route_run_stops.hazard_id`),
  there is no pointer to clip — clean.
- No reader repointed (Capability Build). Readers reported below.
- No other table touched (`hazards`, `infrastructure_issues`, `clean_logs`,
  `trash_volume_logs` all untouched).
- No dead code deleted beyond the orphaned `asset_id` lookup that fed only the clipped
  INSERT. `rebuildStopRiskSnapshotLegacy` and other capstone cleanup left for the separate
  capstone deletion. `tsc` stays clean.

## Reader inventory (scheduled-repoint note for Capability Build)
Grepped repo-wide. One reader of the now-frozen mirror serves the **identity** column:

1. **`backend/src/domains/routeRunStop/stopPhotosService.ts:142` `listStopPhotosByRouteRunStop`**
   — `SELECT … created_by_oid FROM stop_photos`. **LIVE — serves the real OID.** Called by
   POST `/route-runs/:runId/stops/:stopId/photos` (`ulRoutes.ts:298`, write→read-back) and
   GET `…/photos` (`ulRoutes.ts:368`); the frontend types the field (`routeRuns.ts:753`).
   - **This is the clip, not a bug.** For captures **after** this clip there is no
     `stop_photos` row, so the reader returns an empty list for new stops. That is the
     intended consequence of stopping the mirror write — not a regression to debug. If a
     future investigation finds the photos list empty for recent stops, **this clip is why.**
   - **Repoint = read `core.evidence`** (by `visit_id` / `storage_key`) and **STOP selecting
     `created_by_oid`**. This doubles as a **labor-safety improvement**: it removes the real
     capture OID from a live API read surface. The OID stays in the grant-walled sidecar.
     **Not repointed here by instruction** (Capability Build).

2. **`backend/src/domains/routeRun/loaders/loadRouteRunById.ts:95`** — `JOIN public.stop_photos
   sp` reading **DATA only** (`sp.s3_key`, `sp.visit_id`). Its `created_by_oid` (`:145`) is
   `rr.created_by_oid` from **route_runs**, a different table — not a stop_photos identity
   read. Same frozen-mirror caveat applies to the photo keys; repoint to `core.evidence`.

No other live reader of `public.stop_photos` exists in `src/`.

## Verification
- **Grep proof:** zero `INSERT INTO stop_photos` / `UPDATE stop_photos` in live `src/`. The
  only remaining `src/` references are reads (the two reader fns above) and comments.
- `tsc --noEmit` clean; full backend suite **118/118** pass (incl. the four updated
  `evidence.test.ts` cases: the clip assertion, the Q-D pool path, the rollback injection
  repointed to `core.evidence`, and the empty-list no-op).
- **DB before/after (write-clip delta):** standing `public.stop_photos` count unchanged
  (9 → 9; the suite cleans up its fixtures). `core.evidence` 9, `core.evidence_actor_audit`
  9. The clip test drives a live `createStopPhotos` and asserts post-write: `stop_photos`
  rowCount 0, one `core.evidence` row, and the sidecar carries the real OID.
- **Labor safety:** post-clip no path writes a real OID into any intelligence-readable
  surface. The OID lands only in `core.evidence_actor_audit`, which grants SELECT to
  `audit_reader`/`fieldpro`/`postgres` only — `intelligence_reader` and `mcp_readonly` have
  **zero** SELECT (gate recon §5). `core.evidence` carries no actor column.
- `public.stop_photos` table still exists; both readers untouched.

## Files touched
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/tests/canonical/evidence.test.ts`
- `docs/audit/2026-06-18-issue-031-stop-photos-oid-gate-recon.md` (Phase-0 gate recon)
