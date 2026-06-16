# 2026-06-16 — CLAUDE.md restructured into a thin rules-index + router

## What changed

Converted `fieldpro_pilot/CLAUDE.md` from a monolith (313 lines) into a thin rules-index +
router (243 lines, ~22% shorter). **Classification principle:** rules stay (compressed) in
CLAUDE.md — the only file guaranteed to be read; explanation / reference / how-to / examples
move OUT to the context `.md` each rule governs, leaving a one-line rule + pointer. No hard
constraint was moved out; every rule remains stated completely in CLAUDE.md.

Per founder sign-off on the Phase 1 plan, the four flagged calls were resolved as: (1) CANON-NORM
build-state narrative MOVED OUT entirely (status rots, isn't a rule); (2) Environment lists MOVED,
rule kept as a one-liner; (3) changelog SPLIT — rule kept, format template moved; (4) the
redundant triple phase-order statement KEPT verbatim, not collapsed.

### New rule added (Adapter→Core First)
Added a new hard-rule subsection adjacent to Phase Discipline in the Notion Board section:
> P1 = canonical complete + lossless + uncontaminated (a write/completeness property). "No
> surface reads the adapter" is not a P1 goal — readers are surface properties decided in
> Capability Build. Don't dispatch "repoint reader X" as P1 work; use readers only as a
> diagnostic for canonical-completeness gaps. Drop adapter tables last.

### Content moved OUT (move, not delete — words survive, relocated)
| Moved block | From CLAUDE.md § | To |
|---|---|---|
| Changelog format template | Step 3 — Log It | `docs/CONTEXT.md § Changelog Entry Format` |
| CANON-NORM dated build-state narrative | Step 4 / Core Rules line 178 | already owned by `current_state.md` line 11 + `CANONICAL_STATE_LAYER_DESIGN.md §9` (pointer left) |
| Browser-vs-desktop appropriate/not lists + ephemeral why | Environment Requirements | `docs/dev/agent-runtime-environment.md` (new) |
| Dev-bypass rationale + two-context detail | Dev Auth Bypass | `docs/dev/dev-auth-bypass.md § Intended Use` |
| Active branch map, PR-description template, retired-branch history | Git Commit Convention | `docs/dev/git-pr-workflow.md` (new) |
| Per-server MCP detail (postgres/chrome/github) | MCP Tools | `docs/dev/mcp-tools.md` (new) |
| PATTERN-001 bug enumeration | RLS Context Gotcha | already in `docs/KNOWN_ISSUES.md § PATTERN-001` (pointer left) |

### Rules KEPT but COMPRESSED — before/after (meaning-preservation audit)
For each, scope is verifiably equivalent; only prose was tightened. Labor-safety and phase
rules were NOT compressed (kept verbatim) per the sign-off constraint.

**Step 3 changelog rule**
- Before: "Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry before the task is considered done." + (later) "Analysis-only tasks (no code or schema changes) do not require a changelog entry. Everything else does."
- After: "Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry before the task is considered done. Analysis-only tasks (no code or schema changes) are exempt; everything else is not."
- Scope check: identical trigger set (code/schema/arch-docs/config), identical timing (before done), identical exemption (analysis-only). Category→Path table kept verbatim.

**Step 4 — CANONICAL_STATE_LAYER_DESIGN read trigger**
- Before: trigger list + a ~10-line dated status narrative (§9 items 1–6, landed dates, identity sidecar, item-5 unblocked) + "Conform new work… consult §9 for current-vs-target."
- After: same trigger list + "The four-kind taxonomy and no-manufactured-state rules are enforced in code; conform new work to this doc. Consult its §9 for current-vs-target… (Build-state status lives in `current_state.md` and design-doc §9, not here.)"
- Scope check: the read trigger (which tables/services require the doc) is unchanged; the "conform + consult §9" rule is unchanged; the enforced-in-code clause is retained. Only the dated status prose moved (it is reference, not a rule, and already lives in its owners). `pg_state.sql` staleness rule + regen command kept verbatim.

**Core Rules — normalized columns**
- Before: "**(Normalized columns LANDED 2026-06-14 … tracked as ISSUE-018.)** Intelligence and dashboards read the normalized observation columns (`obs_kind`/`norm_status`/`norm_severity`), never observation `payload`. See … §3.3, §4.3."
- After: "Intelligence and dashboards read the normalized observation columns (`obs_kind`/`norm_status`/`norm_severity`), never observation `payload`. See … §3.3, §4.3. (Status: normalized columns landed in schema 2026-06-14; identity-isolation app-wiring … tracked as ISSUE-018. Detail: `current_state.md`.)"
- Scope check: the rule ("read normalized columns, never `payload`") is byte-identical in substance; the dated status was relegated to a trailing parenthetical + pointer, not removed.

**RLS Context Gotcha (PATTERN-001)**
- Before: trap sentence + "This has caused multiple bugs (ISSUE-005, 012, 013, 014, role-rename backfill). See … PATTERN-001 …" + three hard-rule bullets + affected-tables sentence.
- After: trap sentence + "This has caused multiple bugs; see … PATTERN-001 for the instances (ISSUE-005, 012, 013, 014, the role-rename backfill migration) and the systemic trap." + the same three hard-rule bullets (verbatim) + affected-tables sentence (verbatim).
- Scope check: all three hard rules verbatim; the instance list is retained inline (not lost), just framed as a pointer to the fuller KNOWN_ISSUES record.

**Environment Requirements**
- Before: rule + "why" paragraph + two enumerated lists (appropriate / NOT appropriate) + stop-and-report line.
- After: "Tasks that produce code, schema, configuration, or any artifact that must be committed and pushed MUST run in Claude Code on desktop, not browser-based Claude Code. The browser sandbox is ephemeral … risks silent loss … If a session is opened in the wrong environment, stop and report rather than proceed." + pointer to the moved lists.
- Scope check: the MUST (code/schema/config/commit → desktop, never browser), the silent-loss rationale, and the stop-and-report rule are all retained. Only the enumerated instances moved.

**Dev Auth Bypass**
- Before: 9 lines (what it is, who it's for, do-NOT-switch-founder, two paths).
- After: "The dev bypass … is for headless agent terminal sessions only … Do NOT suggest switching the founder to dev bypass … the correct fix is always on the real MSAL/Entra path." + pointer.
- Scope check: both rules preserved (bypass = agent-terminal-only; never switch founder, fix is real Entra path). Background moved.

**Git Commit Convention**
- Before: ~40 lines (history note, branch-map table, numbered convention with fenced verify block, no-direct-commit/no-cherry-pick, PR section with description template + title convention).
- After: named-branch rule + 4 numbered steps (commit on branch → `--no-ff` merge → push → **verify push** with `git fetch origin` + `git log origin/main --oneline | head -3`, MUST appear, else STOP/don't-mark-done/report/don't-retry-without-diagnosis) + no-direct-commit + no-cherry-pick + branch-closed + PR-not-direct-merge + human-reviews-before-merge. Branch map / PR template / history pointed to `docs/dev/git-pr-workflow.md`.
- Scope check: every hard rule retained, including the push-verification procedure verbatim in substance (the anti-silent-failure constraint). Only the branch-map table, PR-description template, and retired-branch history (all reference) moved.

**MCP Tools**
- Before: "prefer over bash" rule + three per-server detail blocks.
- After: "Three MCP servers — `postgres`, `chrome-devtools-mcp`, `github` — are configured in `.mcp.json` and auto-approved … Prefer them over bash equivalents (`psql`, `gh`) …" + pointer.
- Scope check: the rule (3 named servers, configured + auto-approved, prefer over bash) preserved; per-server reference moved.

### Kept VERBATIM (no compression)
- Task Routing Step 1 (classify table) and Step 2 (route table) — the router core.
- All five Labor Safety Guardrail bullets + the §8 / §3.2 pointer.
- All five Phase Discipline bullets + the redundant phase-order statements in pick-protocol #1 and pre-dispatch #1 (kept per founder call #4).
- Do Not Load list.

### Mirror re-sync
Re-synced the parent `Optimized_Life/CLAUDE.md` "Work Tracking — Notion Board (MIRROR)" section
to match the new versioned section (trimmed pre-dispatch/Phase-Discipline prose, added the
Adapter→Core First subsection) and bumped its "Last synced" marker. The parent file is
live-on-disk and unversioned (outside this repo) — the edit does not appear in this PR's diff.

## Why
- CLAUDE.md is the one file every dispatch agent reads first; a shorter, scannable rules-index
  improves enforcement by making the rules findable, while explanation lives where it's used.
- Status that rots (dated build-state) does not belong in the always-loaded instruction file.
- Reference/how-to (MCP detail, PR template, env lists) is needed only in context, not on every read.

## Files touched
- `CLAUDE.md` (restructured: 313 → 243 lines)
- `docs/CONTEXT.md` (added § Changelog Entry Format)
- `docs/dev/dev-auth-bypass.md` (added § Intended Use — Agent vs Founder)
- `docs/dev/mcp-tools.md` (new)
- `docs/dev/git-pr-workflow.md` (new)
- `docs/dev/agent-runtime-environment.md` (new)
- `docs/changelog/refactor/2026-06-16-claude-md-restructure.md` (this entry)
- `docs/audit/2026-06-15-claude-md-restructure-plan.md` (Phase 1 plan, committed for the record)
- `Optimized_Life/CLAUDE.md` mirror — re-synced (unversioned, outside repo; not in this diff)
