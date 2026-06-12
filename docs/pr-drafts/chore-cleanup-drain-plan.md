# PR Draft — chore/cleanup-drain-plan

**Title:** docs(planning): add pre-capability cleanup drain plan index

**Base:** main ← **Compare:** chore/cleanup-drain-plan
**Open at:** https://github.com/Eldestsun/fieldpro_pilot/pull/new/chore/cleanup-drain-plan

---

## SIGNIFICANCE

Establishes the dispatch target for draining every open issue in
`docs/KNOWN_ISSUES.md` before the capability workstream begins. This is
the planning artifact the founder's "full drain before capability"
commitment dispatches against — the same role `CAPABILITY_BUILD_INDEX`
plays for capability work. It makes the path from "state-layer done" to
"foundation visibly done, issue log empty" explicit and sequenced.

## WHAT LANDED

- **`planning/CLEANUP_DRAIN_PLAN.md`** (new) — five-phase drain plan:
  - Phase 1: CI / test infrastructure (ISSUE-022, 009) — gates everything
  - Phase 2: small contained fixes (ISSUE-019, 020, 001, 011)
  - Phase 3: structural correctness (ISSUE-018, 013, 014, 006)
  - Phase 4: design decisions + implementations (ISSUE-015, 016, 017)
  - Phase 5: formal closure with deferral (ISSUE-008, 010)
  - Plus purpose, sequencing rules, total scope, and per-phase
    completion criteria.

Documentation only. No code, no schema. `docs/KNOWN_ISSUES.md` is
untouched and remains the source of truth on each issue's
WHAT / SEVERITY / FIX-SHAPE; this file owns only sequencing and phase
structure.

## HONEST RESIDUAL

- This is the plan, not the work. None of the 14 referenced issues are
  fixed or closed by this PR — the actual cleanup dispatches reference
  this file.
- Naming was the founder's call (`CLEANUP_DRAIN_PLAN.md` recommended
  and used over `PRE_CAPABILITY_CLEANUP_INDEX.md`).
- The plan references `docs/OPEN_ISSUES_OVERVIEW.md`; that file is
  currently untracked locally and lands on its own track, not in this PR.
