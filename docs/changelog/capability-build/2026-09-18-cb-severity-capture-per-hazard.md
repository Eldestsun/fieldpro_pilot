# 2026-09-18 — CB-SEVERITY-CAPTURE: per-hazard severity capture (inline chips)

## Founder decision (recorded)
The four axes ruled 2026-09-18, as one package:
1. **Grain: per-hazard** (Option C — inline chips), not per-report. Rationale: if
   intelligence ever weights by hazard type, per-report capture is unrecoverable —
   a fire and a needle in one report shared one magnitude. Capture at the true
   grain or the data is gone (the ISSUE-073 contamination principle).
2. **Scale: 3-level** Low/Medium/High → 1/2/3 (the pre-existing
   `toNumericSeverity` scale; verbal anchors are field-fast). The OpenAPI "1–5"
   was doc drift and is corrected to 1–3.
3. **Infra: NO severity capture.** `component` + `cause` + `needs_facilities`
   IS the infra triage signal (KCM does not grade infra magnitude at source —
   ISSUE-034 recon). The never-written `infrastructure_issues.severity` column
   is a removal candidate, not a capture target.
4. **Optional, per hazard.** A skipped picker → no payload severity →
   `norm_severity` NULL (§4.4 no-manufactured-state). No forced garbage taps.

## What changed
- **Frontend**
  - `StopDetail.tsx` safety modal: the single report-level Severity picker is
    replaced by Low/Med/High chips inline under **each checked hazard**
    (toggle to unset; unchecking a hazard drops its severity — a magnitude
    never outlives the hazard it grades). Review summary shows
    `hazard (severity)` per concern; the old single-severity line renders only
    for legacy local state.
  - `useTodayRoute.ts`: `SafetyState.hazardSeverities` (sparse map keyed by
    hazard type); threaded into both the skip payload and the complete
    payload's `safety` object. `severity` kept as deprecated replay-compat.
  - `api/routeRuns.ts`: `hazard_severities` on `HazardPayload`/`SafetyPayload`.
  - No offline-queue changes: the payload is opaque to the queue (file stays
    frozen).
- **Backend**
  - `observationService.ts`: `StopUiPayload.hazard_severities`; severity now
    resolved **per hazard** — `hazard_severities[h] ?? hazard_severity`
    (report-level value is fallback ONLY, for legacy clients / queued replays
    predating this change). Each hazard observation gets its own
    `payload.severity` (numeric) → §4.2 normalizer → `norm_severity`, and its
    own legacy `severity` text value.
  - `cleanLogService.ts` (complete path) + skip route: thread
    `hazard_severities` through; skip route accepts flat and nested shapes as
    with the other safety fields.
  - OpenAPI: both endpoints document `hazard_severities`; `severity` corrected
    from "1–5" to 1–3 and marked legacy/fallback. Artifact regenerated
    (51 paths).
- **No migration.** Core has been per-observation grain since CANON-NORM-1/2 —
  the presence `severity_map {"field":"severity"}` reads each observation's own
  payload. This was purely a capture-surface + threading change.

## Verification
- Backend suite **228/228** (2 new in `hazardSeverityCarry.test.ts`:
  per-hazard magnitudes land per observation with unrated → NULL; per-hazard
  entry beats report-level fallback, fallback covers unmapped hazards).
- Frontend suite **122/122**; `tsc --noEmit` clean both workspaces.
- The three pre-existing report-level tests still pass — the legacy path is
  live compat, not dead code.

## Files touched
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/hooks/useTodayRoute.ts`
- `frontend/src/api/routeRuns.ts`
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/openapi/openapi.json` / `openapi.yaml` (regenerated)
- `backend/tests/canonical/hazardSeverityCarry.test.ts`
- `docs/changelog/capability-build/2026-09-18-cb-severity-capture-per-hazard.md` (this entry)
