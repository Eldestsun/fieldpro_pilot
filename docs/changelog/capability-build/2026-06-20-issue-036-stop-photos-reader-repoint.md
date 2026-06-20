# 2026-06-20 — ISSUE-036 — repoint `listStopPhotosByRouteRunStop` off `public.stop_photos` onto `core.evidence`

## What changed

Three scoped moves; no behavioral change to the API envelope beyond the removal of one
identity field.

### Move 1 — new canonical query (`backend/src/domains/routeRunStop/stopPhotosService.ts`)

`listStopPhotosByRouteRunStop` no longer reads `public.stop_photos`. It now reads
`core.evidence`, joined through the canonical visit:

```
route_run_stop_id → deriveClientVisitId(routeRunStopId)
  → core.visits.client_visit_id = that value
  → core.visits.id = core.evidence.visit_id
```

New query:

```sql
SELECT e.id, e.storage_key, e.kind, e.captured_at
FROM core.evidence e
JOIN core.visits v ON v.id = e.visit_id
WHERE v.client_visit_id = $1
  [AND e.kind = $2]          -- optional kind filter preserved
ORDER BY e.captured_at ASC, e.id ASC
```

- Photo id is `core.evidence.id`.
- `route_run_stop_id` is echoed from the input arg (not a selected column).
- The optional `kind` filter and the existing `ORDER BY captured_at ASC, id ASC` are
  preserved.
- The per-row presign is preserved; the source column is `storage_key` (core.evidence),
  not `s3_key`. The returned envelope still exposes the value under the `s3_key` key so
  the response shape is unchanged.
- `deriveClientVisitId` reuses the same import already present for the write path
  (`createStopPhotos`): `../../domains/visit/visitService`.

### Move 2 — drop `created_by_oid` from the response type

- `StopPhoto` interface (`stopPhotosService.ts`): `created_by_oid` removed.
- `PhotoDto` (`frontend/src/api/routeRuns.ts:753`): `created_by_oid` removed.
- Optimistic placeholder `created_by_oid: ""` removed (`frontend/src/components/today-route/StopDetail.tsx:393`).

Recon (`docs/audit/2026-06-18-issue-031-stop-photos-oid-gate-recon.md` §4) confirmed zero
UI consumers of the field; this is non-breaking.

### Move 3 — response envelope unchanged

Both handlers — POST read-back (`ulRoutes.ts:298`) and GET (`ulRoutes.ts:368`) — still
return `{ ok: true, photos }`. No handler edits were required; the per-row shape (now
minus the OID field) flows from the service return type.

## Why

Labor-safety, PILOT-GATE. The prior reader served the **real Entra capture OID** out to a
live API read path by selecting `public.stop_photos.created_by_oid` (recon §4 labor-safety
flag). Repointing the reader to `core.evidence` removes the OID from that read surface.

The guarantee is **structural, not an omission**: `core.evidence` has no OID column, so the
capture OID cannot leave this path even if a future SELECT widened to `*`. The capture OID
continues to live only in the grant-walled `core.evidence_actor_audit` sidecar
(`intelligence_reader` / `mcp_readonly` have no grant there — recon §5), untouched by this
change.

## Verification

- **(a) New query reads `core.evidence`, no OID anywhere in SELECT or return** — confirmed
  in source above and in the diff.
- **(b) `grep -n "created_by_oid"` in service + handlers** — zero matches in any SELECT,
  return, or executable code. One match remains at `stopPhotosService.ts:37`: a historical
  comment in `createStopPhotos` documenting the ISSUE-031 Stage-2 mirror clip. Out of this
  card's three-move scope and accurate; left as-is.
- **(c) `StopPhoto` / `PhotoDto` / handler return shape** — OID field absent; envelope
  still `{ ok: true, photos }`.
- **(d) `npx tsc --noEmit`** — backend exit 0; frontend exit 0.
- **(e) tests** — backend `npm test`: 119 passed, 0 failed. frontend `npm test`: 27
  passed (5 files).
- **(f) presign** — query selects `e.storage_key`; presign calls
  `getPresignedReadUrl(row.storage_key)` (not `s3_key`).

## Out of scope (explicit, untouched)

- Export scripts (`sftpExport.ts`, `exportDeleteRoutes.ts`) — they intentionally join the
  sidecar for OID. Untouched.
- `route_runs.created_by_oid` — different table, intentional Enterprise-creator field.
  Untouched.
- `public.stop_photos` itself — NOT dropped or altered. The table drop is ISSUE-037, gated
  separately. This card moves only the READER.
- `createStopPhotos` write path — unchanged.

## Files touched

- `backend/src/domains/routeRunStop/stopPhotosService.ts` — new canonical query; OID
  dropped from `StopPhoto`.
- `frontend/src/api/routeRuns.ts` — OID dropped from `PhotoDto`.
- `frontend/src/components/today-route/StopDetail.tsx` — optimistic OID placeholder removed.

## Forward pointers

- ISSUE-037 — drop `public.stop_photos` (Stage 3). Now that the last live reader is
  repointed, the table has no live read consumer beyond the route-detail DATA-only join
  (`loadRouteRunById.ts:95`, reads `sp.s3_key`/`sp.visit_id`, no identity) noted in recon §4.

## Related

- `docs/audit/2026-06-18-issue-031-stop-photos-oid-gate-recon.md` — the gate recon that
  flagged this reader and scheduled the repoint.
