# T2-A2 — Retire Stop Button

| Field | Value |
|-------|-------|
| ID | T2-A2 |
| Capability | Toggle a stop's `active` flag from the Admin stops panel |
| Surface | Admin |
| Tier | 2 |
| Type | Code (frontend) |
| Depends on | None — API is complete |
| Blocks | "Stop retirement" demo |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

`PATCH /api/admin/stops/:id` already accepts `active` as a patchable field
(`adminRoutes.ts:423`). `AdminStopsPanel.tsx` exposes pool assignment,
notes, and flag toggles (`is_hotspot`, `compactor`, `has_trash`), but not
`active`. As a result, Admins cannot retire a stop from the UI.

This spec adds the toggle.

Users: Admin retiring a stop that is no longer serviced (line decommissioned,
asset removed, duplicate record).

---

## Context

### What exists (verified)

- **API**: `PATCH /api/admin/stops/:id` at
  `backend/src/modules/admin/adminRoutes.ts:423`. Admin-gated at parent
  router middleware (line 18). The handler accepts `active` along with
  the other patchable fields per the audit.
- **Frontend**: `frontend/src/components/admin/AdminStopsPanel.tsx`
  (371 lines). Inline row editing for pool assignment, notes, three flag
  toggles. `grep -n "active\|retire"` returns zero hits — confirmed
  `active` is not surfaced.

### Audit claim verified

- Audit: "`active` is PATCH-able on the backend but not exposed as a
  toggle". Confirmed by direct file inspection.

---

## What to Build

Implementation order:

### 1. Backend

No changes.

### 2. Frontend component

Modify `AdminStopsPanel.tsx`:
- Add a new column "Active" or repurpose the row-level menu to include an
  "Retire" / "Reactivate" action.
- The control toggles `active` between `true` and `false` via the
  existing `PATCH /api/admin/stops/:id` call.
- Retiring requires a confirm dialog ("Retire stop {stop_id}? It will no
  longer appear in route planning. You can reactivate it later.") — use
  the existing `ConfirmDialog` primitive.
- Reactivating does not require confirmation (it is the safe reverse).
- Visual state: retired stops render with a "Retired" badge and faded row
  styling. Add a filter to the existing search / pool filter:
  "Show retired" (default off).

### 3. Backend filter (small)

The existing `GET /api/admin/stops` (line 361) almost certainly defaults
to returning only `active = true`. Verify the handler. If it does, add a
query param `include_retired=true` to optionally include retired stops in
the list. If it already returns all stops, no change.

This is the one place the spec may touch backend code; confirm at dispatch
and split the change into a separate small commit if so.

### 4. Routing / nav

No changes.

### 5. RBAC / auth

No changes. Admin-only via parent middleware.

### 6. Audit logging

The PATCH endpoint already writes `admin.stop_edit` per S1-2. The
`detail` payload should include `{ field: "active", from: ..., to: ... }`
— confirm the existing handler does this. If not, the `admin.stop_edit`
write should be enriched to log the change set; that is a small backend
diff and should be flagged in the changelog.

---

## Data Model

No schema changes. `transit_stops.active` (and the equivalent column on
the canonical `core.asset_locations` view if relevant) already exists.

---

## API Contracts

Existing endpoint consumed:

```
PATCH /api/admin/stops/:id
Authorization: Bearer <token>   (Admin)
Body: { "active": false }

Response 200: { "stop": { ... } }
```

Possibly modified:

```
GET /api/admin/stops?include_retired=true
```

(See step 3.)

---

## Labor Safety Constraint

Retiring a stop has no worker-identity dimension. The action acts on
`transit_stops`, which has no worker columns.

---

## Tests Required

- Component test: clicking Retire opens confirm; confirming calls PATCH
  with `active: false`; row re-renders with retired badge.
- Component test: clicking Reactivate calls PATCH with `active: true`,
  no confirm dialog.
- "Show retired" filter toggle includes/excludes retired rows.
- If backend filter param is added: integration test for
  `?include_retired=true` returning retired rows; default behavior
  unchanged.

---

## Done Criteria

- [ ] Retire / Reactivate control rendered in `AdminStopsPanel` row UI
- [ ] Retire requires confirm; Reactivate does not
- [ ] Retired rows visually distinct + filtered out by default
- [ ] "Show retired" toggle exposes them
- [ ] `include_retired` param on `GET /api/admin/stops` (if needed) +
      backend test
- [ ] Audit `admin.stop_edit` detail includes the `active` field change
- [ ] Component tests pass
- [ ] Manual smoke test: retire a stop, see it disappear from the default
      list, reactivate, see it reappear
- [ ] Changelog entry written

---

## Out of Scope

- Bulk-retire across multiple stops (the existing
  `POST /api/admin/stops/bulk` at line 484 supports it; UI is not in
  scope here)
- Cascade behavior on active route runs that include the retired stop
  (separate policy question; existing PATCH does not cascade)
- Create-new-stop from UI (audit's other A-2 gap; deferred — requires
  design around `transit_stops` vs. `public.assets` relationship)

---

## Dependencies and Sequencing

- Independent. Ships any time.
- Smallest Tier 2 item by code size.
