# Current System State

**This document describes the system as it exists today — not the target.**
The target is `target_architecture.md`.
This document exists so agents and developers know what is broken, what is intentional, and what must not be accidentally broken during work.

---

## System Status: Transitional

The system is in a controlled transitional state. The canonical domain model (`core.visits`, `core.observations`, `core.evidence`) is substantially implemented: as of **2026-06-14** the normalized observation shape landed (CANON-NORM Steps 1–6, merged) — `core.observations` carries the five normalized columns (`obs_kind`/`norm_status`/`norm_severity`/`intervention`/`type_id`), the write-time normalizer is active, the `core.v_observation_normalized` read seam exists, and the backfill is complete. The remaining canonical deltas are tracked open issues (e.g. ISSUE-018 intelligence_reader app-wiring, the `complexity_score`/ISSUE-008 recompute, CC-repoint pending merge), not missing columns. Transit-vertical tables (`public.*`) still carry operational meaning that the canonical layer does not yet fully cover. Both must coexist during migration.

---

## What Is Working and Must Not Regress

| Behavior | Where | Notes |
|----------|-------|-------|
| Entra / Azure AD auth (MSAL) | `frontend/src/auth/`, `backend/src/authz.ts` | JWT validated via JWKS; popup + silent flow |
| OID-based identity | `core.visits.actor_oid`, `authz.ts` | Entra OID is the identity proof on every visit |
| Visit created on every stop completion | `domains/visit/visitService.ts` | Idempotent via UUIDv5 `client_visit_id` |
| Observations emitted on stop completion | `domains/observation/observationService.ts` | Post-commit; see gap §5.7 |
| UL Today's Route | `modules/work/ulRoutes.ts`, `hooks/useTodayRoute.ts` | Returns ordered stops for current date |
| Stop wizard (checklist → safety → infra → submit) | `components/today-route/StopDetail.tsx` | Full offline path exists |
| Skip with hazard → visit + observations | `modules/work/routeRunStopRoutes.ts` | Parallel path to complete |
| Offline queue + replay | `offline/offlineQueue.ts`, `offline/OfflineSyncManager.tsx` | localStorage-backed, deterministic replay order |
| Multi-photo upload (pre and post stop) | `stopPhotosService.ts`, `offline/photoStore.ts` | Photos in IndexedDB until sync |
| Lead route creation + OSRM optimization | `modules/routes/routeRunRoutes.ts` | Route pool + base required |
| Lead route reassignment / overrides | `domains/routeRun/routeOverrideService.ts` | Per-pool override rules |
| Admin metadata writes (pools, stops) | `modules/admin/adminRoutes.ts` | Pool CRUD, stop patch |
| Aggregate Control Center | `modules/admin/adminRoutes.ts` ccRouter | No individual attribution |
| Signed URL photo upload (MinIO/S3) | `modules/work/uploadRoutes.ts` | Dev: MinIO; prod: S3-compatible |

---

## Known Gaps (canonical model is incomplete)

These are diagnosed defects, not design decisions. Each represents a delta between current state and `target_architecture.md`.

> **§5.1, §5.2, §5.3, §5.6, §5.7 RESOLVED 2026-09-07 (ISSUE-051).** These five were
> written before the ISSUE-031 Stage-2 clip made `completeStop` canonical-only and
> in-transaction, and before ISSUE-063 closed the evidence path. They are marked
> resolved inline below with references; kept (not deleted) so the history reads.
> Remaining genuinely-open items in this section: §5.4/§5.5 (intentional transit
> artifacts), §5.8 (cosmetic param name), §5.9 (visit lifecycle — reshaped by
> ISSUE-063, see note there).

### §5.1 — `assignment_id` never written on `core.visits` — ✅ RESOLVED
- **RESOLVED (ISSUE-051 recon, 2026-09-07):** `ensureVisitForRouteRunStop()` resolves
  the canonical assignment (`core.assignments` where `source_ref = route_run_id`,
  `assignment_type = 'transit_stop_clean'`) and writes `assignment_id` into the visit
  INSERT (`visitService.ts`). Null only for pre-Tier-5 runs with no assignment row.
- ~~**Column**: `core.visits.assignment_id bigint` — exists in schema, never populated~~

### §5.2 — `outcome` and `reason_code` always null on `core.visits` — ✅ RESOLVED
- **RESOLVED (ISSUE-051 recon, 2026-09-07):** `closeVisitForRouteRunStop()` writes
  `outcome='completed'` on complete and `outcome='skipped'` + `reason_code` on the
  skip path (`cleanLogService.ts` / `routeRunStopRoutes.ts` skip handler), both inside
  the completion transaction.
- ~~**Columns**: both always null~~

### §5.3 — `washed_can` not emitted as an observation — ✅ RESOLVED
- **RESOLVED (ISSUE-031 Stage-2 clip):** all five cleaning-action booleans incl.
  `washed_can` are emitted as `core.observations` action rows via
  `emitObservationsForStop()` from `uiPayload` (`cleanLogService.ts`).
