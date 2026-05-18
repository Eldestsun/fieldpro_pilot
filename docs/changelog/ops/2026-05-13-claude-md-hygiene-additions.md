# 2026-05-13 — CLAUDE.md hygiene additions

## What changed

Three process-improvement additions to `CLAUDE.md` based on issues observed in recent agent sessions.

### Addition 1 — Explicit path for PROJECT_CONTEXT.md (Step 4 Required Reads)
Added `PROJECT_CONTEXT.md` (repo root) as the first required read in Step 4, with a note that it is always required at session start alongside CLAUDE.md. Prior sessions failed to locate the file because it was not listed with an explicit path in the routing instructions.

### Addition 2 — Post-push verification step (Git Commit Convention)
Added step 6 to the Git Commit Convention:
- Run `git fetch origin` and `git log origin/refactor/baseline --oneline | head -3`
- The new commit must appear in the output before the task is marked complete
- If missing, STOP and report — do not retry without diagnosis

Motivation: a prior agent session (S1-10, cloud sandbox) completed all local work and committed, but the push returned HTTP 403 from the git proxy. The session marked the task done and terminated. The commit was lost when the ephemeral sandbox was destroyed. This step makes silent push failures observable before the session ends.

### Addition 3 — Environment Requirements section
New section after Labor Safety Guardrails. States that tasks requiring a commit + push MUST run in desktop Claude Code, not browser-based (ephemeral sandbox). Defines what browser Claude Code is and is not appropriate for. Instructs agents to stop and report rather than proceed if they detect they are in the wrong environment.

## Why
- S1-10 was silently lost when a cloud sandbox session pushed with HTTP 403 and terminated without recovery
- PROJECT_CONTEXT.md was not locatable by at least one agent session due to missing explicit path
- These additions close the process gaps that allowed silent work loss

## Files touched
- `CLAUDE.md`
- `docs/changelog/2026-05-13-claude-md-hygiene-additions.md` (this file)
