# 2026-08-15 — HYG-3: thin the five workspace CONTEXT.md files to invariants + pointers

## What changed
- `backend/CONTEXT.md` — rewrote: kept canonical write hierarchy, module boundary
  rule, offline-idempotency requirement, auth/RLS pointers, labor-safety expression;
  removed the stale module tree (omitted 7 directories), the "core.evidence currently
  unwritten" claim (false since the sidecar extraction), pre-rename role names, and
  §5.x build-state parentheticals (status lives in `current_state.md`)
- `frontend/CONTEXT.md` — rewrote: kept canonical-alignment rules, offline-first
  rules, labor-safety rules; removed the stale folder map and pre-rename role names;
  added the post-rename surface/role map (Specialist `/work`, Dispatch `/ops/*`,
  Admin `/admin/*`)
- `planning/CONTEXT.md` — cut to spec-format rules + boundaries only; removed the
  divergent routing table (CLAUDE.md is the single router), the dead workspace map
  (`/planning/TIER_N_*.md`, `/planning/decisions`), and the "two tracks in progress"
  claim (both closed)
- `docs/CONTEXT.md` — replaced the fictional subfolder map (`/api`, `/guides` never
  existed) with the real one; kept the changelog entry format; added the
  dated-reports-are-immutable rule
- `ops/CONTEXT.md` — replaced with a PROPOSED-FOR-RETIREMENT stub routing to the real
  homes (`docs/ops/`, `docs/dev/`, `backend/src/scripts/`); directory has been empty
  since 2026-05-08 — founder may delete outright at merge

## Why
- Finding R2 (+R9) of the 2026-08-15 repo-structure audit
  (`planning/specs/2026-08-15-repo-structure-analysis.md`, board card HYG-3): all
  five files were frozen at 2026-05-08 while three months of the heaviest work
  happened; as mandatory reads they were feeding stale facts to every session
- Structural fix, not just content: these files now hold only invariants and
  pointers — the volatile parts (module trees, track status, build state) that
  caused the rot are delegated to the places that already own them

## Files touched
- backend/CONTEXT.md
- frontend/CONTEXT.md
- planning/CONTEXT.md
- docs/CONTEXT.md
- ops/CONTEXT.md
- docs/changelog/ops/2026-08-15-hyg3-context-thinning.md (this file)
