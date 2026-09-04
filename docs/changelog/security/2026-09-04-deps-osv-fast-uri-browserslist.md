# 2026-09-04 — Dependency gate unblock: fast-uri + browserslist HIGH advisories (OSV drift)

## What changed
- `backend/pnpm-lock.yaml`: `fast-uri` 3.1.5 → 3.1.7 (transitive via
  `openapi-schema-validator → ajv@8`, dev-only). Clears 4 HIGH advisories
  (GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf,
  GHSA-jqff-g426-hqxp; all fixed ≥3.1.6 per OSV). In-range for ajv's `^3.0.1`;
  4-line lockfile diff, no manifest change.
- `frontend/pnpm-lock.yaml`: `browserslist` 4.28.2 → 4.28.9 (transitive via
  babel/workbox, dev-only). Clears 2 HIGH advisories (GHSA-73wf-gq98-2v4g,
  GHSA-c83g-rgw3-j3cx; fixed ≥4.28.7). Note: `pnpm update <pkg>` re-resolves
  the whole importer, so the lockfile also picked up in-range patch/minor
  refreshes of other transitives (terser, @babel/*, etc.) — verified identical
  behavior on pinned pnpm 10.14.0, so this is pnpm semantics, not version
  drift. Validated by full local run: frontend vitest 95/95 + tsc clean +
  production build green; backend suite 202/202.
- Deliberately reverted: pnpm's unrequested `js-yaml` range bump in
  `backend/package.json` (^4.1.1 → ^4.3.1) — the lockfile carried no matching
  change, so it would have broken `--frozen-lockfile` in CI.

## Why
- PR #112 (T1-D4) failed the S1-10 dependency gate on 6 HIGH advisories none
  of which were introduced by the PR — pure OSV drift since the last green run
  (2026-09-01). This is exactly the failure mode the DEPS-DRIFT-CADENCE card
  predicts; a scheduled audit run would have surfaced it before it blocked a PR.
- Sequencing: merge this to main first, then re-run PR #112's checks — the
  pull_request merge ref picks up main's lockfiles and the gate passes without
  touching the feature branch.

## Files touched
- `backend/pnpm-lock.yaml`
- `frontend/pnpm-lock.yaml`
- `docs/changelog/security/2026-09-04-deps-osv-fast-uri-browserslist.md` (this entry)

## Incidental finding fixed during validation (not dependency-related)
The backend suite's Q-C linkage test caught two orphaned `core.assignments`
rows (`source_ref = '4448'`) left by the T1-D4 smoke — the UI route-create
path writes canonical assignment rows, which the scaffold cleanup had missed.
Deleted both (verified 0 orphans; founder run #4447's six assignments
untouched); suite then 202/202. The T1-D4 board card's residue note is
corrected accordingly. Lesson for future smokes: UI-created runs scaffold
`core.assignments` too — cleanup must include
`WHERE source_system='route_runs' AND source_ref='<run id>'`.
