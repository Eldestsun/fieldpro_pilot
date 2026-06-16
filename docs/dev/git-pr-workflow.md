# Git & PR Workflow — Reference

> The hard rules (named branch → commit → `--no-ff` merge → push → **verify push** →
> never commit to `main` → never cherry-pick → feature branches reach `main` via PR,
> human reviews before merge) live in `CLAUDE.md § Git Commit Convention`. This file
> holds the supporting reference moved out of CLAUDE.md during the 2026-06-16 rules-index
> restructure: the branch map, the PR-description structure, and the retired-branch history.

## Active Branch Map

| Branch | Purpose | Status |
|--------|---------|--------|
| `feat/state-layer` | State layer build — ok-rules, normalizer, §9 verification, backfill | Active |
| `design/capability` | Capability design artifacts — specs and architecture before the capability build begins | Next |
| `feat/intelligence-layer` | Intelligence layer build — T1/T2/T3 tiers, MVs, pattern rules | Opens after state layer merges |
| `chore/*` | Housekeeping — docs, planning artifacts, naming, config | Short-lived, merge and close |

## PR Description Structure

Feature branches reach `main` via PR, not direct merge. Once work is reviewed and pushed,
open a PR on the feature branch.

**PR description structure:**
- **SIGNIFICANCE:** one or two sentences on what this commit means — what it unlocks or
  closes, not just what it does.
- **WHAT LANDED:** by phase or file group, brief — the changelog is the long-form record;
  the PR is the orientation.
- **HONEST RESIDUAL:** if the work is partial, name what's still ahead and link the tracking issue.

**Title convention:** if the work is partial, carry `(partial — ISSUE-XXX)` in the title so
the partial state is visible at the PR-list level, not just in the description body.

Agents may draft PR descriptions from the changelog. The human reviews before opening the PR
for merge.

## History — retired branches

`refactor/baseline` is retired — it was a long-lived integration branch that closed when the
original refactor and refinement workstreams completed. All work now runs on typed, named
branches that correspond to active workstreams (see the Active Branch Map above).
