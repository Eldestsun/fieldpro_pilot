# 2026-05-30 — Canonical state layer §9 verification pass (items 3, 4, 5, 6)

Verification/analysis pass against the live dev DB. **No production migration, no
push, no merge, no schema change.** Doc + changelog only. Items 1 and 2 were
already resolved by prior sprints; this pass addresses the four remaining open
items (3, 4, 5, 6) and lands them at their honest status rather than forcing
closures.

## What changed
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`:
  - Status banner rewritten: TARGET DESIGN → **PARTIALLY VERIFIED**. The grammar
    and registry model are verified at the logic level; two structural guarantees
    (normalized columns, no-grant sidecar) are documented as still target-state.
  - §3.2: added an un-softened **"CURRENT STATE vs. TARGET STATE"** note recording
    that worker anonymity (invariant #1) is currently enforced by query discipline
    only — the actor-audit sidecar does not exist and identity is plaintext on the
    canonical tables.
  - §9 item 3: ANSWERED — validation located and characterized; §6 target gap
    (registry-driven validation + quarantine queue) logged as a finding.
  - §9 items 4 & 5: DEFERRED — normalized columns absent; backfill + complexity
    recompute have nowhere to write; migration shape (in-place vs. shadow) is its
    own dispatch.
  - §9 item 6: OPEN FINDING — sidecar absent; no-grant boundary cannot be tested
    as designed.
  - Added **§9 live-schema reconciliation notes** table (design DDL vs. live
    schema deviations found during the pass).

## §9 item outcomes

### Phase 0 — ground truth (live dev DB)
- `core.observations`: **3 rows** — one completed service visit (id 89):
  `picked_up_litter` (payload `{}`), `emptied_trash` (`{}`),
  `trash_volume` (`{level:2}`). Authentic post-state-layer-fix real-pipeline
  rows (table was wiped during dev). → CASE A (near-empty, real rows).
- `core.visits`: 1; `core.evidence`: 2; `core.observation_type_registry`: 30
  (28 active); `core.v_assets`: 14,916 (view, not a base table).
- **Normalized columns do NOT exist** on `core.observations` (no `obs_kind`/
  `norm_status`/`norm_severity`/`intervention`/`type_id`).
- **Actor-audit sidecar does NOT exist**; identity is plaintext NOT NULL on
  `core.visits.actor_oid` and `core.observations.created_by_oid`.

### Item 3 (offline write validation) — ANSWERED, gap logged
- Reconcile path: offline queue `COMPLETE_STOP` →
  `POST /api/route-run-stops/:id/complete` (`routeRunStopRoutes.ts:424`).
- Authoritative server-side validation lives only in the handler
  (`routeRunStopRoutes.ts:451-488`): after-photo, cleaning-or-spot-check, and
  `trashVolume` integer ∈ [0,4]. These reject with HTTP 400.
- The canonical write path (`observationService.ts`, `cleanLogService.ts`) never
  reads the registry: no payload-schema / `value_type` / `valid_values` check, no
  normalization. §6 steps 3–4 unimplemented. `core.observations` has no FK/CHECK
  to the registry — any string would insert.
- Observation payloads are **server-synthesized**, not client-authored, which
  masks the missing registry validation today.
- Behavior split within the offline-sync surface: range-checked `trashVolume` is
  **rejected**; unrecognized hazard/infra enum keys are **silently coerced** to
  `other_*_present` (`mapSafetyHazard`/`mapInfraIssue`) — not rejected, not
  quarantined. No quarantine/repair queue exists.
- Conclusion: verification question closed; §6 target (registry-driven validation
  + quarantine) is a documented gap for a future dispatch. Not urgent only because
  payloads are server-synthesized; required before any client-authored adapter
  write path.

### Items 4 & 5 (backfill + complexity_score) — DEFERRED
- Normalized columns absent → backfill has nowhere to write. Item 5
  (`complexity_score`, still `NULL` at `cleanLogService.ts:186`) is downstream of
  item 4. The migration shape (in-place vs. shadow column) is its own dispatch and
  was deliberately not authored here.

### Item 6 (no-grant intelligence role) — OPEN FINDING
- Sidecar absent → the no-grant boundary cannot be tested as designed; there is no
  separate surface to withhold a grant on. Invariant #1 is enforced by query
  discipline only. Closing it requires a sidecar-extraction migration
  (recommended next build target), then standing up `intelligence_reader`.

## Residual gap (honest end state)
§9 is **partially closed**: items 1, 2 resolved; item 3 answered (with a logged
validation gap); items 4, 5, 6 remain as documented findings with recommended
migration shapes. The DESIGN is verified at the logic level; the structural
guarantees (normalized columns, no-grant sidecar) and deployment-scale validation
(multi-worker distribution / edge-case mess a fleet produces) remain unproven and
are routed to dedicated future dispatches.

## Why
- Close the §9 verification pass honestly: surface findings rather than force
  closures (founder directive).
- Two blockers (normalized columns absent, sidecar absent) are net-new schema work
  deserving dedicated dispatches, not silent inclusion in a verification pass.

## Files touched
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`
- `docs/changelog/2026-05-30-s9-verification-pass.md` (this file)
