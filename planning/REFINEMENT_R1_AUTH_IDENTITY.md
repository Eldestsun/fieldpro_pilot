# R1 — Auth Identity Cleanup

> **Goal**: Replace the `user_id = 123` and `PILOT_DEV_UL_USER_ID = 123` hardcoded stubs with explicit named constants and, where OID is already available, wire it correctly — acknowledging that `user_id` is a legacy transit field and canonical identity is already correct.
>
> **Status**: 🔴 Not started
> **Depends on**: Nothing (unblocked)
> **Blocks**: R7 (historical backfill should reflect correct identity on new writes first)

---

## What the Codebase Actually Looks Like

Before executing this item, the actual identity picture matters:

| Field | Table | Type | Status |
|-------|-------|------|--------|
| `assigned_user_oid` | `route_runs` | `text` | ✅ Canonical OID field — already indexed, already accepted from request body |
| `created_by_oid` | `route_runs` | `text` | ✅ Wired in `createRouteRun()` |
| `captured_by_oid` | `core.visits` | `text` | ✅ Wired correctly — canonical identity is correct |
| `user_id` | `route_runs`, `clean_logs`, `route_run_stops` | `bigint` | ⚠️ Legacy transit field, explicitly commented `[LEGACY]` in `routeRunService.ts`. No FK constraint. No `users` table. `identity_directory` has no integer `id` column. |

**The canonical identity layer is already correct.** `core.visits.captured_by_oid` carries the real OID. `route_runs.assigned_user_oid` carries the assigned worker's OID. These are the fields that matter for canonical state, intelligence, and the assignment layer.

The `user_id = 123` stub is in the **transit adapter layer only** — `clean_logs` and the legacy `route_runs.user_id` column. It is a placeholder in a field that has no referential integrity, no FK, and no downstream canonical consequence.

The right fix is not to build an OID-to-integer resolver (there is no integer identity table to resolve to). The right fix is to:
1. Make the stub explicit — a named constant with a comment, not a magic number
2. Ensure `route_runs.assigned_user_oid` is populated from the actual UL's OID at route creation (verify, not assume)
3. Note clearly in the codebase where `user_id` is legacy and when it will be removed

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/modules/work/routeRunStopRoutes.ts` | Replace `const user_id = 123` with `const LEGACY_TRANSIT_USER_ID = 0` + explanatory comment |
| `backend/src/modules/routes/routeRunRoutes.ts` | Replace `const PILOT_DEV_UL_USER_ID = 123` with `const LEGACY_TRANSIT_USER_ID = 0` + explanatory comment; verify `assigned_user_oid` is populated from `req.body.ul_id` |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| `backend/src/authz.ts` | Auth is frozen |
| `backend/src/domains/visit/visitService.ts` | `captured_by_oid` already correct — do not touch |
| `backend/src/domains/routeRun/routeRunService.ts` | `assigned_user_oid` and `created_by_oid` already wired — do not touch |
| `identity_directory` table | No integer `id` column — do not add one in this item |
| All frontend files | Frontend identity is correct via MSAL |

---

## Change 1 — Replace Magic Number in Stop Completion Handler

### File
`backend/src/modules/work/routeRunStopRoutes.ts`

### Before (complete handler, ~line 76–78)
```typescript
// DEV ONLY: Assume user_id = 123 for now
const user_id = 123;
```
Same pattern appears in the skip handler (~line 218–220).

### After
```typescript
// LEGACY: user_id is a transit-adapter field with no FK and no canonical significance.
// core.visits.captured_by_oid carries the real identity (already wired via auth context).
// This field will be removed when clean_logs is deprecated post-Tier-2.
const LEGACY_TRANSIT_USER_ID = 0;
const user_id = LEGACY_TRANSIT_USER_ID;
```

Apply identically to both the complete handler and the skip handler.

### Why 0 not 123
`0` is unambiguously a placeholder. `123` looks like a real user ID. Any query filtering by `user_id = 123` would return results that look legitimate. `0` will never match a real identity and makes the placeholder intent obvious.

### Done criteria
- No `user_id = 123` literal remains in `routeRunStopRoutes.ts`
- `clean_logs.user_id` is `0` for new stop completions
- Comment explains legacy status and removal condition

---

## Change 2 — Replace Magic Number in Route Creation + Verify OID Wiring

### File
`backend/src/modules/routes/routeRunRoutes.ts`

### Before
```typescript
const PILOT_DEV_UL_USER_ID = 123
```

### After
```typescript
// LEGACY: integer user_id on route_runs has no FK and no canonical significance.
// The canonical UL identity is assigned_user_oid (already wired from req.body.ul_id).
// This constant will be removed when the legacy user_id column is deprecated.
const LEGACY_TRANSIT_USER_ID = 0
```

Replace all uses of `PILOT_DEV_UL_USER_ID` with `LEGACY_TRANSIT_USER_ID`.

**Additionally — verify `assigned_user_oid` is correctly populated:**

In the route creation handler, confirm that `assigned_user_oid` is being set from `req.body.ul_id` (the UL's OID, sent from the frontend). The service already accepts this parameter. If the handler is not sending it, add it:

```typescript
const assignedUserOid = req.body.ul_id ?? null  // UL's Azure Entra OID
// pass to createRouteRun as assigned_user_oid: assignedUserOid
```

If `ul_id` is already wired in the handler (check line ~321), no change needed — just document that it's correct.

### Done criteria
- `PILOT_DEV_UL_USER_ID` constant deleted
- No `= 123` literal remains in `routeRunRoutes.ts`
- `route_runs.assigned_user_oid` is non-null for new routes created by an authenticated Lead
- Comment explains legacy status and removal condition

---

## What R1 Explicitly Does Not Do

- Does not add an integer `id` column to `identity_directory` — that table's PK is `oid` (text) by design
- Does not build an OID-to-integer resolver — there is no users table and no integer identity to resolve to
- Does not remove `user_id` columns from any table — that is a post-Tier-2 cleanup when `clean_logs` is deprecated
- Does not touch `core.visits.captured_by_oid` — already correct
- Does not touch `route_runs.assigned_user_oid` wiring in `routeRunService.ts` — already correct

---

## R1 Overall Done Definition

R1 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] No `user_id = 123` or `PILOT_DEV_UL_USER_ID = 123` literals remain in any backend file
- [ ] Both stubs replaced with `LEGACY_TRANSIT_USER_ID = 0` + explanatory comment
- [ ] `route_runs.assigned_user_oid` is non-null for routes created by an authenticated Lead
- [ ] `core.visits.captured_by_oid` is unaffected (still correct)
- [ ] Stop completion and route creation work end-to-end
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r1-auth-identity.md`

---

## Agent Launch Block

```
Refinement task. Read CLAUDE.md, then planning/REFINEMENT_R1_AUTH_IDENTITY.md fully.
Note: identity_directory has no integer id column. Do NOT build an OID-to-integer resolver.

Change 1: In backend/src/modules/work/routeRunStopRoutes.ts, replace both
  user_id = 123 stubs (complete handler + skip handler) with:
  const LEGACY_TRANSIT_USER_ID = 0
  const user_id = LEGACY_TRANSIT_USER_ID
  Add the explanatory comment from the file.

Change 2: In backend/src/modules/routes/routeRunRoutes.ts, replace
  PILOT_DEV_UL_USER_ID = 123 with LEGACY_TRANSIT_USER_ID = 0.
  Then verify that assigned_user_oid is being passed to createRouteRun
  from req.body.ul_id. If it is already wired, document it. If not, add it.

Do not touch visitService.ts, routeRunService.ts, authz.ts, or any other file.
```
