# 2026-09-16 — ISSUE-065: skip reason_code conforms to canonical 'safety'

## What changed
- **Write path** (`routeRunStopRoutes.ts` skip-with-hazard handler): the closed
  skipped visit now records `reason_code = 'safety'` — the canonical non-service
  category (design §8b) — instead of `hazard_types?.[0]` (the first selected
  hazard type, e.g. `'encampment'`). The **specific hazards are unchanged**: they
  are still emitted as `*_present` presence observations on the same visit, in
  the same transaction (ISSUE-051 atomicity untouched).
- **Backfill migration** `20260916_issue065_skip_reason_code_safety.sql`:
  idempotent, runner-recorded normalization of any historical skipped visit whose
  `reason_code` holds a hazard-type value → `'safety'`. No-op on the current DB
  (verified: zero skipped visits exist cross-org); included so a populated
  staging/prod environment converges on deploy.
- **Control Center comment** (`controlCenterRoutes.ts` "Skips by Reason")
  updated: the grouping query is unchanged, but `reason_code` now yields a single
  `'safety'` bucket per design. The stale comment claiming `reason_code = the
  hazard type` was corrected. Restoring a per-hazard skip breakdown is a
  presence-observation read (CC-EXCEPTIONS-DRILLDOWN) — deliberately NOT bundled
  here (phase discipline: two phase-correct changes over one bundled).
- **Test** `skipHazardAtomic.test.ts`: asserts `reason_code = 'safety'` and that
  the specific hazard survives as its `*_present` presence observation.

## Why
- The design (§8b, §3.5) defines `reason_code='safety'` as the only non-service
  visit outcome. The daily-ops report and any consumer filtering skips on
  `outcome='skipped' AND reason_code='safety'` silently missed every real skip
  under the old per-hazard value. Founder decision (2026-09-16): Option 1 —
  conform code to design. No fidelity lost: the reason_code slot carries the
  category; the `*_present` rows carry which hazard (§2.1 corollary).

## Consumer impact (surfaced, not silent)
- Control Center "Skips by Reason" now shows one `'safety'` bucket instead of
  per-hazard rows. Design-aligned; the per-hazard breakdown returns when
  CC-EXCEPTIONS-DRILLDOWN reads the presence observations. Stop-history drawer
  (`StopHistoryDrawer`) now shows "Reason: Safety" for skips — correct.

## Verification
- `tsc --noEmit` clean; full backend suite **217/217** — `skipHazardAtomic.test`
  drives the real skip-with-hazard HTTP handler and asserts `reason_code='safety'`
  plus the surviving `encampment_present` observation.
- Migration applied + recorded on dev via the provisioner runner (ISSUE-038
  same-step); no-op backfill (zero skip rows live).
- **Clean-room gate**: ephemeral postgres:14 + `db/init` bootstrap → full chain
  exit 0, migration recorded. Container destroyed.

## Files touched
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/admin/controlCenterRoutes.ts` (comment only)
- `backend/migrations/20260916_issue065_skip_reason_code_safety.sql` (new)
- `backend/tests/canonical/skipHazardAtomic.test.ts`
- `docs/changelog/bugfix/2026-09-16-issue-065-skip-reason-code-safety.md` (this entry)
