# BASELINE / FieldPro

BASELINE is a Field Operations Intelligence System — a state layer that captures operational
truth through field visits and derives intelligence from it. It coexists with EAM/EAMS systems;
it does not compete with or duplicate them. Transit stop cleaning is the first vertical slice,
not the platform center. Field workers should not experience it as a form-filling system — it
captures truth as a byproduct of work, not as the work itself. (Full background: `PROJECT_CONTEXT.md`.)

> **This file is a thin rules-index + router.** Every hard constraint is stated completely
> here; explanation, reference, and how-to live in the context `.md` each rule governs, reached
> by the pointers below. If a rule and a pointer ever disagree, the rule here wins.

---

## Task Routing

### Step 1 — Classify

| Type | Examples |
|------|---------|
| Analysis | audit, gap assessment, spec creation |
| Architecture | domain model changes, layer redesign |
| Feature | new capability, new route, new UI surface |
| Refactor | align code to canonical model, remove transit-first patterns |
| Bug | broken behavior, regression |
| Documentation | changelog, guides, API docs |
| Ops | infra, deployment, scripts |
| Testing | test coverage, test strategy |

### Step 2 — Route

| Task | Required Reads | Skip | Output |
|------|---------------|------|--------|
| Analysis | `planning/CONTEXT.md` → architecture files | workspace CONTEXT.md files | spec in `planning/specs/` + changelog entry |
| Architecture | `planning/architecture/target_architecture.md` + `current_state.md` | specs, workspace files | updated architecture doc + changelog entry |
| Refactor | `planning/REFACTOR_INDEX.md` → relevant `planning/refactor/TIER_N_*.md` | unrelated tiers, frontend files | code changes per tier done-criteria + changelog entry |
| Refinement | `planning/REFINEMENT_INDEX.md` → relevant `planning/refinement/REFINEMENT_R*.md` | unrelated items, refactor tiers | code changes per item done-criteria + changelog entry |
| Security hardening | `planning/REFINEMENT_INDEX.md` + `planning/REFACTOR_INDEX.md` → `planning/security/SECURITY_SPRINT_INDEX.md` → relevant sprint file | unrelated tracks | code/docs per sprint done-criteria + changelog entry |
| Feature / Bug | `planning/REFACTOR_INDEX.md` + `planning/REFINEMENT_INDEX.md` (check both for in-flight work) → `frontend/CONTEXT.md` and/or `backend/CONTEXT.md` | unrelated workspaces | plan or code changes + changelog entry |
| Documentation | `docs/CONTEXT.md` | all others | doc update |
| Ops | `ops/CONTEXT.md` | all others | runbook or script + changelog entry |
| Testing | `backend/CONTEXT.md` or `frontend/CONTEXT.md` + relevant `TIER_N_*.md` done-criteria | planning docs | test plan or test code + changelog entry |

### Step 3 — Log It

Every task that changes code, schema, architecture docs, or configuration must produce a
changelog entry before the task is considered done. Analysis-only tasks (no code or schema
changes) are exempt; everything else is not.

Place the file in the appropriate subdirectory:

| Category | Path |
|----------|------|
| Refactor (Tier N) | `docs/changelog/refactor/YYYY-MM-DD-{slug}.md` |
| Refinement (R-N) | `docs/changelog/refinement/YYYY-MM-DD-{slug}.md` |
| Security sprint (S-N) | `docs/changelog/security/YYYY-MM-DD-{slug}.md` |
| Bug fix | `docs/changelog/bugfix/YYYY-MM-DD-{slug}.md` |
| Ops / infra / deployment | `docs/changelog/ops/YYYY-MM-DD-{slug}.md` |
| Capability build (Tn-XX) | `docs/changelog/capability-build/YYYY-MM-DD-{slug}.md` |

Entry format: see `docs/CONTEXT.md § Changelog Entry Format`.

### Step 4 — Required Reads for Code/Data Tasks

