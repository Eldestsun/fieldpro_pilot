# 2026-06-13 — Parent governance copy restored as a marked full mirror (not a thin pointer)

## What changed
- **Versioned `baseline/fieldpro_pilot/CLAUDE.md` (authoritative).** Added one step
  to the "Work Tracking — Notion Board" → **Recurring task — P1 dependency
  reconciliation** subsection: re-sync the parent `Optimized_Life/CLAUDE.md` mirror —
  diff it against the authoritative section, and if they differ, update the parent
  mirror to match and bump its "Last synced" marker. The versioned file is always the
  source; the mirror follows. This is the only change to the versioned file (minimal
  diff).
- **Parent `Optimized_Life/CLAUDE.md` (local, unversioned).** Replaced the thin
  pointer + one-line reminder (from commit ac4fd02) with a **full mirror** of the
  versioned "Work Tracking — Notion Board" section. The mirror carries:
  - A `=== MIRROR — NOT AUTHORITATIVE ===` header naming the versioned
    `fieldpro_pilot/CLAUDE.md` as the SINGLE SOURCE OF TRUTH, stating the versioned
    file wins on any disagreement, and recording a "Last synced" date + commit.
  - The complete rule, verbatim: **The board**, **Pick-protocol**, **Pre-dispatch
    checklist**, **Phase Discipline (hard rule)**, and **Recurring task — P1
    dependency reconciliation** (including the new re-sync step).
  - The versioned section's own source-of-truth intro paragraph and the
    `5dbba9f` consolidation note are NOT mirrored — they are the versioned file's
    self-framing, and the mirror header replaces that framing. No rule content is
    trimmed.

## Why
- The thin pointer was insufficient. A Dispatch/Cowork session that loads ONLY the
  parent file would get a one-line reminder, not the full guardrail — missing the
  same-file rule, the board-bug-reporting instruction, and the reconciliation task.
  The entire purpose of the guardrail is to stop the "F-1 is next while a P1 is open"
  error in Dispatch sessions specifically, which is exactly the session type that
  reads only the parent.
- This resolves the conflict between commit 5dbba9f (full rule in BOTH files — two
  copies drift) and commit ac4fd02 (thin pointer in parent — single source, but the
  parent loses the full rule). The resolution keeps BOTH benefits: the parent again
  carries the full rule, but as an explicitly-marked, non-authoritative MIRROR with
  a standing re-sync task, so divergence is managed and detectable rather than silent.

## Notes / honest residuals
- **The parent `Optimized_Life/CLAUDE.md` is NOT under version control** (only
  `baseline/fieldpro_pilot/` is a git repo). The mirror is live on disk for
  Dispatch/Cowork sessions but is not part of this commit/PR. Only the versioned
  `fieldpro_pilot/CLAUDE.md` reconciliation-task addition and this changelog entry
  are committed. Drift between the two is now caught by the re-sync step in the
  recurring reconciliation task — that is the mechanism that replaces git history for
  the unversioned copy.
- **The versioned section's intro still reads "must not carry a second copy of these
  rules."** That sentence reflects the ac4fd02 thesis; the resolution supersedes it
  by allowing a *marked, non-authoritative* mirror. Per the task scope this commit
  makes the minimal diff to the versioned file (the single reconciliation-task step
  only), so that intro sentence was left unchanged; the mirror header carries the
  superseding framing.
- Documentation/governance only — no application code, schema, or card-status changes.

## Files touched
- `baseline/fieldpro_pilot/CLAUDE.md` (committed) — one step added to the Recurring
  task — P1 dependency reconciliation subsection (parent-mirror re-sync).
- `/Users/adamyu/Desktop/Optimized_Life/CLAUDE.md` (parent — edited on disk, NOT
  git-tracked) — thin pointer replaced with a marked full mirror of the Work Tracking
  section.
- `baseline/fieldpro_pilot/docs/changelog/2026-06-13-governance-parent-mirror.md`
  (this entry)
