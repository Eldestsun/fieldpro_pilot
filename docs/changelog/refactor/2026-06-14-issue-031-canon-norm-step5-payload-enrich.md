# 2026-06-14 — CANON-NORM Step 5: thread hazard/infra detail into observation payload

ISSUE-031 / CANON-NORM — Close the write-path gap where safety hazard `notes` and
infrastructure `cause` / `component` / `notes` reached only the adapter tables
(`hazards`, `infrastructure_issues`) and never `core.observations.payload`. That
made a future adapter clip lossy: the canonical observation record held less than
the adapter it is meant to supersede. This change threads those fields into the
observation payload additively. The adapter writes are untouched.

## What changed
- `StopUiPayload` gains two optional fields:
  - `hazard_notes?: string` — free-text notes for a safety hazard.
  - `infraIssueDetails?: Array<{ issue_type; cause?; component?; notes? }>` — full
    per-issue infra detail (`notes` typed `string | null` to match `InfraIssueInput`).
- Safety hazard observations now emit `payload.notes` when present. `severity`
  is unchanged — it already flows into the `severity` column via `hazard_severity`;
  it is NOT duplicated into payload.
- Infrastructure observations now prefer `infraIssueDetails`: one observation per
  detailed issue, emitting `payload.cause` / `payload.component` / `payload.notes`
  when present. When `infraIssueDetails` is absent the prior flat-list behavior
  (one observation per `infrastructureIssues` type name, empty payload) is preserved.
- `cleanLogService.completeStop` threads `hazard_notes: data.safety?.notes` and
  `infraIssueDetails: infraIssues` into the `uiPayload` it passes to
  `emitObservationsForStop`. Its `safety` param type gains `notes?: string`.
- The `skip-with-hazard` route threads `hazard_notes: notes` into its `uiPayload`.

## Why
- Additive completeness: the canonical observation payload must carry at least the
  detail the adapter tables carry, so the eventual adapter clip is non-lossy.
- No identity fields are added to payload (§3.2 worker non-attribution holds).
- No `severity` is invented for infrastructure — infra has none at the source.

## Constraints honored
- Additive only — `hazards` and `infrastructure_issues` adapter writes unchanged.
- All new payload writes guarded by truthiness (`...(x && { k: x })`), so absent
  fields produce no payload keys rather than `null`/`undefined` entries.
- `tsc --noEmit` passes.

## Files touched
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `docs/changelog/2026-06-14-issue-031-canon-norm-step5-payload-enrich.md` (this file)
