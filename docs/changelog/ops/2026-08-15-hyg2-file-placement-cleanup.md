# 2026-08-15 — HYG-2: file-placement cleanup (changelog re-file, root strays)

## What changed
- Re-filed the 17 changelog entries sitting at `docs/changelog/` root (all predate the
  category-directory convention) into their categories: 10 → `refactor/` (state-layer
  authority/model/seeding/cleanup, arrival deadcode, CANON-NORM steps 1/3/4/5/6),
  2 → `security/` (s9-verification-pass, sidecar-extraction), 5 → `ops/` (known-issues
  backfill, three governance entries, issue-031 doc-reconciliation). Changelog root now
  contains only category directories.
- Moved two point-in-time audit reports from repo root to `docs/audit/`:
  `2026-06-11-live-repo-audit.md`, `2026-06-11-known-issues-ground-truth-report.md`
- Moved `Pilot_And_Scale_Strategy.md` from repo root to `planning/commercial/`
- Untracked `baseline_pre_asset_refactor.fieldpro_db` (444K binary pre-Tier-8 DB dump)
  and moved it on disk to the gitignored `db_dumps/`
- Fixed the four **live-doc** references to moved paths (`docs/KNOWN_ISSUES.md` ×2,
  `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` ×2, plus one cross-reference
  inside a moved entry). Dated historical reports (role-rename close-outs, issue-031
  decision files) intentionally left untouched — they describe the tree as it was then.

## Why
- Findings R4 + R5 of the 2026-08-15 repo-structure audit
  (`planning/specs/2026-08-15-repo-structure-analysis.md`, board card HYG-2):
  root-level strays and pre-convention changelog placement made the tree ambiguous
  about where things belong
- Notes from the audit closed without action: root `package-lock.json` was already
  gitignored (no change needed); `Scripts/` (12M, untracked) contains only a stale
  Python venv + `.DS_Store` — nothing load-bearing, safe to delete manually

## Files touched
- 17 × `docs/changelog/*.md` → `docs/changelog/{refactor,security,ops}/` (renames)
- `2026-06-11-live-repo-audit.md` → `docs/audit/` (rename)
- `2026-06-11-known-issues-ground-truth-report.md` → `docs/audit/` (rename)
- `Pilot_And_Scale_Strategy.md` → `planning/commercial/` (rename)
- `baseline_pre_asset_refactor.fieldpro_db` (untracked; on disk in `db_dumps/`)
- `docs/KNOWN_ISSUES.md`, `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`,
  `docs/changelog/refactor/2026-05-25-arrival-phase-deadcode-removal.md` (path fixes)
- `docs/changelog/ops/2026-08-15-hyg2-file-placement-cleanup.md` (this file)
