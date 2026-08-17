# 2026-08-16 — ISSUE-018: intelligence channel — the sidecar wall made runtime-binding (PILOT-GATE)

## What changed
- New migration `20260816_issue018_intelligence_reader_grant_provision.sql`
  (runner-applied, ledger-recorded, idempotent): version-controls
  `intelligence_reader`'s full posture — guarded create (NOLOGIN), assert-only
  posture guard, SELECT on the identity-free canonical surface (observations,
  visits, assignments, evidence, locations, location_external_ids,
  asset_locations, v_observation_normalized) + identity-free vertical/derived
  reads (transit_stops, stop_effort_history), and DML on the job's own two
  derived outputs: stop_risk_snapshot (SELECT/INSERT/DELETE),
  stop_condition_history (SELECT/INSERT + sequence USAGE — SELECT is demanded by
  the job's own `ON CONFLICT (stop_id, visit_id)` arbiter). **Identity wall
  asserted in-chain:** zero privilege on the four sidecars, identity_directory,
  route_runs, audit_log — a reopened grant turns the migration chain red.
- `backend/src/db.ts`: `getIntelligencePool()` + `withIntelligenceOrgContext()` —
  third instance of the fail-closed channel pattern (no credential ⇒ throw; never
  an app-role fallback).
- `riskMapService.rebuildStopRiskSnapshot(orgId)` — signature drops the pool
  param; the job sources the intelligence pool internally. The WHOLE rebuild
  (read canonical → write derived, one transaction) now runs as
  `intelligence_reader`. Call sites updated (riskMapJob CLI, adminRoutes rebuild
  endpoint, riskMapSeverity + orgFailClosed tests).
- CI: channel-role login step extended (throwaway `intelligence_reader` password,
  fieldpro_test precedent) + env var in the test step.
- `backend/.env.example`: `INTELLIGENCE_READER_PASSWORD` documented; dev
  credential bootstrapped out-of-band per design (gitignored `.env`).
- New canonical tests (`intelligenceReaderChannel.test.ts`, 5): grant posture;
  **runtime-binding wall proof** — live-channel `SELECT` on every identity object
  returns `42501 permission denied`; end-to-end rebuild under the constrained
  role; RLS-binds-on-channel (context-less read = zero rows); fail-closed orgId.
- Landed the two unmerged docs from the paused `feat/issue-018-…` branch as the
  historical record (`planning/architecture/2026-06-06-issue-018-phase-0-context.md`
  with a RESOLVED header, `docs/audit/2026-06-06-adapter-layer-information-content-audit.md`).
- `docs/KNOWN_ISSUES.md`: ISSUE-018 marked Fixed.

## Why
- Board card ISSUE-018 (P1.5 Guarantee-Activation, PILOT-GATE, labor-safety):
  until now the app read everything as `fieldpro`, so the no-grant sidecar wall
  was structural but NOT runtime-binding — non-attribution leaned on code
  discipline. The claim "labor-safe by structure, not policy" now holds at
  runtime: the intelligence connection *cannot* read identity, proven by test.
- Decisions recorded per the Phase-0 context doc §6 resume plan:
  - **D-D resolved**: June found the risk job "cannot run as intelligence_reader
    (no INSERT grant)"; post-031 answer is granting DML on its two identity-free
    derived outputs — the read surface stays narrow, the whole job gets the
    constrained connection. Control-Center reads stay on the app role
    deliberately (operational surface, D5-scoped, touches route_runs).
  - **ISSUE-025 joint decision** (reserved into this dispatch by KNOWN_ISSUES):
    pool-per-role locked as the connection-routing mechanism (third instance;
    SET ROLE rejected — pooled-connection leak risk on release). CI test role
    (`fieldpro_test`) unchanged.
  - **D-B / PG14 re-decision** (ISSUE-029): view-owner bridge accepted — the
    post-clip granted view set is identity-free column-by-column and no view
    reaches a sidecar; `security_invoker` remains the PG15 upgrade.

## Verification
- Backend canonical suite **196 passed / 0 failed** (191 + 5 new). The
  pre-existing riskMapSeverity tests now exercise the rebuild under the
  constrained role and pass unchanged.
- Migration runner-applied + recorded; two grants added mid-review (arbiter
  SELECT, asset_locations join) were hand-aligned on dev to the edited
  (unmerged) migration in one step — no ledger drift.

## Files touched
- backend/migrations/20260816_issue018_intelligence_reader_grant_provision.sql (new)
- backend/src/db.ts
- backend/src/intelligence/riskMapService.ts
- backend/src/intelligence/riskMapJob.ts
- backend/src/modules/admin/adminRoutes.ts
- backend/tests/canonical/intelligenceReaderChannel.test.ts (new)
- backend/tests/canonical/riskMapSeverity.test.ts
- backend/tests/canonical/orgFailClosed.test.ts
- backend/tests/run.ts
- backend/.env.example
- .github/workflows/ci.yml
- planning/architecture/2026-06-06-issue-018-phase-0-context.md (landed + resolved)
- docs/audit/2026-06-06-adapter-layer-information-content-audit.md (landed)
- docs/KNOWN_ISSUES.md
- docs/changelog/security/2026-08-16-issue018-intelligence-channel.md (this file)
