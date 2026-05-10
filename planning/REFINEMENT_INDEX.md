# BASELINE App Refinement Index

> Orchestration layer for the product refinement track.
> Runs alongside and after the DB Refactor (Tiers 1–6).
> Each item has its own handoff file. This document tracks ordering, dependencies, and status.
> Last updated: 2026-05-10

---

## What This Track Is

The DB Refactor (Tiers 1–6) makes the canonical state model correct and trustworthy.
This track makes the application production-grade and pitch-ready.

These are two parallel workstreams. Several refinement items can begin before all tiers are complete.

---

## Item Map

| ID | Name | Depends On | Parallel With | Status |
|----|------|-----------|---------------|--------|
| R1 | Auth Identity Cleanup | — (unblocked) | R3, R4, R10 | 🟢 Done |
| R2 | Arrival Observations — Real Prior State | Tier 1 done | R1, R3, R4 | 🟠 In Review |
| R3 | Frontend Router | — (unblocked) | R1, R2, R4, R10 | 🟢 Done |
| R4 | Offline UX — Worker Feedback Layer | — (unblocked) | R1, R2, R3 | 🟢 Done |
| R5 | Enterprise UI/UX Rebuild | R3 done | R6 | 🟡 Unblocked |
| R6 | Control Center — Live Updates | Tier 3 done | R5 | 🟡 Unblocked |
| R7 | Historical Backfill Framework (Scale Asset) | Tier 1 done | R6, R8 | 🔴 Not started — low priority, post-pilot |
| R8 | CI Pipeline | Tier 6 Sub-task C done | R7 | ⛔ Blocked by Tier 6C |
| R9 | Frontend Tests | R5 stable | — | ⛔ Blocked by R5 |
| R10 | Stop Effort History (replace workforce_metrics) | Tier 4 Sub-task B done | R1, R3 | 🟡 Unblocked |

---

## Execution Order

```
R1 ──────────────────────────────────────── (start anytime)
R3 ──────────────────────────────────────── (start anytime, must precede R5)
R4 ──────────────────────────────────────── (start anytime)

Tier 1 ──► R2 (arrival observations need populated core.observations)

R3 ──► R5 (router must be in place before full UI rebuild)
         └──► R9 (test the stable UI, not the one being rebuilt)

Tier 3 ──► R6 (Control Center must be mounted before live updates make sense)

Tier 1 ──► R7  (low priority — post-pilot scale asset)

Tier 6C ──► R8 (CI needs Dockerfiles to exist first)

Tier 4B ──► R10 (drop surveillance tables, then rebuild correctly)
```

---

## Item Summaries

### R1 — Auth Identity Cleanup
**File**: `planning/REFINEMENT_R1_AUTH_IDENTITY.md`

Replace `user_id = 123` and `PILOT_DEV_UL_USER_ID = 123` stubs in backend write paths with the real OID from the authenticated request context. OID is already available on `req.user.oid` after `requireAuth` middleware. This is a targeted 3-file backend pass.

Status: Complete — LEGACY_TRANSIT_USER_ID = 0 replacing all stubs. Changelog written 2026-05-08.

---

### R2 — Arrival Observations — Real Prior State
**File**: `planning/REFINEMENT_R2_ARRIVAL_OBSERVATIONS.md`

`arrivalObservations()` in `observationService.ts` always returns hardcoded dirty states regardless of actual stop condition. Replace with a lookup of the most recent `core.observations` for the stop. Workers arrive at a stop and see its last known condition, not a pessimistic assumption.

---

### R3 — Frontend Router
**File**: `planning/REFINEMENT_R3_FRONTEND_ROUTER.md`

Replace `App.tsx`'s flat view-switch state machine with `react-router-dom` v6. Enables deeplinking, browser back/forward, shareable URLs, and a scalable navigation foundation for the UI rebuild. Must precede the enterprise UI rebuild.

Status: Complete — react-router-dom v7 installed, BrowserRouter wrapping App, full Routes/Route declarations, RequireRole + DefaultRedirect components. Changelog written 2026-05-10.

