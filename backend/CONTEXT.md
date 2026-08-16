# Backend Workspace — Context

Read this before making any backend change. This file holds **invariants only** —
rules that don't change as the code grows. For what exists today, read the tree; for
what's broken today, read `planning/architecture/current_state.md`. (Thinned 2026-08-15,
HYG-3: build-state snapshots removed after going stale; see git history for the old form.)

---

## What the Backend Is

The enforcement layer for the canonical state model. It translates application-level
actions (complete stop, upload photo, skip stop) into canonical DB writes
(`core.visits`, `core.observations`, `core.evidence`), and maintains compatibility
bridges for the transit vertical (`public.*` tables) without letting those bridges
become the system of record.

## Required Reads

Routing and the always-read list live in `CLAUDE.md § Task Routing` (authoritative).
Additionally, before any domain-model-touching change:
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` (four-kind taxonomy,
  no-manufactured-state, §9 current-vs-target)
- `planning/specs/domain-model/visit_creation_audit.md`
- `planning/specs/domain-model/observation_write_flow.md`

## Canonical Write Rules (hard)

Every mutation that records what happened in the field follows this hierarchy:

1. **`core.visits`** — the event record. One per field contact. Carries `org_id`,
   `location_id`, `primary_asset_id`, `started_at`, `ended_at`. Actor identity goes to
   the no-grant sidecar (`core.visit_actor_audit`), never onto the row comparatively.
2. **`core.observations`** — state truth. One row per discrete observation, FK'd to a
   visit. Records *what was true*, not *what someone did*. Intelligence reads the
   normalized columns (`obs_kind`/`norm_status`/`norm_severity`), never `payload`.
3. **`core.evidence`** — evidence anchored to a visit; actor identity in
   `core.evidence_actor_audit`.

**`public.*` transit tables** are vertical compatibility bridges. Do not add new
canonical fields to them, and do not expand them to carry canonical meaning.

Write-path invariants (regardless of what's currently broken):
- A visit is created by the lifecycle event it represents — never as a side effect of
  an unrelated write (e.g. a photo upload does not open a visit).
- `assignment_id` is written on every visit that arises from an assignment.
- Observations bind atomically to visit close; do not emit post-commit.

## Module Boundary (hard)

**`domains/` owns canonical logic. `modules/` owns HTTP routing.** Route handlers call
domain functions; domain functions never import from `modules/`. Don't map the tree
here — list it when you need it; it changes.

## Auth, Identity, RLS

- Identity is always `req.user.oid` (Entra OID). Never a hardcoded integer identity.
- Roles are **Specialist / Dispatch / Admin** (post-rename; `APP_ROLE_*` env pins the
  Entra app-role names). Checks via `requireAnyRole([...])` from `authz.ts`;
  `requireAuth` on every non-health endpoint.
- RLS org context and fail-closed resolution rules are in
  `CLAUDE.md § RLS Context Gotcha` (authoritative): `withOrgContext(...)` +
  `resolveNumericOrgId` everywhere; never bare `pool.query()` on RLS tables.
- Dev auth bypass: agent/terminal only — `docs/dev/dev-auth-bypass.md`.

## Offline Replay Compatibility (hard)

The frontend replays queued actions in deterministic order:
`UPLOAD_STOP_PHOTOS` → `START_STOP` → `SKIP_STOP_WITH_HAZARD` → `COMPLETE_STOP`.
Every mutation endpoint must therefore be **idempotent** — safe to call twice with the
same payload. Visit creation achieves this via `client_visit_id` (UUIDv5) +
`ON CONFLICT DO NOTHING`; new mutation endpoints need an equivalent guarantee.

## Must-Not-Regress

The authoritative must-not-regress list lives in
`planning/architecture/current_state.md`; the executable form is
`backend/tests/canonical/` — run it (`pnpm test`) before claiming a backend change
done. Anchors that never move: JWKS validation (`authz.ts`), OID identity + UUIDv5
idempotency (`domains/visit/visitService.ts`), aggregate-only admin/ops queries.

## Labor Safety (hard constraints)

Authoritative list: `CLAUDE.md § Labor Safety Guardrails`. Backend expression of it:
no per-worker attribution in any aggregate query or intelligence output; actor
identity lives in the `core.*_actor_audit` sidecars (structural non-attribution —
see `CANONICAL_STATE_LAYER_DESIGN.md` §3.2); intelligence endpoints stay
aggregate-only and role-scoped.
