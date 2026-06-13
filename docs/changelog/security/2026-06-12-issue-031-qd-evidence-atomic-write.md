# 2026-06-12 — ISSUE-031 Q-D: make the evidence write path atomic

## What changed
- `createStopPhotos()` (`backend/src/domains/routeRunStop/stopPhotosService.ts`)
  now executes its entire write path — `stop_photos` (transit adapter) +
  `core.evidence` (canonical) + `core.evidence_actor_audit` (no-grant identity
  sidecar), across every key — inside **one transaction** instead of as
  independent autocommit statements.
- Transaction ownership is dual-mode, matching the existing `cleanLogService`
  convention:
  - Handed a bare `Pool` (the production `POST /photos` route path,
    `ulRoutes.ts:290`), the function checks out a dedicated connection and owns
    `BEGIN` / `COMMIT` / `ROLLBACK` / `release`.
  - Handed a `PoolClient`, the caller owns the transaction and the function only
    runs statements — joining the caller's atomic unit rather than opening a
    nested one. A `PoolClient` is distinguished by its `.release()` method, which
    a `Pool` does not expose.
- On any failure the whole unit is rolled back and the error is rethrown. The
  "no visit found → warn and skip this key" path is unchanged: a missing visit
  is not an error, so the remaining unit still commits.
- Added two integration tests to `backend/tests/canonical/evidence.test.ts`:
  - pool-handed happy path commits `stop_photos` + `core.evidence` + sidecar
    together (exercises the new `BEGIN`/`COMMIT` ownership branch);
  - an injected mid-write failure rolls the whole unit back, leaving no
    `stop_photos`, no `core.evidence`, and — critically — no orphan
    `core.evidence_actor_audit` identity row.

## Why
- ISSUE-031 redesign ADR (`planning/architecture/2026-06-07-issue-031-redesign-adr.md`
  §3, Q-D) requires the evidence write path to become one transaction, matching
  the visit/observation/assignment paths. It is a bug fix, not architecture.
- Run on autocommit, a mid-loop failure could leave canonical evidence with no
  identity audit, or — worse — an `evidence_actor_audit` identity row whose
  evidence never landed. That orphan-identity state is the one inconsistency a
  labor-safe-by-structure system can never ship.
- No RLS / role / org-context behavior changed: the function still acquires
  connections from the same pool with the same (absent) `app.current_org_id`
  posture it had when the caller passed bare `pool`. Scope is strictly atomicity.

## Files touched
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/tests/canonical/evidence.test.ts`
- `docs/changelog/security/2026-06-12-issue-031-qd-evidence-atomic-write.md` (this file)
