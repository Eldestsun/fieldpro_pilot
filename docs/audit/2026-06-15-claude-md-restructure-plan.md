# 2026-06-15 — CLAUDE.md Restructure Plan (PHASE 1 — PLAN ONLY)

> **Status: awaiting founder sign-off. NOTHING has been changed.** This document is
> the Phase 1 deliverable. No edit to `CLAUDE.md`, any context `.md`, the parent
> mirror, or any card has been made. Phase 2 executes only after approval.

## Goal restated

Convert `fieldpro_pilot/CLAUDE.md` from a monolith into a **thin rules-index + router**.
Rules stay (compressed); explanation / reference / how-to / examples move OUT to the
context `.md` they govern, leaving a one-line rule + pointer in CLAUDE.md. No
enforcement power is lost: every hard constraint remains stated completely in CLAUDE.md.

## The classification test applied

For every block: **"If an agent never reads the destination file, does a RULE stop being
enforced?"** YES → RULE → compress-and-keep in CLAUDE.md. NO → explanation/reference →
move out, leave a pointer. Ties break toward KEEP.

---

## 1. Section-by-section inventory of CURRENT CLAUDE.md (313 lines)

| # | Section | Lines | ~LoC | Classification |
|---|---------|-------|------|----------------|
| 1 | Header / identity intro | 1–11 | 9 | **MIXED** (1 embedded rule; rest is background → PROJECT_CONTEXT already owns it) |
| 2 | Task Routing — Step 1 Classify (table) | 13–26 | 12 | **RULE-KEEP** (router core) |
| 3 | Task Routing — Step 2 Route (table) | 28–40 | 13 | **RULE-KEEP** (router core — drives required reads) |
| 4 | Step 3 — Log It | 42–71 | 30 | **MIXED** (rule + path table keep; format template moves) |
| 5 | Step 4 — Required Reads | 73–80 | 8 | **MIXED** (read-list keeps; dated CANON status narrative moves/compresses) |
| 6 | Work Tracking — Notion Board (whole) | 84–167 | 84 | **RULE-KEEP, compress** (governance; mirrored as a unit — see note) |
| 7 | Core Rules (bullets) | 171–178 | 8 | **MIXED** (rules keep; dated status parenthetical on line 178 compresses) |
| 8 | RLS Context Gotcha (PATTERN-001) | 180–189 | 10 | **MIXED** (hard rules keep; bug-history prose trims to pointer) |
| 9 | Labor Safety Guardrails | 191–199 | 9 | **RULE-KEEP** (explicit hard constraint) |
| 10 | Environment Requirements | 203–220 | 18 | **MIXED** (rule keeps; appropriate/not-appropriate lists + why move) |
| 11 | Dev Auth Bypass | 224–232 | 9 | **MIXED** (1-line rule keeps; explanation moves) |
| 12 | Git Commit Convention | 236–275 | 40 | **MIXED** (commit/push-verify/PR rules keep; branch map, history, PR template move) |
| 13 | MCP Tools | 279–302 | 24 | **MIXED** (1-line "prefer MCP" rule + names keep; per-server detail moves) |
| 14 | Do Not Load | 306–313 | 8 | **RULE-KEEP** (never-list) |
| — | `---` separators | — | ~13 | structural |

**Note on #6 (Notion Board):** the parent `Optimized_Life/CLAUDE.md` *mirrors this
section as a unit*. Splitting its rules across multiple files would break the
mirror relationship and risk scattering the phase rule. Therefore this section is
**kept whole and compressed in place** (prose/why/consolidation-note trimmed), not
moved. Phase discipline, pick-protocol, pre-dispatch checklist, and the recurring
reconciliation all remain stated completely in CLAUDE.md.

---

## 2. MOVE-OUT and MIXED blocks — exact destination + replacement pointer

Each destination already exists unless marked **(new, named)**. No rule is moved.

