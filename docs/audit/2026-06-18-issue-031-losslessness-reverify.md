# ISSUE-031 Losslessness Re-verification
**Date:** 2026-06-18  
**Branch:** recon/issue-031-losslessness-reverify  
**Scope:** Prove or disprove whether the write-clip hold on `hazards` and `infrastructure_issues` can be released based on losslessness of the live write paths.

---

## Purpose

The write-clip card held on both `hazards` and `infrastructure_issues` pending proof that clipping the adapter would not discard information present in existing rows that has no canonical home. This recon performs a per-row, per-field backward check against the live data and a forward check against the write-path code.

---

## Subjects

### Hazards (rows 7 and 8 — the only non-empty rows at time of audit)

| Column | Adapter value | Canonical home | Status |
|---|---|---|---|
| `id` | bigint PK | Not carried (canonical uses `core.observations.id`) | N/A (adapter-only surrogate) |
| `stop_id` | text | `core.visits.location_id` via stop→location map | ✅ routed |
| `route_run_stop_id` | bigint | `core.visits.assignment_id` (route run stop FK) | ✅ routed |
| `reported_at` | timestamptz | `core.observations.observed_at` | ✅ routed |
| `reported_by` | bigint (internal user FK) | `core.observation_actor_audit.actor_ref` (Entra OID) | ✅ sidecar (different key type — see note) |
| `hazard_type` | text | `core.observations.observation_type` | ✅ routed |
| `severity` | smallint | `core.observations.norm_severity` | ✅ routed (verified below) |
| `notes` | text | `core.observations.payload.notes` | ✅ forward path confirmed |
| `details` | jsonb | Reconstructible from `observation_type` + `core.evidence` component links | ✅ reconstructible |
| `photo_key` | text | `core.evidence` (via `stopPhotosService` write path) | ✅ routed |
| `asset_id` | bigint | `core.observations.asset_id` | ✅ routed |
| `visit_id` | bigint | `core.observations.visit_id` | ✅ routed |
| `org_id` | bigint | `core.observations.org_id` | ✅ routed |

**norm_severity check (backward):** Rows 7 and 8 both have `severity = 3`. Corresponding `core.observations` rows have `norm_severity = 3`. ✅ Match — no information dropped.

**payload check (backward):** Rows 7 and 8 both have `payload = {}` (empty). The forward write path confirms this: `observationService.ts` writes `{ notes, severity }` conditionally — both fields are absent from these test rows, so an empty payload is correct. No information dropped.

**Structural verdict for hazards:** All fields have a canonical home or a deterministic reconstruction path. **Hazards is structurally clip-ready.**

---

### Infrastructure Issues (rows 1 and 2 — the only non-empty rows at time of audit)

| Column | Adapter value | Canonical home | Status |
|---|---|---|---|
| `id` | bigint PK | N/A | N/A |
| `stop_id` | text | `core.visits.location_id` | ✅ routed |
| `route_run_stop_id` | bigint | `core.visits.assignment_id` | ✅ routed |
| `reported_at` | timestamptz | `core.observations.observed_at` | ✅ routed |
| `reported_by` | bigint | `core.observation_actor_audit.actor_ref` | ✅ sidecar |
| `issue_type` | text | `core.observations.observation_type` | ✅ routed |
| `severity` | smallint | `core.observations.norm_severity` | ✅ routed |
| `notes` | text | `core.observations.payload.notes` | ✅ forward path confirmed |
| `component` | text | `core.observations.payload` or `core.evidence` | ✅ forward path exists |
| `cause` | text | `core.observations.payload` | ✅ forward path exists |
| `photo_key` | text | `core.evidence` | ✅ routed |
| `asset_id` | bigint | `core.observations.asset_id` | ✅ routed |
| `visit_id` | bigint | `core.observations.visit_id` | ✅ routed |
| `org_id` | bigint | `core.observations.org_id` | ✅ routed |
| **`needs_facilities`** | **boolean NOT NULL** | **NO canonical home** | **❌ STRUCTURAL GAP** |

**norm_severity check (backward):** Rows 1 and 2 both have `severity = NULL`. Corresponding `core.observations` rows have `norm_severity = NULL`. ✅ Match — no information dropped for these rows.

**payload check (backward):** Rows 1 and 2 both have `payload = {}` (empty). Same reasoning as hazards — these are test rows with no actual field data. No information dropped from these specific rows.

**needs_facilities finding:** `infrastructureIssueService.ts:74` hardcodes `needs_facilities = true` on INSERT. The field is never read from the request body. **No application code reads this field back.** It is a write-only constant — a vertical-neutral escalation signal ("worker flagged it, someone else addresses it"). There is no canonical table column for it. This is a structural gap, not a data gap: the information (escalation flag) cannot be preserved in canonical without a design decision on shape, name, and owning table. That decision connects to the work-order generation thesis and is a Founder-Decision.

**Structural verdict for infra:** One field (`needs_facilities`) has no canonical home and cannot be mapped without a Founder-Decision. **Infrastructure is NOT clip-ready. Hold stands.**

---

## Hold Split Decision

The original write-clip card held both `hazards` and `infrastructure_issues` together. This audit establishes that the two blockers are different in kind:

- **Hazards blocker:** Data-only (stale test-residue rows with empty payloads — rows 7/8 slated for deletion). Structurally, all fields are losslessly carried. Once test residue is purged and live write-path re-tested, hazards can be clipped.
- **Infra blocker:** Structural gap (`needs_facilities` has no canonical home). This cannot be resolved by row-level backfill or purge — it requires a Founder-Decision on canonical shape (ISSUE-034).

**Board action:** Split the clip card hold. Hazards hold: release pending purge + write-path re-test. Infra hold: retain pending ISSUE-034 resolution.

---

## ISSUE-032 and ISSUE-033 Disposition

These cards proposed backfilling `payload` for hazard rows 7/8 and norm_severity for infra rows 1/2 respectively.

**Closed as Won't Do.** Target rows are test residue from prior canonical refactors and UI-workflow testing, slated for deletion before pilot. Backfilling fabricates completeness against disposable data. Losslessness of the live write paths will be proven during the deferred write-path re-test (post-purification), not by retrofitting fixtures.

---

## Sources

- `backend/src/domains/observation/observationService.ts` — forward payload write path (lines 155-157)
- `backend/src/domains/routeRunStop/infrastructureIssueService.ts` — needs_facilities hardcoded write (line 74)
- Live DB row data: hazard rows 7/8 (payload = {}), infra rows 1/2 (payload = {})
- `pg_state.sql` — live schema; no `needs_facilities` column in any `core.*` table
