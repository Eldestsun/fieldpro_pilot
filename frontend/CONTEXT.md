# Frontend Workspace — Context

Read this before making any frontend change. This file holds **invariants only**;
for what exists today, read the tree. (Thinned 2026-08-15, HYG-3: stale folder map and
pre-rename role names removed; see git history for the old form.)

---

## What the Frontend Is

The frontend expresses **Visit → Observation → Evidence** flows in user-facing
language. Workers see "complete stop," "report an issue," "upload photo" — the backend
translates those into canonical structures. The frontend does not define truth; it
captures intent and relays it.

Surfaces by role (post-rename: **Specialist / Dispatch / Admin**):
Specialist → `/work`; Dispatch → `/routes` + `/ops/*` (incl. Control Center at
`/ops/control-center`); Admin → `/admin/*`. Route guards via `RequireRole` in `App.tsx`.

## Required Reads

Routing lives in `CLAUDE.md § Task Routing` (authoritative). Additionally:
- domain-model changes: `planning/specs/domain-model/` (visit + observation flows)
- offline-path changes: `planning/specs/offline/offline_queue_architecture.md`

## Canonical Model Alignment (hard)

1. **New write paths land in canonical structures** — a new action that records what
   happened at a location produces a visit/observation/evidence record, not an
   extension of `clean_logs`, `route_run_stops`, or other transit tables.
2. **Transit UI components are vertical adapters, not the platform surface.** Do not
   treat them as the reference pattern for new verticals.
3. **No new transit-first screens without architecture review.** If a feature starts
   with "for transit stops…", check whether it should be modeled canonically first.
4. **UI language may differ from domain terms.** Workers see "clean/issue/skip," not
   "Observation/Evidence/Visit." The enforcement point is the backend contract.

## Offline-First (hard)

Every new mutation path in the Specialist workflow must handle offline execution:
1. **Enqueue first, execute second** — serializable to the queue before the API call.
2. `offlineQueue.ts` for action management — no parallel persistence mechanisms.
3. `stopDraftStore.ts` for wizard-in-progress state (IndexedDB, not React state only).
4. `photoStore.ts` for photo blobs until replay.
5. `OfflineSyncManager` is headless and global at app root — never duplicate its
   replay logic in components.
6. Replay order is deterministic:
   `UPLOAD_STOP_PHOTOS` → `START_STOP` → `SKIP_STOP_WITH_HAZARD` → `COMPLETE_STOP`.

Full detail: `planning/specs/offline/offline_queue_architecture.md`.

## Labor Safety (hard constraints)

Authoritative list: `CLAUDE.md § Labor Safety Guardrails`. Frontend expression: no GPS
dots or worker-location display; no per-worker rankings, punitive metrics, or
comparison surfaces; Control Center is aggregate-only (operational state, not
individual attribution). If a requested feature needs individual worker performance
data, stop and flag before building.

## Auth

MSAL/Entra is the real path (`auth/AuthContext.tsx`, `msalConfig.ts`); identity is the
OID, never username/email. The dev bypass is for headless agent sessions only — never
suggest it for founder browser issues (`CLAUDE.md § Dev Auth Bypass`,
`docs/dev/dev-auth-bypass.md`).

## Must-Not-Regress

Proven behaviors: Entra login; Specialist Today's-Route + stop wizard
(`components/today-route/`); offline enqueue/replay (`offline/`); multi-photo upload;
Dispatch route creation/reassignment; Admin pools/stops writes; aggregate-only Control
Center. The executable form is the vitest suite (`pnpm test`) + Playwright e2e — run
vitest before claiming a frontend change done.
