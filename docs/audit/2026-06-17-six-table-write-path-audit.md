# Six-Table Write-Path Audit (ISSUE-031 recon)

> **Scope**: RECON ONLY. For each of the six work-attribution adapter tables, determine whether a
> LIVE application write path still reaches it from the app surface, or whether the write has been
> clipped so the app now writes only to `core.*`.
>
> **Branch**: `recon/issue-031-six-table-write-paths` (cut from `origin/main` @ `6117c60`).
> **Repo**: `/Users/adamyu/Desktop/Optimized_Life/baseline/fieldpro_pilot`.
> **DB**: `fieldpro_db` (localhost), counts taken as superuser `postgres` (RLS bypassed for true totals).
> **Method**: grep `backend/src/**` + `backend/scripts/**` for every INSERT/UPDATE/UPSERT and every
> SELECT; trace each writer to an Express route registration; SQL `count(*)` + `max(<ts>)`.
> Verdicts are backed by grep + SQL, **not row counts alone**.

---

## Executive summary

| Table | Writer (file:line) | Live route | Dual-writes `core.*`? | Live rows / last ts | **Verdict** |
|-------|--------------------|-----------|-----------------------|----------------------|-------------|
| `public.clean_logs` | `cleanLogService.ts:98` | `POST /api/route-run-stops/:id/complete` | **Yes** — `core.visits` + `core.observations` | 6 / 2026-06-01 | **STILL WRITTEN LIVE FROM APP SURFACE** |
| `public.hazards` | `hazardService.ts:66` | `POST …/:id/skip-with-hazard` **and** `…/:id/complete` | **Yes** — `core.visits` + `core.observations` | 2 / 2026-06-01 | **STILL WRITTEN LIVE FROM APP SURFACE** |
| `public.infrastructure_issues` | `infrastructureIssueService.ts:49` | `POST …/:id/complete` (via `completeStop`) | **Yes** — `core.visits` + `core.observations` | 2 / 2026-06-01 | **STILL WRITTEN LIVE FROM APP SURFACE** |
| `public.level3_logs` | **none** | **none** | n/a | **table dropped** | **DEAD** |
| `public.stop_photos` | `stopPhotosService.ts:66` | `POST /api/route-runs/:runId/stops/:stopId/photos` | **Yes** — `core.evidence` + `core.evidence_actor_audit` | 9 / 2026-06-01 | **STILL WRITTEN LIVE FROM APP SURFACE** |
| `public.trash_volume_logs` | `cleanLogService.ts:128` | `POST …/:id/complete` (via `completeStop`) | **Yes** — `core.observations` (`trash_volume`) | 4 / 2026-06-01 | **STILL WRITTEN LIVE FROM APP SURFACE** |

**Headline:** five of six tables are still dual-written from the live field-worker surface (canonical
write + adapter write in the same request). None has been clipped to core-only. `level3_logs` is the
only clipped/dead table — it has zero writers and the table itself was dropped by migration
`20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql` (`DROP TABLE public.level3_logs;`, line 186).

> **Note on the shared `max` timestamp (2026-06-01).** All five live tables share the same
> last-write date because that is the most recent reseed/field-completion batch in this local DB —
> not evidence of a clipped path. The write paths are intact in code; the next stop completion would
> write all five. Verdicts rest on the code paths, with counts as corroboration.

---

## 1. `public.clean_logs`

### Write path
- **`backend/src/domains/routeRunStop/cleanLogService.ts:98`** — `INSERT INTO clean_logs (visit_id,
  route_run_stop_id, stop_id, asset_id, user_id, duration_minutes, picked_up_litter, emptied_trash,
  washed_shelter, washed_pad, washed_can, photo_keys, cleaned_at, org_id) VALUES …` inside
  `completeStop()`.
- **Reachability — LIVE.** `completeStop` is imported and called at
  `backend/src/modules/work/routeRunStopRoutes.ts:528`, inside the handler for
  **`POST /route-run-stops/:route_run_stop_id/complete`** (`routeRunStopRoutes.ts:424`,
  `requireAuth` + `requireAnyRole(["Specialist","Dispatch","Admin"])`). Mounted at
  `app.use("/api", routeRunStopRoutes)` (`app.ts:43`). This is the primary stop-completion endpoint.
- No migration/seed/dead writer exists (the only other matches are doc comments and the canonical
  reader `cleanLogsCanonicalQuery.ts`).

### Core write in the same path — **DUAL-WRITE**
Same `completeStop` transaction also writes canonical:
- `core.visits` via `ensureVisitForRouteRunStop(client, …)` (`cleanLogService.ts:76`) and
  `closeVisitForRouteRunStop` (`:139`).
