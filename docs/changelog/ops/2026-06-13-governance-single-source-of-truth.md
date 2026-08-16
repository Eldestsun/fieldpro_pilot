# 2026-06-13 — BASELINE governance consolidated to a single versioned source of truth

## What changed
- Created a new **"Work Tracking — Notion Board"** section in
  `baseline/fieldpro_pilot/CLAUDE.md` (versioned). It is now the single
  authoritative home for all BASELINE product governance and contains, in one
  place:
  - **The board** — where the BASELINE Work Tracker lives and the fields each card
    carries (Phase, Status, Depends On, Owner, Issue ID, Source File).
  - **Pick-protocol** — walk in phase order (P1 → P2 → P3); among eligible cards
    pick Ready/unblocked cards whose dependencies are all Done; only
    `Owner = Agent-Dispatchable` cards are agent work (`Founder-Infra` cards such
    as F-1 Entra are skipped).
  - **Pre-dispatch checklist** — the phase-discipline guardrail inline: P2+ card
    requires no open P1; verify every `Depends On` is same-phase-or-lower (a
    higher-phase edge is a BOARD BUG — report, do not follow, do not start the
    higher-phase work to "unblock"); read the card's Source File first.
  - **Phase Discipline (hard rule)** — the five governing bullets, absorbed here.
  - **Same-file rule** — two phase-correct changes beat one bundled change.
  - **Known phase facts** — F-1 and T1-CC are P2, never on the P1 critical path.
  - **Recurring task** — P1 dependency reconciliation at each session boundary /
    before any new-phase dispatch.
- **Consolidated** the standalone `## Phase Discipline (hard rule)` section (added
  in commit 5dbba9f) into the new Work Tracking section as its
  **Phase Discipline (hard rule)** subsection, so there is now ONE authoritative
  phase-discipline statement in the versioned file, not two. A consolidation note
  records the absorption.
- **Reduced the parent `Optimized_Life/CLAUDE.md` (local, unversioned) to a thin
  pointer.** Removed its duplicated `## Phase Discipline (hard rule)` section, its
  `### Pre-dispatch checklist`, and its `### Recurring task — P1 dependency
  reconciliation` subsections. Replaced them with a short pointer block that
  references the versioned section plus a one-line reminder ("P1 before P2; never
  follow a Depends-On edge to a higher phase — report it as a board bug").
- **Fixed the pre-existing dangling reference.** The parent's BASELINE Routing
  pointer to `fieldpro_pilot/CLAUDE.md` under "Work Tracking — Notion Board" now
  resolves to a real section (it previously pointed at nothing — the section was in
  a deleted uncommitted modification). The parent's personal-orchestration content
  (the Cowork / Claude Code Remote Control handler split, the Tool Map) was left
  untouched.

## Why
- Governance that can drift must be versioned. The phase-discipline rule and board
  pick-protocol had been written into the parent `Optimized_Life/CLAUDE.md`, which
  is intentionally LOCAL and UNVERSIONED — no history, no diff, no recovery, and
  free to silently drift from the versioned product rules.
- Two full copies in two files is the exact failure being eliminated. After this
  change there is exactly one full copy (versioned) and one thin pointer (local).
- The parent already referenced a "Work Tracking — Notion Board" section in
  `fieldpro_pilot/CLAUDE.md` that did not exist — a live dangling pointer to a
  missing source of truth. Creating the section resolves it.

## Notes / honest residuals
- **This reverses a deliberate decision from commit 5dbba9f.** That commit placed
  the phase-discipline rule self-contained in BOTH files, reasoning that the two
  files load in different session types and a pointer would be insufficient. This
  task supersedes that: the single-source-of-truth requirement (drift must be
  caught by git) outweighs the convenience of a self-contained parent copy. The
  parent now points down into the versioned file instead of carrying a second copy.
  The accepted tradeoff: a Dispatch/Cowork session reading only the parent gets the
  pointer + the one-line P1-before-P2 reminder, and must open the versioned file for
  the full rule.
- **The residual flagged in `2026-06-13-phase-discipline-guardrails.md` (the
  dangling "Work Tracking — Notion Board" reference) is now closed** by Change 1.
- **The parent `Optimized_Life/CLAUDE.md` is NOT under version control** (only
  `baseline/fieldpro_pilot/` is a git repo). Its edits are live on disk for
  Dispatch/Cowork but are not part of this commit/PR. Only the versioned
  `fieldpro_pilot/CLAUDE.md` change and this changelog entry are committed.
- Documentation/governance only — no application code, schema, or card-status
  changes.

## Files touched
- `baseline/fieldpro_pilot/CLAUDE.md` (committed) — new "Work Tracking — Notion
  Board" section; standalone Phase Discipline section absorbed into it.
- `/Users/adamyu/Desktop/Optimized_Life/CLAUDE.md` (parent — edited on disk, not
  git-tracked) — reduced to a thin pointer; dangling reference now resolves.
- `baseline/fieldpro_pilot/docs/changelog/2026-06-13-governance-single-source-of-truth.md`
  (this entry)