### 4 — Step 3 "Log It" → format template moves
- **Moves:** the fenced changelog *format template* (lines 57–69, the ```` ``` ```` block).
- **Stays in CLAUDE.md:** the rule "every code/schema/arch/config change produces a
  changelog entry before done" + the Category→Path table (load-bearing: tells *where*) +
  "analysis-only tasks are exempt."
- **Destination:** `docs/CONTEXT.md` → new heading `## Changelog Entry Format`.
- **Pointer replacing the template:** `Format: see docs/CONTEXT.md § Changelog Entry Format.`

### 5 — Step 4 Required Reads → CANON-NORM status narrative compresses
- **Moves/compresses:** the long dated status prose inside line 80 (§9 items 1–6, what
  landed 2026-06-14, identity sidecar verification, item-5 unblocked).
- **Stays in CLAUDE.md:** the rule "read `CANONICAL_STATE_LAYER_DESIGN.md` for any task
  touching [the listed tables / normalizer / intelligence MVs]" + a 1-line status pointer.
- **Destination:** `planning/architecture/current_state.md` (the current-vs-target home),
  with `CANONICAL_STATE_LAYER_DESIGN.md §9` as the durable status owner it already is.
- **Pointer replacing the narrative:** `Status: normalized-shape build landed 2026-06-14;
  consult the doc's §9 for current-vs-target before migrating. (Detail: current_state.md.)`
- **⚠ FLAGGED in §5 below** — build-state-sensitive; founder picks compress-vs-keep.

### 6 — Notion Board → trim-in-place only (NO cross-file move)
- **Trims (prose only, stays in section):** the authority/why preamble (lines 86–96),
  the consolidation note re: commit 5dbba9f (93–96), and the "why" paragraph under Phase
  Discipline (135–138). These are justifications, not rules.
- **Stays complete:** board-field list, pick-protocol, pre-dispatch checklist, every
  Phase Discipline normative bullet, recurring reconciliation + mirror-sync rule.
- **Destination for trimmed prose:** the Phase-2 changelog entry records the consolidation
  history; the authority statement compresses to one line. No context-file move.

### 7 — Core Rules → line 178 status parenthetical compresses
- **Compresses:** the dated parenthetical "(Normalized columns LANDED 2026-06-14 … ISSUE-018)".
- **Stays:** the rule "intelligence/dashboards read normalized columns
  (`obs_kind`/`norm_status`/`norm_severity`), never observation `payload`" + the §3.3/§4.3 pointer.
- **Destination:** same as #5 (`current_state.md` / design-doc §9 own the dated status).

### 8 — RLS Context Gotcha → bug-history prose trims
- **Trims:** the "this has caused ISSUE-005/012/013/014/backfill" enumeration and the
  28+-tables sentence (explanation/examples).
- **Stays complete:** all three hard rules (`withOrgContext` not bare `pool.query`;
  migrations set `app.current_org_id` or run bypassrls; silent-empty = missing org context)
  + the existing `docs/KNOWN_ISSUES.md § PATTERN-001` pointer.
- **Destination:** `docs/KNOWN_ISSUES.md § PATTERN-001` already holds the systemic-trap
  detail (pointer already present) — confirm the bug list is there in Phase 2; no new file.

### 10 — Environment Requirements → enumerated lists + "why" move
- **Moves:** the "Browser appropriate for / NOT appropriate for" bullet lists and the
  ephemeral-sandbox "why" paragraph (elaborated instances of the one rule).
- **Stays in CLAUDE.md:** the rule "tasks producing code/schema/config/commits MUST run in
  desktop Claude Code, never the browser sandbox (ephemeral — silent-loss risk); if opened
  in the wrong environment, stop and report."
- **Destination:** `docs/dev/agent-runtime-environment.md` **(new, named)** →
  `## Desktop vs Browser Sandbox`.
- **Pointer:** `Detail / appropriate-uses: see docs/dev/agent-runtime-environment.md.`
- **⚠ mild FLAG (§5)** — could also stay (only 18 lines); founder may prefer keep-whole.

### 11 — Dev Auth Bypass → explanation moves to its existing home
- **Moves:** what the bypass is, the two-paths elaboration, the "founder uses real Entra"
  rationale.
- **Stays in CLAUDE.md:** the rule "dev bypass is for headless agent terminal sessions only;
  never switch the founder off real MSAL/Entra — the Entra path is always the fix in-browser."
- **Destination:** `docs/dev/dev-auth-bypass.md` (existing, 250 lines — the natural home) →
  new `## Intended Use — Agent (terminal) vs Founder (browser)`.
- **Pointer:** `Detail: docs/dev/dev-auth-bypass.md § Intended Use.`

### 12 — Git Commit Convention → reference + history + PR template move
- **Moves:** (a) the "`refactor/baseline` retired" history note (236–238); (b) the Active
  Branch Map table (240–247); (c) the PR-description template — SIGNIFICANCE / WHAT LANDED /
  HONEST RESIDUAL + title `(partial — ISSUE-XXX)` convention (268–275).
- **Stays in CLAUDE.md (hard rules — compressed):** work on the named branch; commit there;
  merge to `main` via `--no-ff`; **push then VERIFY (`git fetch` + `git log origin/main`
  must show the commit; if absent, STOP — silent push failure — do not mark done, report)**;
  never commit directly to `main`; never cherry-pick; **feature branches reach `main` via PR,
  human reviews before merge.**
- **Destination:** `docs/dev/git-pr-workflow.md` **(new, named)** → headings
  `## Active Branch Map`, `## PR Description Structure`, `## History — retired branches`.
- **Pointer:** `Branch map, PR-description template, history: see docs/dev/git-pr-workflow.md.`

### 13 — MCP Tools → per-server detail moves
- **Moves:** per-server Use-for / Prefer-over / Requires / Connection-string detail for
  `postgres`, `chrome-devtools-mcp`, `github`.
- **Stays in CLAUDE.md:** the rule "three MCP servers (`postgres`, `chrome-devtools-mcp`,
  `github`) are configured in `.mcp.json` and auto-approved; prefer them over bash
  equivalents."