- `core.observations` via `emitObservationsForStop({ phase:"submit", visitId, … })`
  (`cleanLogService.ts:163`).
- (Also `stop_effort_history` at `:174`, derived from `core.observations`.)

### Read path
- **`loadRouteRunById.ts:81`** — `LEFT JOIN clean_logs cl ON cl.route_run_stop_id = rrs.id`, selecting
  only the five action booleans (`picked_up_litter … washed_can`). Feeds the **route-run detail view**
  (called from `ulRoutes`, `routeRunRoutes`, `routeRunStopRoutes`, `devRoutes`). **Does not read the
  worker-identity column** (`user_id` not selected).
- The `/api/admin/clean-logs` and `/api/ops/clean-logs` action-log endpoints (`adminRoutes.ts:699`,
  `opsRoutes.ts:399`) **no longer read this table** — they were repointed to canonical via
  `buildCleanLogsCanonicalQueries` (`cleanLogsCanonicalQuery.ts`); `clean_logs:` there is only a JSON
  response key. Comment at `adminRoutes.ts:685`: *"No public.clean_logs read remains."*
- `riskMapService` legacy rebuild does **not** read `clean_logs`.

### Worker-identity column
`user_id bigint` exists, but the live writer hard-codes it to `LEGACY_TRANSIT_USER_ID = 0`
(`routeRunStopRoutes.ts:449`) — no real identity is stored, and no live read consumes it.

### Live row count
`count = 6`, `max(cleaned_at) = 2026-06-01 08:04:20+00`.

### **Verdict: STILL WRITTEN LIVE FROM APP SURFACE** — dual-write intact.

---

## 2. `public.hazards`

### Write path
- **`backend/src/domains/routeRunStop/hazardService.ts:66`** — `INSERT INTO hazards (visit_id, stop_id,
  asset_id, route_run_stop_id, reported_by, hazard_type, photo_key, severity, notes, details,
  reported_at, org_id) VALUES …` inside `createHazardForRouteRunStop()`.
- **Reachability — LIVE, two callers**, both in `routeRunStopRoutes.ts`:
  - **`POST /route-run-stops/:id/skip-with-hazard`** (`:158`) → `createHazardForRouteRunStop` at `:227`
    (skip-for-safety flow; hazard is mandatory).
  - **`POST /route-run-stops/:id/complete`** (`:424`) → `createHazardForRouteRunStop` at `:503` when a
    `safety.hazard_types[]` array is present.
  - Both guarded by `requireAuth` + `requireAnyRole(["Specialist","Dispatch","Admin"])`.
- Note: a raw `req.body.hazards` payload on `/complete` is explicitly **ignored**
  (`routeRunStopRoutes.ts:520`) — hazards only come via the `safety` step.

### Core write in the same path — **DUAL-WRITE**
- `core.visits` via `ensureVisitForRouteRunStop` (inside `hazardService.ts:58`, and again in the
  route at `:251`) + `closeVisitForRouteRunStop` (`:257`).
- `core.observations` via `emitObservationsForStop({ … safetyHazards … })` — emitted post-commit on
  the skip path (`routeRunStopRoutes.ts:277`) and via `completeStop`'s `emitObservationsForStop` on
  the complete path. Severity magnitude is carried losslessly into `core.observations.norm_severity`
  via the shared `toNumericSeverity` scale (`hazardService.ts:10`, CANON-NORM-2).

### Read path
- **`adminRoutes.ts:1285`** (`LEFT JOIN public.hazards h`) and **`:1301`** (`FROM public.hazards`) — the
  **daily-summary dashboard** endpoint ("Total Hazards Today"). Live read; counts hazard rows, does not
  expose `reported_by`.
- **`riskMapService.ts:424`** (`FROM hazards`) — inside `rebuildStopRiskSnapshotLegacy()`, which has
  **no live caller** (see §note); dead. The live `rebuildStopRiskSnapshot` reads `core.observations`
  instead (`riskMapService.ts:125`: *"replaces hazards table"*).

### Worker-identity column
`reported_by bigint` exists; live writer passes `userId = 0` (LEGACY constant). Not read on any live
surface.

### Live row count
`count = 2`, `max(reported_at) = 2026-06-01 08:05:30+00`.

### **Verdict: STILL WRITTEN LIVE FROM APP SURFACE** — dual-write intact.

---

## 3. `public.infrastructure_issues`