- ~~**Source**: `washed_can` → written to `clean_logs` only~~

### §5.4 — `clean_logs` records actions, not state truth
- `clean_logs` stores boolean flags (`picked_up_litter = true`) — what someone *did*, not what *was true*
- This is intentionally kept as a transit vertical artifact; `core.observations` is the canonical state layer
- **Do not expand `clean_logs`** — new state facts belong in `core.observations`

### §5.5 — `user_id = 123` hardcoded in `clean_logs`
- `const user_id = 123; // DEV ONLY` in `cleanLogService.ts`
- `clean_logs.user_id` is a non-functional integer placeholder
- Identity is correctly recorded via `actor_oid` on `core.visits` — the legacy `user_id` is vestigial
- **Do not use this pattern** in new code

### §5.6 — Photos not written to `core.evidence` — ✅ RESOLVED
- **RESOLVED (PATTERN-001/PHOTOS 2026-08-18 + ISSUE-063 2026-09-07):** `createStopPhotos()`
  writes `core.evidence` (+ the encrypted `core.evidence_actor_audit` sidecar) atomically,
  and the photos route now `ensureVisitForRouteRunStop` before writing so evidence can
  never be silently skipped for a missing visit.
- ~~`core.evidence` exists but no code writes to it~~

### §5.7 — Observations emitted post-commit on a separate connection — ✅ RESOLVED
- **RESOLVED (ISSUE-031 Stage-2 for complete; ISSUE-051 2026-09-07 for skip):** the
  complete-stop path emits observations on the caller's `client` inside the single
  BEGIN/COMMIT (`cleanLogService.ts` + `routeRunStopRoutes.ts` complete handler). The
  skip-with-hazard path was the last holdout — it committed then emitted on a fresh
  pool connection with no retry; ISSUE-051 moved its `emitObservationsForStop` (and the
  route-run completion check) inside the transaction, passing `client`, before COMMIT.
  Regression test: `tests/canonical/skipHazardAtomic.test.ts`.
- ~~emission ran post-commit with no transactional guarantee~~

### §5.8 — Spot-check observation emits inside transaction using ambiguous pool reference
- `emitSpotCheckObservation({ pool: client, ... })` — `pool` is actually a `PoolClient`, not a `Pool`
- Works by coincidence (both have `.query()`) but is a naming hazard
- **Fix**: Rename parameter to `client` to match actual type

### §5.9 — Photo upload pre-creates an open visit (wrong lifecycle)
- `stopPhotosService.ts` calls `ensureVisitForRouteRunStop()` at photo-upload time
- This creates a `core.visits` row with `ended_at = NULL` before the stop is started or completed
- **Consequences**:
  - If the stop is abandoned, the visit is never closed (`ended_at` stays null permanently)
  - `started_at` reflects the photo upload time, not arrival time — making it an unreliable arrival timestamp
  - `visit_type` is hardcoded `"service"` before outcome is known
- **Fix**: Visit creation must be tied to a single authoritative lifecycle event (stop start), not photo upload
- **NOTE (ISSUE-063, 2026-09-07):** photo upload now *deliberately* calls
  `ensureVisitForRouteRunStop` before writing evidence — REQUIRED because the offline
  replay order (`UPLOAD_STOP_PHOTOS` → `START_STOP`) delivers photos before start, and
  evidence was silently lost without a visit. Do NOT "fix" §5.9 by removing that ensure.
  The remaining lifecycle nuance (started_at = upload time when a photo precedes start)
  is the true residual; ensureVisit is idempotent so start/complete reuse the same visit.

---

## Production Readiness Gaps

These are infrastructure-level gaps that affect production deployment but do not break current local dev behavior. See `planning/specs/infra/dev_to_prod_diagnostic.md` for full detail.

| Gap | Risk | Priority |
|-----|------|----------|
| DB connection hardcoded to `localhost:5432` | Breaks on cloud deploy | High |
| OSRM URL inconsistency (`OSRM_URL` env vs `OSRM_BASE_URL` in code) | Silent misconfiguration | Medium |
| MinIO endpoint uses localhost + HTTP | Breaks TLS-enforced S3 / non-local hostname | High |
| No Dockerfiles or CI/CD | No production deploy path | High |
| Secrets committed in `.env` files | Credential exposure | High |
| No migration runner — ad hoc SQL scripts | Schema drift risk | Medium |
| No observability (logging, metrics, tracing) | Blind in production | Medium |
| No automated DB backup | Data loss risk | High |

---

## Intentional Transitional Patterns

These are not bugs — they are deliberate coexistence patterns during migration:

- **`public.*` tables coexist with `core.*` tables** — transit vertical uses both during migration
- **`cleanLogService.ts` is a transit adapter** — it bridges the stop-completion workflow to the canonical model; it is not the primary write path and should not be extended
- **`route_run_stops` is not the system of record** — it is a transit workflow artifact; `core.visits` is the system of record for what happened
