# T1-A6 — Export-and-Delete UI

| Field | Value |
|-------|-------|
| ID | T1-A6 |
| Capability | Admin export-and-delete (data subject rights flow) UI |
| Surface | Admin |
| Tier | 1 |
| Type | Code (frontend) |
| Depends on | S1-4 (done) |
| Blocks | TPRA "data rights demo" claim |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

S2 policy documents reference export-and-delete as a functioning data subject
rights control. The backend flow is complete (`exportDeleteRoutes.ts` — three
endpoints: request, download, execute). No frontend exists. Without a UI, a
TPRA reviewer cannot see the control demonstrated.

This spec adds the multi-step Admin UI that drives the existing endpoints,
with explicit irreversibility warnings around the execute step.

Users: Admin acting on a data subject deletion request, or demonstrating the
flow during compliance review.

---

## Context

### What exists (verified)

- **Backend module**: `backend/src/modules/admin/exportDeleteRoutes.ts`.
  Router gated `requireAuth + requireAdmin` (line 19).
  - `POST /...` at line 61 — request: builds gzipped export bundle, issues
    confirmation token (7-day TTL per S1-4 changelog), returns token + URL.
  - `GET /...` at line 241 — download the bundle by token.
  - `POST /...` at line 294 — execute deletion with confirm token.
  (Exact paths per the router file's path strings; verify on dispatch.)
- **Audit actions registered** (`backend/src/middleware/auditActions.ts:13–15`):
  `export.data_export`, `export.delete_confirm`, `export.delete_execute`.
  All wired in S1-4.
- **Admin nav**: same insertion points as T1-A5.

### What does not exist

- No frontend route, no component, no API client for these endpoints.

### Audit claim verified vs. corrected

- Audit says "four-step flow" — actual implementation is three endpoints
  with the confirmation token returned in the request response (combining
  what the original S1-4 spec called step 1 and step 3). Verified against
  S1-4 changelog note: "Confirmation token issued in the request response."
  This spec follows the actual three-endpoint shape.

---

## What to Build

Implementation order:

### 1. Backend

No changes. Three endpoints already exist, audit-logged, Admin-gated.

### 2. Frontend API client

Add `frontend/src/api/exportDelete.ts`:
- `requestExport(token)` → `POST` request endpoint, returns
  `{ confirmation_token, export_path, expires_at, instructions }`.
  (`export_path` is the download URL path — there is no separate `token_id`
  field; the token id is embedded in `export_path`.)
- `downloadExport(token, exportPath)` → triggers browser download of the
  gzipped bundle from `export_path`.
- `executeDelete(token, confirmToken)` → `POST` execute endpoint (body carries
  only `confirmation_token`), returns `{ deleted: true, deletion_summary, executed_at }`
  — `deletion_summary` is a per-table `{ <table>: <rowCount> }` map.

### 3. Frontend component

Add `frontend/src/components/admin/AdminExportDeletePanel.tsx`:
- Stepper UI with three explicit phases:
  1. **Request export**: button labeled "Request export bundle". On click,
     calls `requestExport`, displays `expires_at`, and a "Download bundle"
     button (links to `export_path`).
  2. **Review**: shows the `confirmation_token` in a copy-to-clipboard field
     and a static block of text describing what executing deletion will do
     ("This will permanently delete all canonical data for this organization —
     locations, assignments, visits, observations, evidence, stop history, EAM
     bridge logs — **and the audit log itself**. The `export.delete_execute`
     event is recorded in the transaction and then purged with the rest; its
     counts are returned in the deletion summary. The only surviving copy of
     this organization's data, including its audit trail, is the export bundle
     you downloaded. This action is irreversible.").
  3. **Execute deletion**: requires the admin to (a) paste the confirmation
     token back into an input field (matching the token they just received —
     prevents accidental click-through), (b) check a confirmation checkbox
     ("I understand this is irreversible"), and (c) click a red "Execute
     deletion" button. Only when all three conditions hold is the button
     enabled.
- Result panel: on successful execute, show the per-table `deletion_summary`
  (including the `audit_log` row count) and an explicit "Deletion complete.
  This page is now showing residual UI state; sign out to re-verify." message.
- Error states: 401/403 → "Not authorized" (should not occur given route
  guard, but defensive); 410 / token expired → "Confirmation token expired,
  request a new export bundle."

### 4. Routing + nav

`frontend/src/App.tsx`:
- New route `/admin/export-delete` gated `<RequireRole roles={["Admin"]}>`.
- New nav entry "Export & Delete" in the `isAdmin` block (desktop + mobile).

### 5. RBAC / auth

No changes. Backend router already enforces Admin-only at
`exportDeleteRoutes.ts:19`.

### 6. Audit logging

No new audit actions. All three actions
(`export.data_export`, `export.delete_confirm`, `export.delete_execute`) are
written by the backend handlers in the S1-4 implementation.

---

## Data Model

No schema changes.

---

## API Contracts

Three existing endpoints consumed unchanged. Confirm exact paths and bodies
against `exportDeleteRoutes.ts` at dispatch time — the audit's path names
(`/api/admin/export-and-delete/...`) match the changelog. Treat
`exportDeleteRoutes.ts` as authoritative.

---

## Labor Safety Constraint

Export-and-delete operates on canonical org data — not on worker identity
beyond what is already present in the `core.*` tables. The export bundle
contains visit records, observations, evidence, etc. As of S1-13,
`captured_by_oid` is encrypted; the export must use the existing service
path so encryption is preserved end-to-end. **This UI does not introduce
any new exposure of worker identity** — it surfaces only `expires_at`, the
per-table `deletion_summary`, and the `confirmation_token`.

Audit log **is** deleted by execute. STEP d of the execute transaction
(`exportDeleteRoutes.ts`) runs a gated `DELETE FROM audit_log WHERE org_id = $1`
— the append-only `audit_log_delete` RLS policy is unlocked for this one
sanctioned purge path via `SET LOCAL app.export_delete_active = 'true'` +
`app.export_delete_org_id`. The `export.delete_execute` row written earlier in
the same transaction is included in that purge; its count appears in
`deletion_summary.audit_log`. The security trail for this org survives **only**
inside the downloaded export bundle (which contains the full `audit_log` table).
The UI must therefore state that the audit log is deleted — never imply it is
retained in the database.

> **Correction (2026-07-06 truthing):** earlier revisions of this spec asserted
> "Audit log is **not** deleted by execute" and documented a
> `{ token_id, download_url, confirm_token }` / `rows_affected` response shape.
> Both were wrong against the shipped `exportDeleteRoutes.ts` — the code has
> purged the audit log inside execute since S1-4, and the live response fields
> are `{ confirmation_token, export_path, expires_at, instructions }` (request)
> and `{ deleted, deletion_summary, executed_at }` (execute). This section and
> the API-client / stepper copy above were corrected to match the code, which is
> authoritative.

---

## Tests Required

- Component test: stepper progresses 1 → 2 → 3 only when each step's
  condition is met.
- Confirmation token paste-match test: execute button disabled until the
  pasted token equals the issued token AND the irreversibility checkbox
  is checked.
- Mock the API client; verify `executeDelete` is not called accidentally
  on stepper transitions.
- Existing backend integration test (S1-4: 14 tests including replay,
  expiry, org isolation) covers the API surface — no new backend tests.

---

## Done Criteria

- [ ] `frontend/src/api/exportDelete.ts` with three functions
- [ ] `AdminExportDeletePanel.tsx` with three-phase stepper
- [ ] Execute button disabled until (paste-match) AND (checkbox checked)
- [ ] Red destructive styling on the execute button matches the design
      system's danger token
- [ ] Route `/admin/export-delete` added with `RequireRole={["Admin"]}`
- [ ] Nav entry "Export & Delete" added to Admin nav (desktop + mobile)
- [ ] Component tests pass (stepper progression, paste-match guard,
      checkbox guard)
- [ ] Manual smoke test against a dev backend confirms a full
      request → download → execute round-trip
- [ ] Changelog entry written

---

## Out of Scope

- Per-table preview of what will be deleted (count by table). Useful but
  not required; tracked as a possible follow-up.
- Scheduled / delayed deletion (e.g. "execute in 24 hours")
- Multiple parallel export sessions for the same org
- Export bundle format selection (the backend currently returns gzipped
  JSON; CSV is not in scope for this UI)

---

## Dependencies and Sequencing

- Independent of all other Tier 1 specs. Ships in parallel with T1-A5
  and T1-D4, **and in parallel with the role rename workstream**.
- TPRA-blocking: removes the "no UI" gap that S2 policy docs implicitly
  paper over.