### Write path
- **`backend/src/domains/routeRunStop/infrastructureIssueService.ts:49`** — `INSERT INTO
  public.infrastructure_issues (visit_id, route_run_stop_id, stop_id, asset_id, reported_by,
  issue_type, photo_key, component, cause, notes, details, needs_facilities, reported_at, org_id)
  VALUES …` (loop, one per issue) inside `createInfrastructureIssuesForRouteRunStop()`.
- **Reachability — LIVE.** Called only from `completeStop` (`cleanLogService.ts:113`) when
  `infraIssues[]` is non-empty → reached via **`POST /route-run-stops/:id/complete`**. No other caller.

### Core write in the same path — **DUAL-WRITE**
Runs inside the same `completeStop` transaction as the `core.visits` + `core.observations` writes
(see §1). Per-issue detail (cause/component/notes) is also pushed into the observation payload, not just
this adapter table — `cleanLogService.ts:159`: *"…reach the observation payload, not just the
infrastructure_issues adapter table (ISSUE-031 Step 5)."*

### Read path
- **`adminRoutes.ts:1307`** (`FROM public.infrastructure_issues`) — daily-summary dashboard
  ("Total infrastructure issues today"). Live read; does not expose `reported_by`.
- **`riskMapService.ts:432`** (`FROM infrastructure_issues`) — inside the dead
  `rebuildStopRiskSnapshotLegacy()`. The live rebuild reads `core.observations`
  (`riskMapService.ts:179`: *"replaces infrastructure_issues"*).

### Worker-identity column
`reported_by bigint` exists; live writer passes `reportedBy = user_id = 0`. Not read live.

### Live row count
`count = 2`, `max(reported_at) = 2026-06-01 08:04:20+00`.

### **Verdict: STILL WRITTEN LIVE FROM APP SURFACE** — dual-write intact.

---

## 4. `public.level3_logs`

### Write path — **NONE**
- Zero INSERT/UPDATE in `backend/src/**` or `backend/scripts/**`. Repo-wide, the only write-shaped
  statement is a one-time backfill `UPDATE` in a migration
  (`20260518_rls_phase2_add_orgid.sql:294`) — not an app-surface writer.
- **The table no longer exists.** Migration
  `20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql:186` runs `DROP TABLE public.level3_logs;`
  (investigation header: *"level3_logs empty: 0 rows, 0-row join, byte-identical output"*). Confirmed
  live: `SELECT to_regclass('public.level3_logs')` → NULL; `SELECT count(*) … FROM public.level3_logs`
  → `ERROR: relation "public.level3_logs" does not exist`.

### Core write — n/a (no writer).

### Read path
- **`riskMapService.ts:407`** (`FROM level3_logs`) — inside the dead `rebuildStopRiskSnapshotLegacy()`
  only. The live rebuild replaced it with a "days since last completed visit" computation over
  `core.visits` (`riskMapService.ts:88`: *"replaces level3_logs"*). No live reader; the legacy code
  would throw if ever invoked (table gone), but it is unreachable.

### Live row count
Table dropped — count not applicable.

### **Verdict: DEAD** — no live (or any) writer, and the table has been dropped from the schema.

---

## 5. `public.stop_photos`

### Write path
- **`backend/src/domains/routeRunStop/stopPhotosService.ts:66`** — `INSERT INTO stop_photos (visit_id,
  route_run_stop_id, asset_id, s3_key, kind, created_by_oid, captured_at, org_id) SELECT id, … FROM
  core.visits WHERE client_visit_id = $1` (loop, one per uploaded key) inside `createStopPhotos()`.
- **Reachability — LIVE.** `createStopPhotos` is called at `ulRoutes.ts:290`, inside
  **`POST /route-runs/:runId/stops/:stopId/photos`** (`ulRoutes.ts:217`, `requireAuth` +
  `requireAnyRole(["Specialist","Dispatch","Admin"])`, multipart upload). Mounted at
  `app.use("/api", ulRoutes)` (`app.ts:41`). This is the field photo-upload endpoint.

### Core write in the same path — **DUAL-WRITE** (+ identity sidecar)
Same function writes:
- `core.evidence` (`stopPhotosService.ts:84`) — `INSERT INTO core.evidence (org_id, visit_id,
  observation_id, kind, storage_key) SELECT v.org_id, v.id, NULL, $1, $2 FROM core.visits v WHERE
  v.client_visit_id = $3`.
- `core.evidence_actor_audit` (`:99`) — the no-grant identity sidecar (captured-by OID).
- The whole loop is wrapped in one transaction when handed a bare `Pool` (the production `/photos`
  path) — Q-D atomicity fix (`stopPhotosService.ts:28`).

