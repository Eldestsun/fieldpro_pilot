# PR Draft — docs(claude-md): restructure CLAUDE.md into thin rules-index + router

- **Branch:** `chore/claude-md-restructure` → `main`
- **Open as:** Draft
- **Open at:** https://github.com/Eldestsun/fieldpro_pilot/pull/new/chore/claude-md-restructure
- **Note:** the GitHub PAT in this environment cannot create PRs (Resource not accessible by
  personal access token), so the founder opens this draft manually. The branch and commit
  (`62899d7`) are already pushed and verified on origin.

---

**SIGNIFICANCE:** CLAUDE.md is the one file every dispatch agent reads first. This converts it from a 313-line monolith into a 243-line thin rules-index + router — shorter and scannable — **without losing any enforcement power**. Every hard constraint remains stated completely in CLAUDE.md; only explanation/reference/how-to moved out to the context `.md` each rule governs. Also adds the new **Adapter→Core First** hard rule.

**WHAT LANDED:**
- **CLAUDE.md** restructured (313 → 243 lines). Classification principle: *rules stay (compressed); explanation moves out + one-line pointer.* No rule moved out.
- **New rule:** Adapter→Core First, adjacent to Phase Discipline (P1 = canonical completeness, not reader-repointing; drop adapter tables last).
- **Moved out (move, not delete):** changelog format template → `docs/CONTEXT.md`; browser/desktop lists → `docs/dev/agent-runtime-environment.md` (new); dev-bypass rationale → `docs/dev/dev-auth-bypass.md`; git branch-map + PR template + history → `docs/dev/git-pr-workflow.md` (new); MCP per-server detail → `docs/dev/mcp-tools.md` (new); CANON-NORM dated status → already owned by `current_state.md` + design-doc §9 (pointer left); PATTERN-001 bug list → already in `docs/KNOWN_ISSUES.md` (pointer left).
- **Kept verbatim (per founder sign-off):** all five Phase Discipline bullets, all five Labor Safety Guardrails, the routing tables, the redundant triple phase-order statement, the push-verification procedure.
- **Auditable before/after** for every compressed rule is in the changelog (`docs/changelog/refactor/2026-06-16-claude-md-restructure.md`) — scope is verifiably equivalent; no labor-safety or phase rule was narrowed or broadened.
- Phase-1 classification plan committed for the record: `docs/audit/2026-06-15-claude-md-restructure-plan.md`.

**Verification:** grepped the new CLAUDE.md for every hard-constraint keyword (phase order, BOARD BUG, Adapter→Core, withOrgContext, app.current_org_id, all 5 labor-safety bullets, desktop-only, `--no-ff`, verify-push/origin-main, no-cherry-pick, PR-not-direct-merge, normalized columns/never payload, Do Not Load) — all present. Confirmed each destination file holds its moved block.

**HONEST RESIDUAL:**
- The parent `Optimized_Life/CLAUDE.md` mirror (dispatch-governance, marked not-authoritative) was re-synced to match this section and its "Last synced" marker bumped to commit `62899d7`. That file is **live-on-disk and unversioned (outside this repo)** — the edit is intentionally NOT in this PR's diff.
- Draft PR — opened for human review before merge, per convention.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
