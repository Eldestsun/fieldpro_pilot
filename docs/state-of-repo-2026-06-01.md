# State-of-Repo Audit — 2026-06-01

Read-only. No commits, no changes. Used to sequence next dispatches.

---

## 1. Branch Inventory

### Local branches

| Branch | Tip | Ahead of main | Behind main | Last touched |
|--------|-----|:---:|:---:|:---:|
| `feat/sidecar-extraction` ← **current** | `60fb3c3` docs(claude): add PR merge discipline rule | **+2** | 0 | 2026-06-01 |
| `feat/state-layer` | `021e13c` docs(known-issues): ISSUE-017 | 0 | 6 | 2026-05-30 |
| `feature/capability_build` | `0beb544` fix(rls): set org context on start-stop | **+1** | 10 | 2026-05-30 |
| `main` | `69016fe` chore(meta): refresh CLAUDE.md canonical-state-layer | 0 | 0 | 2026-05-30 |
| `chore/docs-housekeeping` | `3e3f679` chore(docs): housekeeping | 0 | 13 | 2026-05-26 |
| `chore/update-claude-md-conventions` | `fdab7e5` chore(meta): retire refactor/baseline | 0 | 11 | 2026-05-26 |
| `backup/phase5-with-offline-experiment` | `34a4ec6` docs: add full two-track execution plan | 0 | 216 | 2026-05-08 |
| `refactor/v2-core-visits` | `497e3d1` cache-wiping-and-hardening | 0 | 220 | 2026-01-15 |
| `status` | `404efd2` feat: add core tables for org-agnostic | 0 | 227 | 2025-12-26 |
| `emergency/snapshot-pre-rebuild` | `108eb38` Demo stabilization: admin/ops views | 0 of main¹ | 235 | 2025-12-18 |
| `claude/busy-meninsky-3b8a5d` | `f42f289` pre-admin-panels-save | 0 | 228 | (pre-refactor era) |
| `claude/nervous-aryabhata-1261e4` | `f42f289` pre-admin-panels-save | 0 | 228 | (pre-refactor era) |
| `claude/stoic-goldwasser-a19c2f` | `f42f289` pre-admin-panels-save | 0 | 228 | (pre-refactor era) |

¹ Local `emergency/snapshot-pre-rebuild` is 1 commit ahead of its own remote — not ahead of main.

### Remote branches (origin)

| Branch | Tip | Notes |
|--------|-----|-------|
| `origin/main` | `69016fe` | Current main |
| `origin/feat/sidecar-extraction` | `60fb3c3` | In sync with local |
| `origin/feat/state-layer` | `eea45dd` chore(wip): checkpoint in-flight CLAUDE.md | Stale — this commit is in main; branch was never updated post-merge |
| `origin/feature/capability_build` | `0beb544` | In sync with local |
| `origin/backup/phase5-with-offline-experiment` | `34a4ec6` | In sync with local |
| `origin/emergency/snapshot-pre-rebuild` | `89948a5` | 1 commit behind local (local has an extra "Demo stabilization" commit) |
| `origin/feature/admin-panels` | `404efd2` | Old branch — same commit as local `status` branch; not in active branch map |
| `origin/refactor/v2-core-visits` | `497e3d1` | Old branch — not in active branch map |
| `origin/backend-refactor-match_assetUniverse` | `9a0e015` phase5c-complete-db-refactor-finished | Very old pre-refactor branch — not in active branch map |

---

## 2. PR / Merge State

- **`feat/sidecar-extraction`**: 2 commits NOT in main — `b56c0bf` (sidecar extraction, §9 item 6) and `60fb3c3` (PR discipline rule). This is the next branch to PR → main.
- **`b56c0bf` in main?** No. Confirmed `git merge-base --is-ancestor b56c0bf origin/main` → false.
- **Open PRs**: Cannot enumerate — `gh` CLI reported no token, and no PAT found on disk for the curl fallback. Assumed none open based on branch state (no branch other than `feat/sidecar-extraction` is ahead of main with active work).

---

## 3. Working Tree State

- **Current branch**: `feat/sidecar-extraction`
- **`git status --short`**: clean — no uncommitted, unstaged, or untracked files.

> Note: the initial session gitStatus snapshot (taken on `feat/state-layer`) showed `M CLAUDE.md`, ` M frontend/src/components/today-route/StopDetail.tsx`, and `?? .mcp.json`. CLAUDE.md was committed in this session (`60fb3c3`). The StopDetail.tsx modification and .mcp.json untracked file do not appear in the current working tree on `feat/sidecar-extraction` — they were likely associated with the state-layer branch or left on the prior branch state.

---

## 4. CLAUDE.md PR Discipline Rule — Status

- **Applied?** Yes.
- **Where?** On `feat/sidecar-extraction`, commit `60fb3c3` (pushed to `origin/feat/sidecar-extraction`).
- **On main?** No. `git show origin/main:CLAUDE.md | grep "Merge discipline"` → not found.
- **Text that landed** (exact, from `feat/sidecar-extraction`):