### Read path
- **`loadRouteRunById.ts:95`** (`JOIN public.stop_photos sp`) — selects `s3_key` for the spot-check
  events block in the route-run detail view. **Does not read** the worker-identity column.
- **`stopPhotosService.ts:130`** `countStopPhotosByRouteRunStop` (`SELECT COUNT(*) FROM stop_photos`) —
  used as the after/safety-photo gate in the complete & skip handlers.
- **`stopPhotosService.ts:149`** `listStopPhotosByRouteRunStop` (`SELECT id, route_run_stop_id, s3_key,
  kind, captured_at, created_by_oid FROM stop_photos`) — **reads the worker-identity column
  `created_by_oid`**, returned in the `/photos` POST/GET response (`ulRoutes.ts:298`).

### Worker-identity column
`created_by_oid text NOT NULL` — **this table stores a real OID** (written from `req.user.oid`,
`ulRoutes.ts:290` → `userOid`), unlike the `user_id=0` / `reported_by=0` placeholders on the other
adapters. It **is read** by `listStopPhotosByRouteRunStop`. (Canonical captured-by identity is held
separately in the no-grant `core.evidence_actor_audit` sidecar.)

### Live row count
`count = 9`, `max(captured_at) = 2026-06-01 08:05:18+00`.

### **Verdict: STILL WRITTEN LIVE FROM APP SURFACE** — dual-write intact.

---

## 6. `public.trash_volume_logs`

### Write path
- **`backend/src/domains/routeRunStop/cleanLogService.ts:128`** — `INSERT INTO trash_volume_logs
  (visit_id, route_run_stop_id, stop_id, asset_id, volume, org_id) VALUES …` inside `completeStop()`,
  conditional on `trashVolume !== undefined`.
- **Reachability — LIVE.** Via `completeStop` → **`POST /route-run-stops/:id/complete`**. (`trashVolume`
  is required when any cleaning task is checked; validated 0–4 at `routeRunStopRoutes.ts:482`.)

### Core write in the same path — **DUAL-WRITE**
Same `completeStop` transaction. The trash volume reaches canonical as a `core.observations` row of
`observation_type = 'trash_volume'` (emitted by `emitObservationsForStop`; read back at
`cleanLogService.ts:225` `WHERE o5.observation_type = 'trash_volume'`). Live risk-map rebuild reads the
canonical value — `riskMapService.ts:106`: *"Trash volume from canonical observations (replaces
trash_volume_logs)."*

### Read path
- **`riskMapService.ts:414`** (`FROM trash_volume_logs`) — inside the dead
  `rebuildStopRiskSnapshotLegacy()` only. **No live reader.**

### Worker-identity column
None (no `user_id` / `reported_by` / `*_oid` column on this table).

### Live row count
`count = 4`, `max(logged_at) = 2026-06-01 08:04:20+00`.

### **Verdict: STILL WRITTEN LIVE FROM APP SURFACE** — dual-write intact (but it has no live reader; the
only reader is dead legacy code).

---

## Cross-cutting notes

- **The dead legacy reader.** `rebuildStopRiskSnapshotLegacy(pool)` (`riskMapService.ts:386`) is the
  sole reader of `level3_logs`, `trash_volume_logs`, and the `riskMapService` reads of `hazards` /
  `infrastructure_issues`. It has **no caller anywhere** in `backend/src` — preserved verbatim under
  Tier-2 additive discipline for output-diffing, slated for deletion at Tier-2 done. The **live**
  `rebuildStopRiskSnapshot` (`:36`, called from `riskMapJob.ts:14` and `adminRoutes.ts:950`) reads
  `core.observations` exclusively. Treat all six tables as having **no live intelligence reader**.

- **Live readers that remain** are operational, not intelligence: the route-run detail loader
  (`clean_logs`, `stop_photos` — action booleans / s3 keys, no worker identity) and the admin
  daily-summary dashboard (`hazards`, `infrastructure_issues` — counts only).

- **Clip readiness.** Five tables are pure dual-writes whose canonical twin already carries the truth
  (`core.observations` / `core.evidence`). The remaining live *reads* are the only thing a clip must
  repoint first: the route-run detail loader (`clean_logs` booleans, `stop_photos` s3 keys) and the
  admin daily-summary (`hazards` / `infrastructure_issues` counts). `stop_photos.created_by_oid` is the
  one adapter column still holding — and serving — a real worker OID on a live read path
  (`listStopPhotosByRouteRunStop`); its canonical replacement is the no-grant `core.evidence_actor_audit`
  sidecar. `trash_volume_logs` has no live reader at all and is the cleanest clip candidate.

---

*Recon complete. No table, schema, or app-code changes were made. This document is the only deliverable.*
