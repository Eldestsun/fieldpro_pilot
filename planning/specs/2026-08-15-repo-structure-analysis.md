# Analysis — Repo & Working-Structure Audit (2026-08-15)

> Status: ANALYSIS ARTIFACT — findings R1–R11, executed via board cards HYG-1/2/3.
> Author-dispatch: founder-directed full audit of the repo tree, CLAUDE.md, and the
> working file structure, ahead of the full-bore Capability Build push.
> Execution ruling (founder, 2026-08-15): HYG-1 and HYG-2 execute straight through as
> reviewable PRs; HYG-3 (CONTEXT.md thinning) is drafted by agent but founder rules on
> the diff before merge.

## Problem

Governance documents that were accurate when written were never retired or re-synced
once the work moved past them. Nothing is structurally broken; several things quietly
lie to every session that reads them. With Capability Build about to consume all
attention, stale mandatory reads become a per-session tax.

## Current State — what is working (verified, keep)

1. **Thin rules-index CLAUDE.md** (2026-06-16 restructure): every hard rule needed in
   recent sessions (phase discipline, RLS gotcha, push-verify, migration recording)
   fully stated in-file. "Rule beats pointer" resolves drift in advance.
2. **Mirror discipline works**: diffed CLAUDE.md `62899d7..HEAD` — three commits since
   the parent-mirror sync, none touched the governed Work Tracking section. The parent
   `Optimized_Life/CLAUDE.md` mirror is still in sync.
3. **Changelog discipline is real**: 201 categorized entries, dense enough to
   reconstruct any subsystem's history.
4. **Dispatch format** (Phase-0 recon → stop → ruling → Phase 1, paste-back
   verification, explicit out-of-scope) converts ~50%-reliability agent work into
   ~100%-reliability outcomes.
5. **Test/tripwire architecture**: `backend/tests/canonical/` (182 passing) encodes
   governance as executable, red-PR-enforceable checks.
6. **.gitignore hygiene**: verified exhaustively 2026-08 (CRED-ENVLOCAL recon) — no
   secrets tracked or in history beyond one localhost-shaped placeholder.

## Gap — findings by severity

### Tier 1 — costs every session

- **R1** Task router has no Capability Build row — the one active track
  (`CAPABILITY_BUILD_INDEX.md` + 9 specs exist but are unrouted; agents fall into the
  generic Feature row).
- **R2** All five workspace `CONTEXT.md` files frozen at 2026-05-08: backend module map
  omits 7 directories and calls `core.evidence` unwritten; frontend/backend still use
  pre-rename role names; `planning/CONTEXT.md` routes via dead paths
  (`/planning/TIER_N_*.md`, `/planning/decisions`) and contradicts CLAUDE.md;
  `docs/CONTEXT.md` maps `/api` and `/guides` (neither exists) and omits the eight
  dirs that do; `ops/CONTEXT.md` is vestigial.
- **R3** Issue tracking forked three ways: `KNOWN_ISSUES.md` (authoritative,
  2026-06-23), `OPEN_ISSUES_OVERVIEW.md` (stale 2026-06-05 snapshot), Notion board.
  Issues run to ISSUE-062; the snapshot describes June.

### Tier 2 — hygiene debt

- **R4** Root clutter, some tracked: `baseline_pre_asset_refactor.fieldpro_db` (444K
  binary dump), two 2026-06-11 audit reports (belong in `docs/audit/`),
  `Pilot_And_Scale_Strategy.md` (belongs in `planning/commercial/`), root
  `package.json` + stray npm lockfile in a pnpm repo, un-inventoried `Scripts/` (12M).
- **R5** 17 changelog files at `docs/changelog/` root predating the category-dir
  convention (2026-05-25 → 06-14 era).
- **R6** Closed-track indexes (REFACTOR / REFINEMENT / SECURITY_SPRINT) read as live;
  SECURITY_SPRINT_INDEX (2026-05-18) predates `planning/security/` files through
  2026-07-06.
- **R7** `planning/specs/2026-07-11-transit-stops-deKCM.md` untracked since July;
  specs/ mixes three naming conventions; stray `docs/archive/repo-tree copy.md`.
- **R8** Pointer rot in CLAUDE.md: Do-Not-Load names `docs/repo-tree.md` (absent);
  Security row pointed at `planning/security/SECURITY_SPRINT_INDEX.md` (index is at
  `planning/` root).

### Tier 3 — worth deciding, not urgent

- **R9** `planning/CONTEXT.md` role should shrink formally (CLAUDE.md absorbed
  routing); keep only the spec template or delete.
- **R10** `pg_state.sql` rule hardcodes a now-stale date ("after 2026-05-08");
  simplify to "always regenerate before DB tasks."
- **R11** Point-in-time reports land in five places; consolidate on
  `docs/audit/YYYY-MM-DD-*`.

## Proposed Change (as executed)

- **HYG-1** (this PR): R1 router row; R3 snapshot retired to pointer stub; R6 banners
  on the three closed indexes; R7 commit the July spec; R8 pointer fixes; this
  analysis committed as the board cards' Source File.
- **HYG-2**: R4 + R5 file moves (`git mv` / untrack), one PR, diffstat-verifiable.
- **HYG-3** (founder-gated): R2 + R9 CONTEXT.md thinning to invariants + pointers —
  drafted on branch, founder rules on the diff before merge.
- **Deferred**: R10, R11 — no card yet; revisit after HYG-3.

Board cards: HYG-1 / HYG-2 / HYG-3 on the BASELINE Work Tracker, Phase
`Parallel-Docs`, Workstream `Docs Hygiene`.