```
### Merge discipline — PRs from here forward

Feature branches reach `main` via PR, not direct merge. Once work is reviewed and pushed, open a PR on the feature branch.

**PR description structure:**
- **SIGNIFICANCE:** one or two sentences on what this commit means — what it unlocks or closes, not just what it does.
- **WHAT LANDED:** by phase or file group, brief — the changelog is the long-form record; the PR is the orientation.
- **HONEST RESIDUAL:** if the work is partial, name what's still ahead and link the tracking issue.

**Title convention:** if the work is partial, carry `(partial — ISSUE-XXX)` in the title so the partial state is visible at the PR-list level, not just in the description body.

Agents may draft PR descriptions from the changelog. The human reviews before opening the PR for merge.
```

Rule is operational, not a template. Matches intent.

---

## 5. Recent Main Activity (last 10 commits)

```
69016fe chore(meta): refresh CLAUDE.md canonical-state-layer status post-§9 pass
94921e3 Merge feat/state-layer into main — §9 verification pass + ISSUE-017
021e13c docs(known-issues): ISSUE-017 — silent enum-key coercion in safety/infra mapping re-opens umbrella anti-pattern
306d224 docs(state-layer): §9 verification pass — items 1,2 closed; 3 answered (validation gap); 4,5,6 logged as findings
eea45dd chore(wip): checkpoint in-flight CLAUDE.md, StopDetail.tsx, .mcp.json
9b5c127 fix(rls): set org context on start-stop path; harden core location RLS
a2f193d chore(meta): merge branch convention update — retire refactor/baseline, add workstream branch map
fdab7e5 chore(meta): retire refactor/baseline convention; document active branch map
28925e4 chore(docs): merge housekeeping branch — floating planning artifacts + S2 status
3e3f679 chore(docs): housekeeping — commit floating planning artifacts and S2 status update
```

Main's last 10 are entirely state-layer verification, docs housekeeping, and the RLS start-stop fix. No capability-build work is in main — that was a separate path (see anomaly below).

---

## 6. Open Anomalies

### A. `feature/capability_build` — 1 commit ahead of main with duplicate message
- Local and remote `feature/capability_build` both tip at `0beb544` "fix(rls): set org context on start-stop path; harden core location RLS".
- Main contains `9b5c127` with the **identical commit message**. These are two different commit SHAs with the same message — the work was incorporated into main via a separate commit (likely cherry-pick or re-commit on `feat/state-layer`) rather than by merging `feature/capability_build` directly.
- Result: `feature/capability_build` is permanently 1-ahead-10-behind and will never fast-forward cleanly. It is functionally a dead branch carrying a commit whose content is already in main under a different SHA.
- **Not in the active branch map.** No action taken — surface only.

### B. `origin/feat/state-layer` — stale remote, never closed
- `origin/feat/state-layer` tips at `eea45dd` (a WIP checkpoint commit that **is in main's history** — it was part of the merged set). The branch was merged into main but the remote was never deleted or fast-forwarded.
- Local `feat/state-layer` at `021e13c` is also 6 behind main and 0 ahead — it's already subsumed by main.
- Both local and remote `feat/state-layer` are safe to delete. Not doing so here.

### C. Three `claude/*` branches — stale agent worktrees
- `claude/busy-meninsky-3b8a5d`, `claude/nervous-aryabhata-1261e4`, `claude/stoic-goldwasser-a19c2f` all point to the **same commit** `f42f289` "pre-admin-panels-save".
- 228 commits behind main. Not on remote. These appear to be leftover Claude Code agent worktree branches from the pre-refactor era. Safe to delete.

### D. `emergency/snapshot-pre-rebuild` — local/remote diverged
- Local tip `108eb38` "Demo stabilization: admin/ops views, UL flow, route completion" is not on remote.
- Remote tip `89948a5` "EMERGENCY SNAPSHOT 2" is the last pushed state.
- The extra local commit is from 2025-12-18 (pre-refactor era). The branch is 235 commits behind main and has no active purpose. The local/remote divergence is an old anomaly.

### E. Old remote branches not in active branch map
- `origin/backend-refactor-match_assetUniverse` (pre-refactor, 2025-era)
- `origin/feature/admin-panels` (same commit as local `status` branch, pre-refactor)
- `origin/refactor/v2-core-visits` (2026-01-15, pre-refactor)
- None are ahead of main. None are being worked on. Candidates for remote deletion.

### F. `chore/*` branches fully merged, not yet deleted
- `chore/docs-housekeeping` and `chore/update-claude-md-conventions` are 0-ahead, 11-13 behind — both fully merged into main. Local branches not yet cleaned up.

---

## Summary for Sequencing

| Item | Status | Next action |
|------|--------|-------------|
| `feat/sidecar-extraction` → main | 2 commits ready, pushed to remote | Open PR, human reviews, merge |
| ISSUE-018 (app-wiring for `intelligence_reader`) | Tracked in KNOWN_ISSUES, no branch yet | Dispatch when sidecar PR merges |
| `feat/state-layer` / `origin/feat/state-layer` | Fully subsumed by main | Delete both |
| `feature/capability_build` | Dead (content in main under different SHA) | Delete local + remote |
| `claude/*` local branches (×3) | Stale agent worktrees, pre-refactor | Delete local |
| Old remote branches (×3) | Pre-refactor, no active purpose | Delete remote |
| `chore/*` local branches (×2) | Fully merged | Delete local |
| `emergency/snapshot-pre-rebuild` local/remote divergence | 2025-era, no active purpose | Investigate before deleting |