- **Destination:** `docs/dev/mcp-tools.md` **(new, named)** → one heading per server.
- **Pointer:** `Per-server detail (connection, use-for): see docs/dev/mcp-tools.md.`

### 1 — Header → trim background, keep identity + embedded rule
- **Trims:** the "captures truth as a byproduct, not form-filling" philosophy (PROJECT_CONTEXT
  §"What Pitch-Ready Means" and §"What BASELINE Is" already own it).
- **Stays:** a 3-line identity orienting line + the embedded rule "does not compete with /
  duplicate EAMS; transit is a vertical slice, not the center" (this rule recurs as
  "no transit-first patterns" in Core Rules — kept there too).
- **Destination:** none needed (background already lives in `PROJECT_CONTEXT.md`).

---

## 3. RULE-KEEP compressions (the few-line replacements)

Rules whose *meaning is unchanged* — only prose tightened. (Full Phase-2 wording drafted
at execution; these are the shapes.)

- **Routing tables (Steps 1–2):** keep verbatim — already tight, and load-bearing.
- **Step 3 changelog rule:** "Every code/schema/arch/config change → a changelog entry
  (path per table below) before done; analysis-only exempt." + path table verbatim.
- **Phase Discipline:** keep all five normative bullets; drop the 4-line "why" preamble.
- **RLS / PATTERN-001:** keep the three hard-rule bullets; drop the bug enumeration.
- **Labor Safety:** keep all five bullets verbatim + the §8 / §3.2 pointer (already 1 line).
- **Environment:** "Code/schema/commit work → desktop Claude Code only, never browser
  sandbox (ephemeral; silent-loss risk). Wrong env → stop and report."
- **Git:** compressed numbered rule as in §2/#12 above (push-verify preserved verbatim —
  it is the anti-silent-failure constraint and is NOT compressed away).
- **Do Not Load:** keep verbatim.

---

## 4. NEW rule to ADD (compressed) — adjacent to Phase Discipline

Inserted as a new bullet/subsection beside Phase Discipline in the Notion Board section:

> **Adapter→Core First.** P1 = canonical complete + lossless + uncontaminated (a
> write/completeness property). "No surface reads the adapter" is **not** a P1 goal —
> readers are surface properties decided in Capability Build. Do not dispatch "repoint
> reader X" as P1 work; use readers only as a diagnostic for canonical-completeness gaps.
> Drop adapter tables last.

This is an *addition*, not a move; ~6 lines.

---

## 5. AMBIGUOUS / FLAGGED — founder decides (erring toward KEEP)

