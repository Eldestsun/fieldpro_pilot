# T3-A3 — User Directory (Read-Only)

| Field | Value |
|-------|-------|
| ID | T3-A3 |
| Capability | Admin read-only view of the users known to BASELINE (identity-directory contents + Entra-reported role + last-seen) |
| Surface | Admin |
| Tier | 3 |
| Type | Code (backend + frontend) |
| Depends on | Role rename workstream complete |
| Blocks | Admin "who has access" demo |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

The original audit (ISSUE-010) framed this as full user/role management
with role-write and deactivation. **The locked decision (see index,
§Locked Architectural Decisions item 2) is: Azure Entra is the source
of truth for role assignments. The app does not write roles.** This
spec implements a read-only directory.

Users: Admin verifying who has accessed the system, in what role per
Entra's last-reported claim, and when they were last seen.

---

## Context

### What exists (verified)

- **Table**: `identity_directory`, populated on every successful auth
  by middleware. Confirmed at `backend/src/authz.ts:98–108` (INSERT ON
  CONFLICT DO UPDATE — `last_seen_role` and `last_seen_at` update on
  every login).
- **Existing endpoint**: `GET /api/users` at
  `backend/src/modules/admin/resourceRoutes.ts:137`. Returns rows
  **filtered to `last_seen_role IN ('UL', 'Lead')`** — by design for
  the assignment dropdown, which only assigns runs to field workers /
  dispatchers, not admins. Gated `Lead + Admin`.
- **Audit action registered but unused**: `admin.user_role_change` at
  `backend/src/middleware/auditActions.ts:17`. The S1-2 changelog
  explicitly says it is **not wired**: "no hookable code exists yet."

### What does not exist

- No Admin-scope endpoint returning the **full** `identity_directory`
  (all roles, not just UL/Lead).
- No frontend directory panel.

### Discrepancy from audit

- Audit lists ISSUE-010 expectations including
  `PATCH /api/admin/users/:oid/role` and `PATCH /api/admin/users/:oid`
  deactivate. **This spec explicitly does not build those.**
- Audit calls the existing `GET /api/users` Admin-scope; it is actually
  scoped `Lead + Admin` and filters out Admin rows in the SQL — see
  step 1 below for the new endpoint.

---

## What to Build

Implementation order:

### 1. Backend — new read endpoint

Add `GET /api/admin/users` to `adminRoutes.ts`. Admin-gated by parent
middleware.

```
GET /api/admin/users?include_inactive=false&search=&role=
Authorization: Bearer <token>   (Admin)

Response 200:
{
  "users": [
    {
      "oid": "abc...",
      "display_name": "...",
      "email": "...",
      "last_seen_role": "Specialist" | "Dispatch" | "Admin",
      "last_seen_at": "2026-05-19T08:00:00Z"
    }
  ],
  "total": 17
}
```

Use `withOrgContext()`. Return **all** roles, including `Admin` —
explicitly different from the existing `/api/users` filtered list.

Audit logging: this is a read endpoint; do not write audit per call
(consistent with `/admin/dashboard`).

### 2. Frontend API client

Add `listAllUsers(token, params)` to `frontend/src/api/admin.ts`.

### 3. Frontend component

Add `frontend/src/components/admin/AdminUsersPanel.tsx`:
- Table rendered via `DataTable.tsx`. Columns: display_name, email,
  last_seen_role, last_seen_at (formatted relative + absolute on
  hover).
- Filter by role (select of known roles).
- Search by display_name or email.
- **No edit affordances**. No "Change role" button. No "Deactivate"
  button. Each row is read-only.
- Header copy block (above the table) states clearly:
  > Roles are managed in Azure Entra and shown here as the value most
  > recently reported on sign-in. To change a user's role, update the
  > assignment in the Azure Enterprise Application.

### 4. Routing + nav

`frontend/src/App.tsx`:
- New route `/admin/users` gated `<RequireRole roles={["Admin"]}>`.
- Nav entry "Users" in Admin block (desktop + mobile).

### 5. RBAC / auth

No new RBAC. Admin-only via parent middleware. No write endpoints.

### 6. Audit logging — reserved actions

- `admin.user_role_change` stays defined in
  `auditActions.ts:17` for forward compatibility. If a future
  architectural decision reverses this stance and introduces an
  in-app role override layer, the audit action is already registered.
- **No handler writes this action in this spec.** No
  `admin.user_role_change` row will appear in `audit_log` from any
  code path this spec touches.

### 7. Deactivation

- **Not supported in this spec.** Deactivation happens in Entra:
  remove the user's app role assignment in the Azure Enterprise
  Application. The app's read-only view will then show stale
  `last_seen_role` until the user attempts sign-in (which will fail at
  token validation) — the directory row remains as a historical record.
- Founder may decide later whether the directory should mark rows as
  "stale" if `last_seen_at` is older than N days. **Not in scope.**

---

## Data Model

No schema changes. `identity_directory` already has every field this
endpoint returns.

---

## API Contracts

See step 1.

The existing `/api/users` endpoint at `resourceRoutes.ts:137` is **not
modified** — it continues to filter to UL+Lead for assignment dropdowns
in operational surfaces.

---

## Labor Safety Constraint

This is the second of two surfaces (alongside the audit log viewer)
where worker identity is legitimately displayed. The justification is
governance: an Admin needs to know who has access to the system. The
view is Admin-only by route guard and parent middleware.

What this surface must **not** include:
- Activity counts per user
- Number of runs assigned to / completed by each user
- Any per-user productivity metric
- Sorting / ranking by activity
- A link from a user row to "their visits" or "their runs"

The only sortable/filterable fields are: display_name, email,
last_seen_role, last_seen_at. None of these are productivity metrics.

`last_seen_at` is intentionally coarse — it shows recency of login,
not work activity.

---

## Tests Required

- Backend: endpoint returns all roles (including Admin); RLS scopes to
  caller's org; UL token returns 403.
- Backend: response includes no fields outside the documented shape
  (no work-activity fields).
- Frontend: panel renders read-only; no edit controls present in DOM
  (assert via a test that looks for "Change role" / "Deactivate" and
  expects 0 hits).
- Frontend: filter + search trigger refetch.
- Frontend: header copy explaining Entra-source-of-truth is visible.

---

## Done Criteria

- [ ] `GET /api/admin/users` implemented and Admin-gated
- [ ] Response includes only documented fields
- [ ] `frontend/src/api/admin.ts` exports `listAllUsers`
- [ ] `AdminUsersPanel.tsx` renders read-only table with the Entra
      source-of-truth copy block
- [ ] No edit affordances anywhere in the component
- [ ] Route `/admin/users` + nav entry added
- [ ] Backend tests pass (shape, RLS, authz)
- [ ] Frontend tests pass (read-only assertion)
- [ ] `admin.user_role_change` remains registered in `auditActions.ts`
      but unwritten by any code path
- [ ] Changelog entry written, noting the deliberate reframing from
      the original ISSUE-010 scope

---

## Out of Scope

- `PATCH /api/admin/users/:oid/role` — explicitly not built
- `PATCH /api/admin/users/:oid` deactivation — explicitly not built
- Local role override layer
- Stale-row marking based on `last_seen_at`
- Per-user activity views
- Bulk user actions
- User invitation / provisioning

---

## Dependencies and Sequencing

- **Hard dependency**: role rename complete. The directory displays
  `last_seen_role` values verbatim; shipping before the rename would
  show old strings (`UL`, `Lead`) and confuse the Admin.
- Closes ISSUE-010 — reverses the original role-write framing. ISSUE-010
  should be closed with a pointer to this spec.
