# 2026-06-18 — ISSUE-031 / STOP-PHOTOS-OID — Phase-0 recon + gate decision

**Question (the gate):** Does the `stop_photos` capture path ALREADY dual-write
`created_by_oid` into `core.evidence_actor_audit` (the grant-walled identity sidecar),
or is the real Entra OID written ONLY into the adapter column
`public.stop_photos.created_by_oid`?

## ⟶ GATE RESULT: **PASS** — the sidecar already dual-writes the OID.

The same `createStopPhotos` path that inserts `public.stop_photos` also inserts
`core.evidence` AND `core.evidence_actor_audit` (carrying the real OID) inside one
transaction. Live DB confirms 9/9 existing rows carry the OID in the sidecar, matched
to canonical evidence. Clipping the adapter mirror therefore drops **no** copy of
capture attribution. **Proceeding to Stage-2 clip** per the gate-pass branch.

---

## Phase-0 findings

### 1. Write path — does the sidecar dual-write the OID? **YES.**
`backend/src/domains/routeRunStop/stopPhotosService.ts` `createStopPhotos`, per key,
inside one owned/joined transaction:

- **Adapter mirror** (`:65-72`): `INSERT INTO stop_photos (… created_by_oid …) … $6` ← `userOid`
- **Canonical data** (`:84-92`): `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key) …`
- **Identity sidecar** (`:99-104`) — the OID dual-write:
  ```sql
  INSERT INTO core.evidence_actor_audit (evidence_id, org_id, actor_ref)
  VALUES ($1, $2, $3)              -- $3 = userOid (the real Entra OID)
  ON CONFLICT (evidence_id) DO NOTHING
  ```

The OID lands in BOTH the adapter column and the grant-walled sidecar **today**. The
sidecar copy is independent of the mirror insert. ⟶ **Gate condition (sidecar already
receives the OID) is satisfied.**

### 2. Live read — where does the OID live for the 9 existing rows? **Both; sidecar matches 9/9.**
Joined `public.stop_photos` → `core.evidence` (by `storage_key`) → `core.evidence_actor_audit`
(by `evidence_id`):

- 9/9 stop_photos rows (ids 19–27) have a matching `core.evidence` row.
- 9/9 have a `core.evidence_actor_audit.actor_ref` equal to `stop_photos.created_by_oid`
  (`oid_match = true` for every row).
- Single distinct OID across all 9: `55a66724-705d-45d3-b160-128906c86aa9` (one real
  Entra OID — NOT constant-0; this is what made the gate necessary).

⟶ The OID is **not** sidecar-orphaned and **not** adapter-only. The sidecar holds a
complete copy.

### 3. Evidence DATA dual-write (non-identity half). **Clip-ready: 9/9.**
Every `stop_photos.s3_key` resolves to exactly one `core.evidence.storage_key` row
(the join in #2 produced an `evidence_id` for all 9). The photo itself is already
canonical-complete; the clip removes only the adapter copy.

### 4. Readers of `public.stop_photos.created_by_oid`.
Repo-wide grep (not trusting prior audit):

| Reader | file:line | State | Columns read |
|---|---|---|---|
| `listStopPhotosByRouteRunStop` (`SELECT … created_by_oid FROM stop_photos`) | `stopPhotosService.ts:142-181` (select `:148`) | **LIVE — serves the real OID** | identity (`created_by_oid`) + data (`s3_key`, `kind`, `captured_at`) |
| ↳ called by POST `/route-runs/:runId/stops/:stopId/photos` | `ulRoutes.ts:298` | LIVE (write→read-back) | via the reader above |
| ↳ called by GET `/route-runs/:runId/stops/:stopId/photos` | `ulRoutes.ts:368` | LIVE (read) | via the reader above |
| ↳ frontend consumes `created_by_oid` | `frontend/src/api/routeRuns.ts:753` | LIVE (typed field) | identity |
| `loadRouteRunById` route-detail | `loadRouteRunById.ts:95` `JOIN public.stop_photos sp` | LIVE | **DATA only** — reads `sp.s3_key`, `sp.visit_id`. Its `created_by_oid` (`:145`) is `rr.created_by_oid` from **route_runs**, a different table — NOT a stop_photos identity read. |

**Labor-safety flag for the punch-list:** `listStopPhotosByRouteRunStop` serves the real
capture OID out to the API on a live read path. Post-clip it reads a now-frozen adapter
column. The scheduled Capability-Build repoint (point it at `core.evidence` and STOP
selecting `created_by_oid`) is therefore **also a labor-safety improvement** — it removes
the OID from an intelligence-adjacent read surface. Flag accordingly.

### 5. Grants on the sidecar `core.evidence_actor_audit`. **Grant-wall intact.**
`information_schema.role_table_grants`:

| grantee | privileges |
|---|---|
| `fieldpro` (app role) | SELECT/INSERT/UPDATE/DELETE |
| `postgres` (superuser) | all |
| `audit_reader` | SELECT (expected — the audit role) |
| **`intelligence_reader`** | **NONE** ✓ |
| **`mcp_readonly`** | **NONE** ✓ |

⟶ The sidecar is walled from both intelligence surfaces. No exposure finding.
(`public.stop_photos` likewise grants only to `fieldpro` — `intelligence_reader` /
`mcp_readonly` have no SELECT there either, so the adapter OID column is not currently
exposed to intelligence; the labor-safety concern in #4 is the *application* read path,
not a DB grant.)

### FK-pointer null-risk check (the `route_run_stops.hazard_id` pattern). **N/A — clean.**
- `information_schema` FK scan: **nothing** references `public.stop_photos` (no inbound
  FK; `confrelid = stop_photos` → empty).
- Code grep for `stop_photo_id` / `photo_id` / `stop_photos.id` denormalized pointers:
  **none.**

⟶ No denormalized pointer would be nulled by the clip. No recoverability concern.

---

## Decision

**GATE PASS.** Proceed to **Stage-2 clip**: remove the `public.stop_photos` mirror
INSERT (data + `created_by_oid`); keep `core.evidence` + `core.evidence_actor_audit`
writes exactly as-is. After the clip, evidence data lands only in `core.evidence` and
the capture OID only in the grant-walled `core.evidence_actor_audit`; the adapter column
is no longer written. Reader repoint + the labor-safety read-surface improvement are
deferred to Capability Build (documented, not done here). Table NOT dropped (Stage 3).
