# 2026-08-15 — HYG-1: governance quick fixes (router, stale snapshot, closed-track banners, pointer sweep)

## What changed
- `CLAUDE.md` Task Routing: added a **Capability Build (Tn-XX)** row routing to
  `planning/capability-build/CAPABILITY_BUILD_INDEX.md` → relevant spec — the active
  track was previously unrouted and fell into the generic Feature row
- `CLAUDE.md` pointer fixes: Security row now points at `planning/SECURITY_SPRINT_INDEX.md`
  (was `planning/security/…`, where the index does not live); Do-Not-Load `repo-tree.md`
  entry updated to reflect that the file is gitignored, not tracked at `docs/`
- `docs/OPEN_ISSUES_OVERVIEW.md` retired to a pointer stub → `docs/KNOWN_ISSUES.md` +
  Notion board (was a 2026-06-05 snapshot still describing June's issue state; issues
  have reached ISSUE-062)
- TRACK COMPLETE / SPRINTS CLOSED banners added to `planning/REFACTOR_INDEX.md`,
  `planning/REFINEMENT_INDEX.md`, `planning/SECURITY_SPRINT_INDEX.md` — all remain
  router-required historical reads but no longer present as live tracking
- Committed `planning/specs/2026-07-11-transit-stops-deKCM.md` (real founder-directed
  proposal spec, untracked in the working tree since July)
- Added `planning/specs/2026-08-15-repo-structure-analysis.md` (the audit these fixes
  come from; Source File for board cards HYG-1/2/3)

## Why
- Findings R1, R3, R6, R7, R8 of the 2026-08-15 repo-structure audit: documents
  accurate when written but never retired/re-synced were quietly lying to sessions
- Capability Build is about to run full-bore; the router must route it and the
  mandatory reads must stop misdirecting

## Files touched
- CLAUDE.md
- docs/OPEN_ISSUES_OVERVIEW.md
- planning/REFACTOR_INDEX.md
- planning/REFINEMENT_INDEX.md
- planning/SECURITY_SPRINT_INDEX.md
- planning/specs/2026-07-11-transit-stops-deKCM.md (newly tracked)
- planning/specs/2026-08-15-repo-structure-analysis.md (new)
- docs/changelog/ops/2026-08-15-hyg1-governance-quick-fixes.md (this file)
