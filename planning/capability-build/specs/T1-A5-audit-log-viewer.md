# T1-A5 — Audit Log Viewer UI

| Field | Value |
|-------|-------|
| ID | T1-A5 |
| Capability | Admin audit log viewer (read-only) |
| Surface | Admin |
| Tier | 1 |
| Type | Code (frontend) |
| Depends on | S1-1, S1-3 (done) |
| Blocks | TPRA package finalization for the "audit log functional" claim |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

`docs/changelog/security/` and `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md`
both reference the audit log as a functioning admin control. The backend is
complete (`GET /api/admin/audit-log` returns JSON or CSV, filtered by date and
action). No frontend surface exists to view it. The TPRA package overstates
the demo-ready state until an admin can actually open the page and see entries.

This spec adds the missing Admin page that fetches and displays the existing
endpoint. No new backend work.

Users: Admins reviewing security activity, compliance reviewers verifying the
control exists during TPRA demos.

---

## Context

### What exists (verified)

- **Backend endpoint**: `GET /api/admin/audit-log` at
  `backend/src/modules/admin/adminRoutes.ts:818`. Authorized via the
  router-level guard at `adminRoutes.ts:18` (`adminRoutes.use("/admin",
  requireAuth, requireAdmin)`). Accepts `from`, `to`, `action`, `format`
  (`json` | `csv`). Max 1000 rows, max 365-day window. Writes
  `admin.audit_log_read` audit entry on every successful query
  (`adminRoutes.ts:894`).
- **Generic table component**: `frontend/src/components/ui/DataTable.tsx`
  (sortable, paginated, generic columns).
- **Admin nav**: `frontend/src/App.tsx:128–135` (desktop) and
  `frontend/src/App.tsx:218–224` (mobile).

### What does not exist

- No `AdminAuditLogPanel.tsx` (or equivalent).
- No route registered under `/admin/audit-log`.
- No frontend API client function for `GET /api/admin/audit-log`.

### Audit claim verified vs. corrected

- Audit says "`adminRoutes.ts:817`" for the audit-log endpoint — actual is line
  818. Audit says nearest piece is `DataTable.tsx` — actual path is
  `frontend/src/components/ui/DataTable.tsx`. Both confirmed present.

---

## What to Build

Implementation order:

### 1. Backend

No changes. The endpoint is complete and audit-logged.

### 2. Frontend API client

Add `frontend/src/api/auditLog.ts`:
- `listAuditLog(token, params)` → `GET /api/admin/audit-log` with query params
  for `from`, `to`, `action`.
- `downloadAuditLogCsv(token, params)` → `GET /api/admin/audit-log?format=csv`,
  returns Blob, triggers a browser download.

### 3. Frontend component

Add `frontend/src/components/admin/AdminAuditLogPanel.tsx`:
- Filters: date range (default last 30 days), action filter (free text or
  select populated from `AUDIT_KNOWN_ACTIONS`).
- Table rendered via existing `DataTable.tsx` with columns: occurred_at,
  action, resource_type, resource_id, actor_oid, ip_address.
- "Export CSV" button that calls `downloadAuditLogCsv` with the current filters.
- Empty state, loading state, error state matching `AdminPoolsPanel.tsx`
  conventions.

### 4. Routing + nav

`frontend/src/App.tsx`:
- New route `/admin/audit-log` gated `<RequireRole roles={["Admin"]}>`.
- New nav entry in the `isAdmin` desktop block (~line 128) and mobile block
  (~line 218), labeled "Audit Log".

### 5. RBAC / auth

No new RBAC. Existing `adminRoutes.use("/admin", requireAuth, requireAdmin)`
at `adminRoutes.ts:18` enforces Admin-only access on the backend.

### 6. Audit logging

No new audit actions. The backend already writes `admin.audit_log_read` on
every successful query (`adminRoutes.ts:894`). The CSV export path hits the
same endpoint and produces the same audit row — confirm on test.

---

## Data Model

No schema changes.

---

## API Contracts

No new endpoints. Consumer of existing endpoint:

```
GET /api/admin/audit-log?from=<ISO>&to=<ISO>&action=<string>&format=json
Authorization: Bearer <token>   (Admin role required)

Response 200:
{
  "entries": [
    {
      "id": 123,
      "actor_oid": "abc...",
      "action": "admin.config_change",
      "resource_type": "pool",
      "resource_id": "POOL-001",
      "detail": { ... },
      "ip_address": "10.0.0.1",
      "occurred_at": "2026-05-18T12:00:00Z"
    }
  ],
  "total": 42,
  "from": "...",
  "to": "..."
}
```

CSV variant: `format=csv` → `Content-Type: text/csv`, same fields as columns.

---

## Labor Safety Constraint

The audit log viewer is the **only** capability in this track that displays
`actor_oid` (an Azure Entra OID). It is the legitimate, policy-sanctioned
exception per `planning/security/ADMIN_ACCESS_POLICY.md`.

Mitigations enforced by this spec:
- Route is `<RequireRole roles={["Admin"]}>` only. No Dispatch route variant
  is added.
- Endpoint is already Admin-only at the router (`adminRoutes.ts:18`).
- `actor_oid` displays as the raw OID — no name resolution, no role lookup,
  no joining against `identity_directory` in this view. If a name is wanted
  alongside an OID, that requires a separate decision and a separate spec.
- The page itself is audit-logged on every load via the existing endpoint
  audit write — Admins reviewing the log are themselves logged.

---

## Tests Required

- Component renders with filter defaults; empty state correct.
- Filter change triggers refetch with new query params.
- CSV download triggers blob download with `text/csv` content type.
- Existing backend integration test (`S1-3 audit-log-query-endpoint`) confirms
  Admin-only gate — no new backend test needed.
- New: Playwright/RTL test that asserts non-Admin role (Dispatch token via dev
  bypass) cannot navigate to `/admin/audit-log` — bounced by `RequireRole`.

---

## Done Criteria

- [ ] `frontend/src/api/auditLog.ts` exports `listAuditLog` and
      `downloadAuditLogCsv`
- [ ] `AdminAuditLogPanel.tsx` renders date filters, action filter,
      `DataTable`, and CSV button
- [ ] Route `/admin/audit-log` added with `RequireRole={["Admin"]}`
- [ ] Nav entry "Audit Log" added to desktop + mobile Admin nav
- [ ] Component test passes (filter change, CSV download)
- [ ] Non-Admin navigation guard test passes
- [ ] Manual smoke test: load page, change filters, export CSV, confirm
      `admin.audit_log_read` row appears in the log itself
- [ ] Changelog entry written to `docs/changelog/refactor/` or a new
      `docs/changelog/capability-build/` subdirectory (decide at dispatch)

---

## Out of Scope

- Joining `audit_log` to `identity_directory` for name display
- Per-action detail expansion UI (the `detail` JSONB column) — render as raw
  JSON in a row drawer if needed; no schema-aware formatting
- Tail/live mode — polling or streaming the audit log
- Cross-org admin views (the endpoint is org-scoped via RLS; no change)

---

## Dependencies and Sequencing

- No upstream dependency. **May ship in parallel with the role rename
  workstream** — no role-name strings in user-facing copy.
- Recommended first because it is small, TPRA-visible, and removes the
  only "documented control without UI" flagged in S2 policy docs.
- Unblocks: TPRA package finalization claim for "audit log functional".
