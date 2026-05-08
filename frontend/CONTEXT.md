# Frontend Workspace — Context

Read this before making any frontend change.

---

## What the Frontend Is

The frontend expresses **Visit → Observation → Evidence** flows in user-facing language.
Field workers see "complete stop," "report an issue," "upload photo."
The backend translates those interactions into canonical structures.
The frontend does not define truth — it captures intent and relays it to the backend.

---

## Required Architecture Reads

Before any feature or refactor work:
- `planning/architecture/target_architecture.md`
- `planning/architecture/current_state.md`

Before any domain-model-touching change:
- `planning/specs/domain-model/visit_creation_audit.md`
- `planning/specs/domain-model/observation_write_flow.md`

Before any offline-path change:
- `planning/specs/offline/offline_queue_architecture.md`

---

## Canonical Model Alignment Rules

1. **New write paths must land in canonical structures.** Any new action that records what happened at a location must produce a visit, observation, or evidence record — not extend `clean_logs`, `route_run_stops`, or other transit-vertical tables directly.

2. **Transit UI components are vertical adapters, not the platform surface.** `StopDetail`, `StopList`, `ULRouteMap`, `AdminControlCenter` are transit-slice implementations. Do not treat them as the reference pattern for new verticals or new features.

3. **No new transit-first screens without architecture review.** If a proposed feature starts with "for transit stops..." or "on the route run...", pause and check whether the feature should be modeled at the canonical level first.

4. **UI language may differ from backend domain terms.** Workers should see "clean," "issue," "skip" — not "Observation," "Evidence," "Visit." The enforcement point is the backend contract, not the UI wording.

---

## Offline-First Rules (hard requirement)

Every new mutation path in the UL workflow must handle offline execution:

1. **Enqueue first, execute second.** Any action a field worker takes must be serializable to the offline queue before the API call is attempted.
2. **Use `offlineQueue.ts` for action management** — do not add parallel persistence mechanisms.
3. **Use `stopDraftStore.ts` for wizard-in-progress state** — partial form state belongs in IndexedDB, not React state only.
4. **Use `photoStore.ts` for photo blobs** — photos captured offline live in IndexedDB until `OfflineSyncManager` replays them.
5. **`OfflineSyncManager` is headless and global.** It runs at app root. Do not duplicate its replay logic in individual components.
6. **Replay order is deterministic:** `UPLOAD_STOP_PHOTOS` → `START_STOP` → `SKIP_STOP_WITH_HAZARD` → `COMPLETE_STOP`.

See `planning/specs/offline/offline_queue_architecture.md` for full detail.

---

## Labor Safety Rules (hard constraints)

These are architectural constraints, not style preferences:

- **No GPS dots or worker location display** — no map overlay showing where a specific worker is
- **No per-worker rankings** — no leaderboard, no "fastest worker," no completion rate comparisons
- **No punitive metrics** — no UI that implies a worker is behind, slow, or underperforming
- **No comparison surfaces** — nothing that puts two workers side by side on a performance dimension
- **Control Center is aggregate only** — it shows operational state (what was planned, what happened, what needs attention), not individual attribution

If a requested feature would require displaying individual worker performance data, stop and flag it before proceeding.

---

## Stable Behaviors — Do Not Regress

These behaviors are proven and must not be broken by any change:

| Behavior | Key Files |
|----------|-----------|
| Entra / Azure AD login (MSAL) | `auth/AuthContext.tsx`, `msalConfig.ts` |
| OID-based identity (not username/email) | `auth/AuthContext.tsx` |
| UL Today's Route view | `hooks/useTodayRoute.ts`, `components/today-route/` |
| Stop wizard (checklist → safety → infra → submit) | `components/today-route/StopDetail.tsx` |
| Offline queue enqueue + replay | `offline/offlineQueue.ts`, `offline/OfflineSyncManager.tsx` |
| Multi-photo upload (pre and post stop) | `api/routeRuns.ts` uploadStopPhotos |
| Lead route creation and reassignment | `hooks/useCreateRoute.ts`, `components/admin/` |
| Admin metadata writes (pools, stops) | `components/admin/AdminPoolsPanel.tsx`, `AdminStopsPanel.tsx` |
| Aggregate-only Control Center | `components/admin/AdminControlCenter.tsx` |

---

## Folder Reference

```
src/
  api/            ← API client functions (all fetch calls)
  auth/           ← MSAL wrappers, AuthContext, RequireRole
  components/
    admin/        ← Lead + Admin UI (Control Center, pools, stops)
    today-route/  ← UL worker UI (stop list, stop detail, map)
    ui/           ← Shared UI primitives
  hooks/          ← useTodayRoute, useCreateRoute, etc.
  offline/        ← offlineQueue, stopDraftStore, photoStore, OfflineSyncManager
  utils/          ← offlineMode hook, misc utilities
```
