# Backend Workspace — Context

Read this before making any backend change.

---

## What the Backend Is

The backend is the enforcement layer for the canonical state model.
It translates application-level actions (complete stop, upload photo, skip stop) into canonical DB writes (`core.visits`, `core.observations`, `core.evidence`).
It maintains compatibility bridges for the transit vertical (`public.*` tables) without letting those bridges become the system of record.

---

## Required Architecture Reads

Before any feature or refactor work:
- `planning/architecture/target_architecture.md`
- `planning/architecture/current_state.md`

Before any domain-model-touching change:
- `planning/specs/domain-model/visit_creation_audit.md`
- `planning/specs/domain-model/observation_write_flow.md`

---

## Canonical Write Rules (hard)

Every backend mutation that records what happened in the field must follow this hierarchy:

1. **`core.visits`** — the event record. One per field contact. Must carry `org_id`, `location_id`, `primary_asset_id`, `actor_oid`, `started_at`, `ended_at`.
2. **`core.observations`** — state truth. One row per discrete observation. Always FK'd to `core.visits`. Records *what was true*, not *what someone did*.
3. **`core.evidence`** — evidence anchored to a visit. Currently unwritten (tracked in `current_state.md`). Photos must eventually land here.

**`public.*` transit tables** (`clean_logs`, `route_run_stops`, `stop_photos`, etc.) are vertical compatibility bridges. They must not be expanded to carry canonical meaning. Do not add new canonical fields to them.

---

## Write Path Discipline

- **Do not create a visit inside a transaction that also does unrelated writes** unless the visit is the authoritative event for that transaction.
- **Do not open a visit during a photo upload.** Photo upload is not the lifecycle event that opens a visit. See `current_state.md` §5.9 — this is a known bug, not a pattern to follow.
- **Observations must be atomically bound to visit close where possible.** The current post-commit observation emit is a known gap (see `current_state.md` §5.7). New code should not repeat this pattern.
- **`assignment_id` on `core.visits` must be written** when a visit arises from an assignment. This is currently broken (see `current_state.md` §5.1) — new visit-creation code must include it.

---

## Module Structure

```
src/
  domains/          ← Canonical domain logic
    observation/    ← observationService.ts — emits core.observations rows
    visit/          ← visitService.ts — creates/closes core.visits rows
    routeRun/       ← route run loaders, start operations
    routeRunStop/   ← cleanLogService (transit adapter), stopPhotosService, hazardService
  modules/          ← Route handlers grouped by surface
    admin/          ← adminRoutes, resourceRoutes
    ops/            ← opsRoutes
    routes/         ← routeRunRoutes
    routeOverrides/ ← routeOverrideRoutes
    work/           ← ulRoutes, routeRunStopRoutes, stopRoutes, uploadRoutes
  routing/          ← OSRM integration (corridor, curbside, cost)
  intelligence/     ← riskMapService, riskMapJob
  services/         ← adminPoolService, adminStopService
```

**`domains/`** owns canonical logic. **`modules/`** owns HTTP routing. Keep them separate — route handlers call domain functions; domain functions do not import from `modules/`.

---

## Auth and Identity Rules

- Identity is always `req.user.oid` — the Azure OID from the Entra token.
- Never use `user_id = 123` or any hardcoded integer user identity in new code. This exists in `clean_logs` as a known dev placeholder (see `current_state.md` §5.5) — do not replicate it.
- Role checks use `requireAnyRole(["UL" | "Lead" | "Admin"])` from `authz.ts`.
- `requireAuth` must be applied to every non-health endpoint.

---

## Offline Replay Compatibility

The frontend offline queue replays actions in this order:
`UPLOAD_STOP_PHOTOS` → `START_STOP` → `SKIP_STOP_WITH_HAZARD` → `COMPLETE_STOP`

Every mutation endpoint must be **idempotent** — safe to call twice with the same payload. The current visit-creation path achieves this via `client_visit_id` (UUIDv5) + `ON CONFLICT DO NOTHING`. New mutation endpoints must have equivalent idempotency guarantees.

---

## Stable Behaviors — Do Not Regress

| Behavior | Key Files |
|----------|-----------|
| JWT validation via JWKS (Entra) | `authz.ts` |
| OID-based identity on visits | `domains/visit/visitService.ts` |
| Visit idempotency (UUIDv5 client_visit_id) | `domains/visit/visitService.ts` |
| Stop completion → visit + clean_log + observations | `domains/routeRunStop/cleanLogService.ts` |
| Skip with hazard → visit + observations | `modules/work/routeRunStopRoutes.ts` |
| Photo upload → stop_photos + visit_id FK | `domains/routeRunStop/stopPhotosService.ts` |
| Signed URL generation (MinIO/S3) | `modules/work/uploadRoutes.ts` |
| Route run creation + OSRM optimization | `modules/routes/routeRunRoutes.ts` |
| Lead route override logic | `domains/routeRun/routeOverrideService.ts` |
| Aggregate-only admin/ops dashboard queries | `modules/admin/adminRoutes.ts`, `modules/ops/opsRoutes.ts` |

---

## Labor Safety Rules (hard constraints)

- No per-worker attribution in any aggregate query or intelligence output
- No individual ranking, scoring, or comparative metrics exposed by any endpoint
- `actor_oid` on `core.visits` identifies the visit author for data integrity — it is not a performance tag and must not be surfaced comparatively
- Intelligence endpoints must remain aggregate-only and role-scoped
