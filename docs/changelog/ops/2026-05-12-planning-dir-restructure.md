# 2026-05-12 — Planning directory restructure

## What changed
- Created `planning/refactor/` subfolder; moved all 8 `TIER_N_*.md` files into it
- Created `planning/refinement/` subfolder; moved all 10 `REFINEMENT_R*.md` files into it
- Created `planning/security/` subfolder with four new security hardening sprint files: `SECURITY_SPRINT_INDEX.md`, `SECURITY_SPRINT_1_CODE_GAPS.md`, `SECURITY_SPRINT_2_POLICY_DOCS.md`, `SECURITY_SPRINT_3_FOUNDER_TASKS.md`
- Updated all tier file references in `planning/REFACTOR_INDEX.md` (8 paths: `planning/TIER_N_*.md` → `planning/refactor/TIER_N_*.md`)
- Updated all refinement file references in `planning/REFINEMENT_INDEX.md` (10 paths: `planning/REFINEMENT_R*.md` → `planning/refinement/REFINEMENT_R*.md`)
- Updated `CLAUDE.md` routing table: tier and refinement path hints updated; new Security hardening row added pointing to `planning/security/SECURITY_SPRINT_INDEX.md`

## Why
- `planning/` root was crowded with 20+ flat files; subfolders make it easier to orient within a track
- `REFACTOR_INDEX.md`, `REFINEMENT_INDEX.md`, and `ADAPTER_BOUNDARY.md` stay at root — CLAUDE.md points to them by exact path and they are routing artifacts, not spec files
- Security sprint is a new track (post-Tier-7) that warrants its own subfolder and routing row in CLAUDE.md

## Files touched
- `planning/refactor/` (new directory, 8 files moved in)
- `planning/refinement/` (new directory, 10 files moved in)
- `planning/security/` (new directory, 4 files created)
- `planning/REFACTOR_INDEX.md` (8 path references updated)
- `planning/REFINEMENT_INDEX.md` (10 path references updated)
- `CLAUDE.md` (routing table updated, security row added)
