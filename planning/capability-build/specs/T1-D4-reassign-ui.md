# T1-D4 — Reassign UI on Live Route Runs

| Field | Value |
|-------|-------|
| ID | T1-D4 |
| Capability | Reassign an in-progress route run to a different crew (UI for an existing API) |
| Surface | Dispatch |
| Tier | 1 |
| Type | Code (frontend) |
| Depends on | None — API is complete |
| Blocks | Dispatch demo "I can move a run" story |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

The reassign API exists, audit-logged, RLS-enforced. The UI does not expose
it. Dispatchers cannot currently move a run from one crew to another from
inside the app.

This spec adds the missing control to `LeadRouteDetail.tsx`.

Users: Dispatch role moving a run mid-shift, e.g. due to crew absence.

---

## Context

### What exists (verified)

- **API**: `PATCH /route-runs/:id/assign` at
  `backend/src/modules/routes/routeRunRoutes.ts:1009`. Gated `requireAuth +
  requireAnyRole(["Lead", "Admin"])` (lines 1011–1012). Accepts
  `assigned_user_oid` in body. Empty string returns 400. Audit-writes
  `assignment.create`, `assignment.reassign`, or `assignment.cancel`
  depending on prior state. Verified at lines 1015–1056.
- **User list endpoint**: `GET /api/users` at
  `backend/src/modules/admin/resourceRoutes.ts:137`. Gated `requireAuth +
  requireAnyRole(["Lead", "Admin"])`. Returns identity-directory rows where
  `last_seen_role IN ('UL', 'Lead')`. **Note**: this filter currently
  excludes Admins as assignees, which is correct for this UI (we assign
  runs to field workers, not Admins).
- **Component**: `frontend/src/components/LeadRouteDetail.tsx` (123 lines).
  Header shows run id, pool, status. Renders stop list. No assignment
  control.

### Audit claim verified vs. corrected

- Audit cites `routeRunRoutes.ts:1009` — confirmed.
- Audit says "API is complete and audit-logged — frontend just doesn't
  expose it" — confirmed.

---

## What to Build

Implementation order:

### 1. Backend

No changes.

### 2. Frontend API client

In existing `frontend/src/api/routeRuns.ts` (or wherever
`getLeadRouteRunById` lives — verify at dispatch):
- Add `reassignRouteRun(token, runId, assignedUserOid: string | null)` →
  `PATCH /route-runs/:id/assign`. Passing `null` cancels the assignment;
  passing a string reassigns.

Also confirm an existing `listAssignableUsers(token)` exists or add one
that calls `GET /api/users`.

### 3. Frontend component

Modify `LeadRouteDetail.tsx`:
- Add a "Reassign" control near the header (alongside pool/status). Use
  `OpsButton` for trigger.
- Click → opens a modal (use existing modal primitive from the design
  system; confirm at dispatch) showing:
  - Current assignee (display name if available; otherwise OID — see open
    question 2 in the index report)
  - A select / autocomplete populated from `listAssignableUsers`
  - A "Clear assignment" option (sends `null`)
  - Confirm + Cancel buttons
- On confirm, call `reassignRouteRun`. On success, refresh the route detail
  (re-fetch via existing `getLeadRouteRunById`).
- Disabled state: the reassign control is hidden / disabled if
  `routeRun.status === 'completed'` (no point reassigning a finished run).

### 4. Routing / nav

No changes.

### 5. RBAC / auth

No changes. The component is already mounted under
`RequireRole={["Lead", "Admin"]}` at `App.tsx:251`.

### 6. Audit logging

No new actions. Backend writes `assignment.create | reassign | cancel`
already.

---

## Data Model

No schema changes. `route_runs.assigned_user_oid` already exists and is
the column the API patches.

---

## API Contracts

Existing endpoint consumed:

```
PATCH /api/route-runs/:id/assign
Authorization: Bearer <token>   (Lead + Admin)
Body: { "assigned_user_oid": "<oid>" | null }

Response 200:
{ "ok": true, "route_run": { ... } }

Response 400:
{ "error": "assigned_user_oid cannot be empty string" }
```

Existing endpoint consumed:

```
GET /api/users
Authorization: Bearer <token>   (Lead + Admin)

Response 200:
{ "ok": true,
  "users": [ { "id": "<oid>", "displayName": "...", "email": "...",
              "role": "UL" | "Lead" } ] }
```

---

## Labor Safety Constraint

The reassign UI surfaces worker `display_name` and `oid` to Dispatch in two
places: (a) the current-assignee display, and (b) the assignee selector.
This is legitimate because **assignment is intent**, not work-product
attribution. Dispatchers must know who is on which run to do their job.
This is the same data already shown in the assignment picker on the route
creation flow.

What this spec must **not** do:
- Display any per-worker metric (run completion time, stops/hour, hazard
  rate, on-time count, etc.) alongside the worker name in the picker.
  Only `displayName` and (optionally) `email` are exposed. No history,
  no scoring.
- Show a "currently assigned to N runs" badge — that is a comparative
  workload metric and is prohibited.

---

## Tests Required

- Component test: opening the modal, selecting an assignee, confirming
  → calls `reassignRouteRun` with the right OID.
- "Clear assignment" path calls with `null`.
- Empty-string guard (the API rejects `""`) is matched by the UI never
  sending `""` — selecting "none" sends `null`.
- Status guard: completed run hides the reassign button.
- Existing backend test for the assign endpoint covers authz, RLS, audit
  write — no new backend tests required.

---

## Done Criteria

- [ ] `reassignRouteRun` added to `frontend/src/api/routeRuns.ts`
- [ ] `LeadRouteDetail.tsx` shows the "Reassign" control in the header
- [ ] Modal opens, populates from `/api/users`, selecting + confirm
      triggers PATCH
- [ ] "Clear assignment" sends `null`
- [ ] Reassign control hidden on completed runs
- [ ] Component tests pass
- [ ] Manual smoke test against dev backend: reassign a run, see the new
      assignee on refresh, see the audit row in the audit log viewer (if
      T1-A5 has shipped — otherwise via DB query)
- [ ] Changelog entry written

---

## Out of Scope

- Add/swap/remove individual stops on a live run (audit's other half of
  D-4 — deferred Tier 4)
- Bulk-reassign multiple runs at once
- Reassign from `LeadRoutesPanel` list view (only from `LeadRouteDetail`)
- Cancel-and-recreate flows
- Notifying the previous or new assignee (out-of-band concern)

---

## Dependencies and Sequencing

- Independent of all other Tier 1 specs. **May ship in parallel with
  the role rename workstream** — backend RBAC is unchanged and the UI
  shows assignee display names (not role strings).
- Smallest Tier 1 item by code size; ships first if Dispatch demo polish
  is the priority.
