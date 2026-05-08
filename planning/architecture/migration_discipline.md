# Migration Discipline

This document defines how the codebase moves from its current transitional state toward the target architecture.

Read alongside `target_architecture.md` (where we are going) and `current_state.md` (where we are now).

---

## The Core Principle: Additive Migration

**Do not replace what works. Extend the canonical layer until it fully covers what the transit layer currently provides. Then deprecate the transit layer.**

Breaking stable Live behaviors to achieve architectural purity is not acceptable. Migration must be additive — new canonical writes happen alongside existing transit writes until the canonical layer is complete and verified. Only then are transit-specific writes removed.

---

## Migration Sequence

Work must follow this ordering. Do not skip levels.

### Level 1 — Canonical Completeness (current priority)
Close the gaps identified in `current_state.md` before adding new features:

1. Write `assignment_id` on `core.visits` (§5.1)
2. Write `outcome` and `reason_code` on `core.visits` (§5.2)
3. Write `washed_can` as an observation to `core.observations` (§5.3)
4. Write to `core.evidence` alongside `stop_photos` (§5.6)
5. Move visit creation to the correct lifecycle event (stop start, not photo upload) (§5.9)
6. Make observation emission transactionally safe (§5.7)

### Level 2 — Transit Adapter Containment
Once Level 1 is complete:
- Audit all `cleanLogService.ts` write paths — confirm each has a canonical equivalent
- Ensure `route_run_stops` is not queried as a source of truth anywhere in the canonical read path
- Ensure `stop_photos` is not the only evidence anchor — `core.evidence` should be primary

### Level 3 — New Verticals
Only after the transit vertical is cleanly contained as an adapter:
- New verticals (parks, facilities, infrastructure inspection, etc.) are built directly against the canonical model
- No new `public.*` schema tables for canonical data
- New vertical workflows are transit-slice-equivalent adapters on top of Visit → Observation → Evidence

### Level 4 — Intelligence Layer
After canonical state is trustworthy:
- Intelligence derivations read from `core.observations` and `core.visits` only
- Risk maps, trend signals, and operational intelligence are derived — never inferred from workflow artifacts
- Intelligence is explainable, reviewable, and historically persistent

---

## Rules for Every Change

### Rule 1: New canonical write alongside existing transit write
When fixing a gap (e.g., writing to `core.evidence`), write to both the new canonical location and the existing transit table until the transit table is explicitly deprecated. Never remove a working write path without a verified replacement.

### Rule 2: Verify idempotency before merging
Every new mutation endpoint or updated write path must be safe to call twice with the same payload. Use `ON CONFLICT DO NOTHING` + a deterministic client-side idempotency key (UUIDv5 or equivalent).

### Rule 3: Don't touch stable auth
The MSAL / Azure Entra auth path is stable and tested. Do not modify `authz.ts`, `AuthContext.tsx`, or `msalConfig.ts` unless the change is isolated, targeted, and explicitly an auth fix.

### Rule 4: Don't change the offline contract
The offline queue replay order (`UPLOAD_STOP_PHOTOS` → `START_STOP` → `SKIP_STOP_WITH_HAZARD` → `COMPLETE_STOP`) is depended on by the frontend. Do not add new action types to the replay sequence without updating `OfflineSyncManager.tsx` with a corresponding executor.

### Rule 5: Validate against the canonical model before shipping
Before any migration step is considered complete, verify:
- The relevant `core.*` table has the expected rows
- `core.visits.ended_at` is non-null for completed visits
- `core.observations` has the expected rows for the stop type
- `core.visits.assignment_id` is populated (once Level 1 §5.1 is fixed)

### Rule 6: No dashboard-first development
Features must be motivated by operational truth capture, not by reporting needs. Build the canonical state first. Derive the display from state. Never build a dashboard and then instrument it backward into the data model.

---

## What "Additive" Means in Practice

| Scenario | Additive approach | Non-additive (avoid) |
|----------|-------------------|---------------------|
| Adding evidence to canonical layer | Write to `core.evidence` AND keep `stop_photos` write | Remove `stop_photos` write before `core.evidence` is verified |
| Adding `outcome` to visits | Write `outcome` in the existing `completeStop` call | Create a new separate "outcome service" that bypasses the existing path |
| Adding a new observation type | Add a branch in `observationService.ts` | Create a parallel observation write path in a new service |
| Fixing visit lifecycle timing | Move visit open to stop-start event; keep idempotency so duplicate calls are safe | Delete `ensureVisitForRouteRunStop` from photo upload without verifying stop-start covers all paths |

---

## What Breaks the Migration

These actions will cause regressions and must not happen:

- Removing `clean_logs` writes before canonical observations are verified to be complete
- Removing `stop_photos` writes before `core.evidence` is verified
- Changing `ensureVisitForRouteRunStop()` behavior without auditing all callers
- Changing the offline queue action schema without updating `OfflineSyncManager.tsx`
- Adding auth changes without testing the MSAL popup + silent token flow end to end
- Expanding `route_run_stops` with new canonical data fields
- Making intelligence derivations depend on `clean_logs` instead of `core.observations`
