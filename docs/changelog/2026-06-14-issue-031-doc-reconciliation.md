# 2026-06-14 — ISSUE-031 documentation reconciliation (repo docs ↔ merged state)

## What changed
Reconciled the repo's planning/architecture/index docs against ISSUE-031 work that is
now merged to `main` (verified against git history and the live `fieldpro_db`). No code
or schema was changed by this task; only documentation and the `pg_state.sql` snapshot.

- **`planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`** — STATUS header changed from
  "PARTIALLY VERIFIED / items 4,5 deferred" to "VERIFIED — normalized-shape build landed
  2026-06-14." §9 item 4 marked **LANDED** (CANON-NORM Steps 1–6, in-place migration);
  item 5 (`complexity_score`/ISSUE-008 recompute) marked **UNBLOCKED but not yet executed**;
  the §9 2026-05-30 reconciliation table got a superseding note (normalized columns + `type_id`
  FK + §4.1 registry shape now live; sidecars deployed 2026-06-01). Item 6 left as DB-level
  resolved with app-wiring still tracked as ISSUE-018.
- **`CLAUDE.md`** (project) — Step-4 required-reads status line and the Core-Rules note on
  normalized columns updated: normalized columns are live (not target-state); identity
  isolation is DB-level structural with app-wiring still ISSUE-018.
- **`planning/architecture/current_state.md`** — canonical model described as substantially
  implemented (normalized shape landed); remaining deltas are tracked open issues.
- **`planning/architecture/target_architecture.md`** — §8 intelligence-positioning status
  changed from "target design, pending §9 verification" to normalized-shape ratified /
  identity boundary app-wiring = ISSUE-018.
- **`docs/KNOWN_ISSUES.md`** — ISSUE-008 annotated **UNBLOCKED (still open)**; ISSUE-031
  status + sub-items updated: Q-A/B (steps 1–2), Q-D, Q-G marked **EXECUTED/merged**; both
  prior gates (DQ-1..DQ-5 decisions; migration-sequence artifact) marked **CLEARED**.
- **`docs/audit/2026-06-14-normalized-shape-build-status.md`** — prepended a **SUPERSEDED**
  banner (its "NOT STARTED" finding was correct at ~01:51 but the build merged later that day).
- **`docs/OPEN_ISSUES_OVERVIEW.md`** — added a 2026-06-14 reconciliation note.
- **`pg_state.sql`** — regenerated from the live dev DB (was stale: 0 → 109 canonical-state
  markers). Now reflects the 5 normalized columns, `core.v_observation_normalized`, the
  extended registry, the four `*_actor_audit` sidecars, the dead-view evictions, and the
  Q-G `mcp_readonly` grant state (verified identical to live-DB ground truth: no sidecar /
  no `identity_directory` grants). **Note:** `pg_state.sql` is gitignored (`.gitignore:39`),
  so this is a **local-only refresh** — it is not part of the commit. Re-run
  `PGPASSWORD=fieldpro_pass pg_dump -h localhost -U fieldpro -d fieldpro_db --schema-only > pg_state.sql`
  to refresh it in any other working copy.

## Why
- The Notion board (built off repo audits/planning/indexing) had advanced past the repo docs;
  several authoritative docs still described merged work as "deferred / target-state / not
  started," which inverts current-vs-target for anyone reading them before a task.
- Guardrail discipline: claims were written only where verified against git + the live DB.
  Notably **not** over-claimed — ISSUE-008/`complexity_score` is recorded as *unblocked, not
  done* (it is P3-Intelligence, still open), and ISSUE-018 identity app-wiring remains open.

## Files touched
- planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md
- planning/architecture/current_state.md
- planning/architecture/target_architecture.md
- CLAUDE.md
- docs/KNOWN_ISSUES.md
- docs/audit/2026-06-14-normalized-shape-build-status.md
- docs/OPEN_ISSUES_OVERVIEW.md
- pg_state.sql

## Not done (deliberately, out of scope / not yet true)
- ISSUE-008 `complexity_score` recompute — unblocked, not executed.
- ISSUE-018 intelligence_reader app-connection wiring — still open.
- CC-repoint (`feat/issue-031-p1-cc-repoint`) and ISSUE-025 — pushed, pending founder PR/merge.