---

### R4 — Offline UX — Worker Feedback Layer
**File**: `planning/REFINEMENT_R4_OFFLINE_UX.md`

The offline queue and replay engine are production-quality but entirely invisible to the worker. Add a queue status indicator (pending action count), conflict resolution UI (surfaces ROUTE_REASSIGNED and ROUTE_NOT_FOUND conflicts), and replay feedback (success/failure notification). All built on the existing `offlineQueue` subscription API.

---

### R5 — Enterprise UI/UX Rebuild
**File**: `planning/REFINEMENT_R5_ENTERPRISE_UI.md`

Replace the dev-grade inline-style UI with an enterprise-standard design system. Mobile-first for UL workers. Responsive for Leads (tablet) and Admins (desktop). Consistent component library, typography, spacing, color, loading states, error states, and empty states across the full application surface.

---

### R6 — Control Center — Live Updates
**File**: `planning/REFINEMENT_R6_CONTROL_CENTER_LIVE.md`

Once Control Center is mounted (Tier 3), it loads data once on mount and goes stale. Add polling or server-sent events so dispatchers see route status, exceptions, and stop completion update in near-real-time without refreshing.

---

### R7 — Historical Backfill Framework (Scale Asset)
**File**: `planning/REFINEMENT_R7_HISTORICAL_BACKFILL.md`

A configurable, org-agnostic backfill framework for future customer organizations that have existing operational history to import. KCM pilot does not use this — KCM has no paper data and the canonical layer will fill organically through shadow-mode UL usage. Built as a scale and sales asset. Dependency on R1 removed. Low priority — do not start until pilot is in flight.

---

### R8 — CI Pipeline
**File**: `planning/REFINEMENT_R8_CI_PIPELINE.md`

Wire a GitHub Actions pipeline: run backend integration tests, build Docker images, push to a container registry, deploy to a staging environment. Requires Tier 6 Sub-task C Dockerfiles to exist first.

---

### R9 — Frontend Tests
**File**: `planning/REFINEMENT_R9_FRONTEND_TESTS.md`

Add component tests (Vitest + Testing Library) for the UL stop wizard, offline queue status indicator, and role-based navigation. Add E2E tests (Playwright) for the full UL stop completion flow and Lead route creation flow. Should be written after R5 (UI rebuild) is stable — no value in testing markup that's about to be replaced.

---

### R10 — Stop Effort History
**File**: `planning/REFINEMENT_R10_STOP_EFFORT_HISTORY.md`

Replace the dropped `workforce_metrics` and `stop_scoring_history` tables with correctly designed stop-level effort and condition history tables. Worker-safe by structure (no `user_id`). Keyed by `stop_id` and `visit_id`. Feeds route planning intelligence and stop assignment decisions. Runs after Tier 4 Sub-task B drops the surveillance tables.

Status: Unblocked — Tier 4B complete as of 2026-05-08. stop_effort_history and stop_condition_history tables exist, empty, ready for write path wiring.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟠 In review | Code written, verification pending |
| 🟢 Done | All done-criteria verified |
| ⛔ Blocked | Hard dependency not yet met |

---

## Cross-Refinement Constraints

These apply across all refinement items:

1. **Auth is frozen at the middleware level**: Do not touch `authz.ts`, `AuthContext.tsx`, or `msalConfig.ts`. R1 replaces stub constants in route handlers only.
2. **Offline contract is frozen**: Do not change `offlineQueue.ts` action schema or replay order. R4 adds UI on top — it does not change the queue mechanics.
3. **Labor safety is non-negotiable**: R10 may only introduce stop-level tables keyed by `stop_id`. No `user_id` column on any new table.
4. **Transit adapter writes stay intact**: No refinement item removes `clean_logs`, `stop_photos`, or any transit write until Tier 2 is verified complete.
5. **Every item produces a changelog entry**: `docs/changelog/YYYY-MM-DD-{slug}.md` before marking done.