1. **Step 4 CANON-NORM status narrative (line 80) + Core Rules line 178 parenthetical.**
   These are *current build-state* facts agents may rely on without opening the design doc.
   Moving them compresses ~12 lines but trades away at-a-glance build-state awareness.
   **Recommendation:** compress to a 1-line status + pointer (detail already lives in
   `CANONICAL_STATE_LAYER_DESIGN.md §9`). **Decision needed:** compress, or keep verbatim?

2. **Environment Requirements lists (block #10).** Borderline — the appropriate/not lists
   are enumerated instances of one rule (movable) but are also short (18 lines total).
   **Recommendation:** move detail to `docs/dev/agent-runtime-environment.md`, keep the
   rule. **Decision needed:** move, or keep whole?

3. **Changelog format template (block #4).** It is a worked example (movable) but it is
   what keeps changelogs consistent across agents who won't open `docs/CONTEXT.md`.
   **Recommendation:** move (it is how-to), pointer stays. **Decision needed:** move, or
   keep the 11-line template inline?

4. **Notion Board redundancy.** Phase order is stated three times (pick-protocol #1,
   pre-dispatch #1, Phase Discipline bullet 1). Collapsing to one statement would shorten
   the section but risks altering a load-bearing, *mirrored* rule. **Recommendation: do NOT
   collapse** — keep the three statements, trim only surrounding prose. Flagging in case
   the founder wants the tighter single-statement form (would require re-syncing the mirror
   to match).

No block was found so entangled that compressing it risks changing a rule's meaning beyond
these four — but #4 is the one to treat most conservatively.

---

## 6. No-scatter confirmation

Each rule remains stated **completely in one file**:
- Every hard constraint stays **complete in CLAUDE.md** (router, changelog rule, phase
  discipline, Adapter→Core First, labor safety, PATTERN-001, environment rule, git/push-verify/PR
  rule, dev-bypass rule, MCP-prefer rule, Do-Not-Load).
- Each moved **explanation** lands **complete in exactly one destination**:
  - Changelog format → `docs/CONTEXT.md` only
  - Env runtime detail → `docs/dev/agent-runtime-environment.md` only
  - Dev-bypass explanation → `docs/dev/dev-auth-bypass.md` only
  - Git branch-map / PR-template / history → `docs/dev/git-pr-workflow.md` only
  - MCP per-server detail → `docs/dev/mcp-tools.md` only
  - CANON status → `current_state.md` / design-doc §9 (already its owner)
- The Notion Board governance is **not** split — it stays whole, preserving the parent-mirror
  relationship. No rule is divided such that no single file states it in full.

---

## Before / after line-count estimate

| | Lines |
|---|---|
| CLAUDE.md now | **313** |
| CLAUDE.md after (estimate) | **~180** (range 175–195 depending on the §5 flags) |
| Reduction | **~42%** |

Net moved out: ~95 lines of explanation/reference/how-to relocated (not deleted) into 3 new
named `docs/dev/` files + `docs/CONTEXT.md` + `current_state.md`. New content added: the
~6-line Adapter→Core First rule.

---

## Phase 2 (on approval) — execution checklist (not yet run)

1. Branch `chore/claude-md-restructure`.
2. Apply compressions + moves per §2–§4 above (honoring §5 decisions).
3. Land each moved block under its named destination heading — move, not rewrite.
4. Verify: grep new CLAUDE.md for each rule keyword (phase, changelog, withOrgContext,
   `--no-ff`, git fetch / origin/main, labor / worker, browser sandbox, Adapter→Core, cherry-pick,
   Do Not Load) — every hard constraint still present.
5. Verify: each destination file now contains its moved block.
6. Re-sync parent `Optimized_Life/CLAUDE.md` mirror to the new Notion Board wording; bump its
   "Last synced" marker (live-on-disk, unversioned — noted in PR).
7. Changelog entry (`docs/changelog/refactor/2026-06-15-claude-md-restructure.md`): what moved
   where, before/after line count, the principle (rules-stay-compressed / explanation-moves-out).
8. Draft PR (human opens). Note the unversioned parent-mirror edit in the PR body.

**STOP — awaiting founder review of this plan before any Phase 2 action.**
