# 2026-06-13 — Phase Discipline guardrails (P1→P2 dependency inversion fix)

## What changed
- Added a new top-level **"Phase Discipline (hard rule)"** section to
  `baseline/fieldpro_pilot/CLAUDE.md` (read by all code sessions), placed
  immediately after the Task Routing section and before Core Rules so the
  routing reader cannot miss it.
- Added the same **"Phase Discipline (hard rule)"** section to the parent
  `Optimized_Life/CLAUDE.md` (read by Dispatch/Cowork sessions), placed
  immediately after the BASELINE Routing section.
- Folded the board-protocol additions into the parent `Optimized_Life/CLAUDE.md`
  BASELINE Routing section (it is the de facto board/dispatch protocol home — see
  Notes):
  - A **pre-dispatch checklist** making the phase check a required action: confirm
    no open P1 card exists if the card is P2+, and verify every `Depends On`
    dependency is the same phase or lower (else treat as blocked-by-board-bug and
    report).
  - A **recurring task — "P1 dependency reconciliation"**: periodically audit
    every P1 card's `Depends On`, sever or report edges pointing at a higher phase,
    confirm the P1 critical path is self-contained.

The Phase Discipline rule, in both files, establishes: phase order is absolute
(no P2+ card while any P1 is open); dependencies point downhill only (a P1 card
may depend only on P1-or-lower); check the phase before following any `Depends On`
edge; prefer two phase-correct changes over one bundled change; and F-1 / T1-CC
are P2 and never on the P1 critical path.

## Why
- Three times in recent work a P1 card was given a dependency on P2 work, which
  inverted the phase gate (P1 appeared blocked on P2) and led a dispatch agent to
  propose P2 work as "next" while P1 was still open. Motivating incidents:
  - P1 clean-logs identity drop → made to depend on P2 capability rebuild.
  - P1 clip → made to depend on P2 capability build.
  - P1 Control Center repoint → made to depend on P2 T1-CC relocation.
- Root cause: nothing structurally forbade a P1 card from depending on a higher
  phase, and the "touch the file once" instinct chained phase-crossing work
  together. This installs the guardrail at the instruction layer for both the
  card-selection (Dispatch) path and the code-execution path.

## Notes / honest residuals
- **The rule was placed in BOTH CLAUDE.md files deliberately.** The card-selection
  inversion happens in Dispatch/Cowork (parent `Optimized_Life/CLAUDE.md`); the
  "bundle a P1 change into a P2 relocation" inversion happens in code sessions
  (`fieldpro_pilot/CLAUDE.md`). The two files are loaded in different session
  types and do not see each other, so a pointer would be insufficient — each needs
  the self-contained rule.
- **No discrete board-protocol doc exists.** The dispatch/board protocol lives
  inside the parent `Optimized_Life/CLAUDE.md` BASELINE Routing section, so
  Changes 2 (pre-dispatch checklist) and 3 (recurring reconciliation task) were
  folded there per the task's stop-condition guidance.
- **The parent `Optimized_Life/CLAUDE.md` is NOT under version control** (only
  `baseline/fieldpro_pilot/` is a git repo). Its edits are live on disk for
  Dispatch/Cowork but are not part of this commit/PR. Only the
  `fieldpro_pilot/CLAUDE.md` change and this changelog entry are committed.
- **Pre-existing dangling reference (not fixed here):** the parent BASELINE
  Routing section states the pick protocol is in `fieldpro_pilot/CLAUDE.md` under
  "Work Tracking — Notion Board," but no such section exists in that file. Left
  intact per the minimal-diff constraint; flagged for a future cleanup.

## Files touched
- `baseline/fieldpro_pilot/CLAUDE.md` (committed)
- `/Users/adamyu/Desktop/Optimized_Life/CLAUDE.md` (parent — edited on disk, not git-tracked)
- `baseline/fieldpro_pilot/docs/changelog/2026-06-13-phase-discipline-guardrails.md` (this entry)