- `PROJECT_CONTEXT.md` (repo root) — always, at session start alongside this file
- `planning/architecture/target_architecture.md` — always
- `planning/architecture/current_state.md` — always (marks broken state + must-not-regress list)
- `pg_state.sql` — DB-related tasks only. **This file becomes stale after any schema-changing tier or migration.** If the task involves tables added or dropped after 2026-05-08 (Tiers 4, 5, R10), regenerate it first: `PGPASSWORD=fieldpro_pass pg_dump -h localhost -U fieldpro -d fieldpro_db --schema-only > pg_state.sql`
- `planning/architecture/ADAPTER_BOUNDARY.md` — required for any task touching `core.observations`, `core.visits`, `observationService.ts`, `visitService.ts`, or `riskMapService.ts`
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` — required for any task touching `core.observations`, `core.visits`, `core.assets`, `core.evidence`, `core.observation_type_registry`, the observation normalizer, or any intelligence/MV that reads observation condition. The four-kind taxonomy and no-manufactured-state rules are enforced in code; conform new work to this doc. Consult its §9 for current-vs-target on a given guarantee before migrating against it. (Build-state status — what landed when — lives in `current_state.md` and the design-doc §9, not here.)

---

## Work Tracking — Notion Board

This section is the **single, authoritative source of truth** for BASELINE product governance:
the board pick-protocol, the phase-discipline rule, and the pre-dispatch checklist. The parent
`Optimized_Life/CLAUDE.md` mirrors it (marked not-authoritative) and must **not** carry a second
copy — the versioned file here always wins, and git catches any drift.

### The board

Task selection and dispatch run off the **BASELINE Work Tracker** in Notion. It is
the source of truth for what to work next. Each card carries:

- **Phase** — P1, P2, P3 … (the phase gate; lower phases clear first)
- **Status** — Backlog, Ready, In Progress, Done (Backlog / Ready / In Progress = **open**)
- **Depends On** — the cards this card depends on
- **Owner** — `Agent-Dispatchable` (agent work) or `Founder-Infra` (human only)
- **Issue ID** — the tracking ID (e.g. ISSUE-XXX)
- **Source File** — the spec / planning file to read before implementing

### Pick-protocol — choosing the next card

1. **Walk in phase order.** P1 before P2 before P3. Never pick a higher-phase card
   while a lower-phase card is open.
2. **Among eligible cards, pick Ready / unblocked cards** whose `Depends On`
   dependencies are all satisfied (Done).
3. **Only `Owner = Agent-Dispatchable` cards are agent work.** `Founder-Infra` cards
   (e.g. F-1 Entra Dispatch role) are NOT agent-dispatchable — skip them.

### Pre-dispatch checklist (required before starting any card)

1. **If this card is P2+, confirm NO open P1 card exists.** (Open = Backlog, Ready,
   or In Progress.) If one does, stop — P1 comes first.
2. **Read the card's `Depends On` and check the phase of every dependency.** Every
   referenced dependency must be the SAME phase or lower. If any dependency is a
   HIGHER phase, this is a **BOARD BUG**: report it, do not follow it, and do **not**
   start the higher-phase work to "unblock" it. The dependency edge itself is wrong
   and must be severed.
3. **Read the card's Source File before implementing.**

### Phase Discipline (hard rule)

These are hard rules, not judgment calls — a violation is a process defect. They exist because
P1 cards have repeatedly been given dependencies on P2 work, which inverts the phase gate and
makes P1 appear blocked on P2.

- **Phase order is absolute.** Never begin a P2+ card while any P1 card is open
  (Backlog, Ready, or In Progress). P1 work clears before P2 work starts.
- **Dependencies point downhill only.** A P1 card may depend only on P1-or-lower
  work. If you find a P1 card whose `Depends On` references P2+ work, that is a
  **BOARD BUG**: report it and do not follow it. Do **not** start the P2 work to
  "unblock" the P1 card — the dependency itself is wrong and must be severed.
- **Check the phase before following any edge.** Before following ANY `Depends On`
  edge, check the phase of the dependency. If it is a higher phase than the card
  you are working, stop and report.
- **Two phase-correct changes beat one bundled change.** When P1 work and P2 work
  touch the same file or surface, prefer two separate phase-correct changes over
  one bundled change. Touching a file twice is cheap; inverting the phase gate is
  expensive. Never bundle a P1 read/write change into a P2 relocation/rebuild to
  "do it once."
- **F-1 and T1-CC are P2, always.** F-1 (Entra Dispatch role) and all T1-CC work
  are P2. They are never on the P1 critical path.

### Adapter→Core First (hard rule)

P1 = canonical complete + lossless + uncontaminated (a write/completeness property). "No
surface reads the adapter" is **not** a P1 goal — readers are surface properties decided in
Capability Build. Don't dispatch "repoint reader X" as P1 work; use readers only as a diagnostic
for canonical-completeness gaps. Drop adapter tables last.

### Recurring task — P1 dependency reconciliation

At each session boundary, or before any new-phase dispatch: audit every P1 card's
`Depends On`. Sever or report any edge pointing at a higher phase. Confirm the P1
critical path is self-contained. Drift recurs when work spreads across tabs and
sessions; this is the catch.

Re-sync the parent `Optimized_Life/CLAUDE.md` mirror: diff it against this
authoritative section. If they differ, update the parent mirror to match this file
and bump its "Last synced" marker. The versioned file is always the source; the
mirror follows.

---

## Core Rules

- Do not skip required reads
- Read each workspace `CONTEXT.md` before acting in that workspace
- The DB is the source of truth — UI and API are adapters
- Assignments are intent only — they are not truth
- Do not reintroduce transit-first design patterns
- Intelligence and dashboards read the normalized observation columns (`obs_kind` / `norm_status` / `norm_severity`), never observation `payload`. See `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` §3.3, §4.3. (Status: normalized columns landed in schema 2026-06-14; identity-isolation app-wiring is the one remaining target-state piece, tracked as ISSUE-018. Detail: `current_state.md`.)

### Migration Recording Discipline (hard rule — ISSUE-038)

Never apply a migration out-of-band (e.g. direct `psql`, including the superuser runs that
FORCE-RLS DML requires) without recording it in `public.schema_migrations` in the **same
step**. An applied-but-unrecorded migration is invisible drift: the runner
(`backend/src/scripts/migrate.ts`) will try to re-run it on the next deploy and either
collide on non-idempotent DDL or, worse, silently corrupt data (re-running the
`stop_status_mv` redefine as the non-bypassrls app role re-materializes it to **0 rows**).
This exact habit — applying the 11 ISSUE-031 canon migrations via `psql` without recording
them — created ISSUE-038 and broke the fresh-environment deploy gate.

This rule covers **GRANTs and role provisioning, not just DDL** (ISSUE-039). A privilege
applied out-of-band (e.g. `GRANT SELECT … TO mcp_readonly` via direct `psql`) is the same
invisible drift one layer down: it lives only in the hand-mutated DB, the consolidated
baseline reproduces none of it, and a fresh build ends in a different — and for the
labor-safety grant wall, *unprovable* — posture. The out-of-band `mcp_readonly` grants
created ISSUE-039 and were the second clean-build blocker. Grant posture is a
version-controlled, runner-owned, idempotent migration like any other schema change.

- If you must hand-apply, `INSERT INTO public.schema_migrations (filename) VALUES (...)` in
  the same transaction/session.
- Migrations that touch already-existing objects must be idempotent (`IF NOT EXISTS` /
  `IF EXISTS` / `CREATE OR REPLACE`) and must not assume an apply order other than the
  runner's lexical filename sort.
- The deploy gate is a clean-room rebuild: empty DB → `npm run migrate` → exit 0 → schema
  matches a known-good dump. Run it before claiming a migration change is deploy-ready.

### RLS Context Gotcha (recurring bug pattern)

Any query or write against a `FORCE ROW LEVEL SECURITY` table silently affects zero rows if `app.current_org_id` is not set on the connection. This has caused multiple bugs; see `docs/KNOWN_ISSUES.md § PATTERN-001` for the instances (ISSUE-005, 012, 013, 014, the role-rename backfill migration) and the systemic trap.

**Hard rules:**
- App code that queries RLS tables must use `withOrgContext(pool, orgId, ...)` — never bare `pool.query()`
- Migrations and scripts that touch RLS tables must either set `app.current_org_id` explicitly or run as a superuser/bypassrls role
- Bugs that silently return empty results on RLS tables are almost always a missing org context, not a data problem

Affected tables include `identity_directory` and all 28+ tables with RLS policies. Check `pg_state.sql` or `\d+ <table>` for `Row Security: enabled (forced)` to confirm.

## Labor Safety Guardrails (hard constraints)

- No GPS tracking dots or worker location displays
- No per-worker performance rankings or scores
- No punitive or comparative metrics
- No hidden scoring of individual workers
- No worker comparison surfaces of any kind

See `planning/architecture/target_architecture.md` §8 for the intelligence constraints that enforce these at the architecture level, and `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` §3.2 for the structural mechanism (identity sidecar + no-grant intelligence role) that makes worker non-attribution a permission-layer guarantee rather than a code-review rule.

---

## Environment Requirements

Tasks that produce code, schema, configuration, or any artifact that must be committed and
pushed MUST run in Claude Code on desktop, not browser-based Claude Code. The browser sandbox
is ephemeral — when the session ends, the working directory and any local-only commits are
destroyed, so code-producing work risks silent loss if push fails or the session ends before
verification. If a session is opened in the wrong environment, stop and report rather than proceed.

Which work is appropriate for the browser vs desktop: see `docs/dev/agent-runtime-environment.md`.

---

## Dev Auth Bypass

The dev bypass (`localStorage.__dev_user__` / `dev-bypass-token`) is for headless agent terminal
sessions only — it lets a coding agent interact with the app without a real Entra account. Do NOT
suggest switching the founder to dev bypass when browser auth issues arise: the founder uses real
Azure Entra, and the correct fix is always on the real MSAL/Entra path. Rationale and the
two-context detail: see `docs/dev/dev-auth-bypass.md § Intended Use`.

---

## Git Commit Convention

All work runs on typed, named branches that correspond to active workstreams (`feat/*`,
`design/*`, `chore/*`). The active branch map, the PR-description structure, and retired-branch
history live in `docs/dev/git-pr-workflow.md`.

1. Work on the appropriate named branch for the workstream; commit there.
2. Merge into `main` via `--no-ff`.
3. Push `main` to `origin/main`.
4. **Verify push success:** run `git fetch origin`, then `git log origin/main --oneline | head -3`. The new commit MUST appear. If it does not, the push silently failed — STOP, do not mark the task complete, report the discrepancy to the operator, and do not retry without diagnosis.

Do not commit directly to `main`. Do not cherry-pick. When a workstream branch is complete, it is closed — do not reopen it.

Feature branches reach `main` via PR, not direct merge. Agents may draft PR descriptions from the changelog; the human reviews before opening the PR for merge. PR-description structure and the `(partial — ISSUE-XXX)` title convention: see `docs/dev/git-pr-workflow.md`.

---

## MCP Tools

Three MCP servers — `postgres`, `chrome-devtools-mcp`, and `github` — are configured in
`.mcp.json` and auto-approved in `.claude/settings.json`. Prefer them over bash equivalents
(`psql`, `gh`) where applicable. Per-server detail (connection string, what each is for, when
to prefer it): see `docs/dev/mcp-tools.md`.

---

## Do Not Load

These files are not routing artifacts. Do not load them unless explicitly instructed:

- `docs/repo-tree.md` — stale tree snapshot
- `docs/BUILD_LOG.md` — build history log
- `docs/archive/` — superseded specs
