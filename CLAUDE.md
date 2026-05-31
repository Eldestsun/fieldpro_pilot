# BASELINE / FieldPro

BASELINE is a Field Operations Intelligence System.
It captures operational truth through field visits and derives intelligence from that truth.
It coexists with EAM/EAMS systems — it does not compete with or duplicate them.
Transit stop cleaning is the first vertical slice. It is not the platform center.

Field workers should not experience BASELINE as a form-filling system.
It captures truth as a byproduct of work, not as the work itself.

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

Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry before the task is considered done.

Place the file in the appropriate subdirectory:

| Category | Path |
|----------|------|
| Refactor (Tier N) | `docs/changelog/refactor/YYYY-MM-DD-{slug}.md` |
| Refinement (R-N) | `docs/changelog/refinement/YYYY-MM-DD-{slug}.md` |
| Security sprint (S-N) | `docs/changelog/security/YYYY-MM-DD-{slug}.md` |
| Bug fix | `docs/changelog/bugfix/YYYY-MM-DD-{slug}.md` |
| Ops / infra / deployment | `docs/changelog/ops/YYYY-MM-DD-{slug}.md` |
| Capability build (Tn-XX) | `docs/changelog/capability-build/YYYY-MM-DD-{slug}.md` |

Format:
```
# YYYY-MM-DD — {short description}

## What changed
- bullet list of changes

## Why
- one line per motivation

## Files touched
- list of files
```

Analysis-only tasks (no code or schema changes) do not require a changelog entry. Everything else does.

### Step 4 — Required Reads for Code/Data Tasks

- `PROJECT_CONTEXT.md` (repo root) — always, at session start alongside this file
- `planning/architecture/target_architecture.md` — always
- `planning/architecture/current_state.md` — always (marks broken state + must-not-regress list)
- `pg_state.sql` — DB-related tasks only. **Note: this file becomes stale after any schema-changing tier or migration. If the task involves tables added or dropped after 2026-05-08 (Tiers 4, 5, R10), regenerate it first:** `PGPASSWORD=fieldpro_pass pg_dump -h localhost -U fieldpro -d fieldpro_db --schema-only > pg_state.sql`
- `planning/architecture/ADAPTER_BOUNDARY.md` — required for any task touching `core.observations`, `core.visits`, `observationService.ts`, `visitService.ts`, or `riskMapService.ts`
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` — required for any task touching `core.observations`, `core.visits`, `core.assets`, `core.evidence`, `core.observation_type_registry`, the observation normalizer, or any intelligence/MV that reads observation condition. **STATUS: target design, pending §9 verification.** Conform new design to this doc; reconcile against the live schema before treating any DDL as ratified. Do not migrate against it yet.

---

## Core Rules

- Do not skip required reads
- Read each workspace `CONTEXT.md` before acting in that workspace
- The DB is the source of truth — UI and API are adapters
- Assignments are intent only — they are not truth
- Do not reintroduce transit-first design patterns
- **(Target rule, enforced once the canonical state layer is ratified)** Intelligence and dashboards read the normalized observation columns (`obs_kind` / `norm_status` / `norm_severity`), never observation `payload`. See `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` §3.3, §4.3.

### RLS Context Gotcha (recurring bug pattern)

Any query or write against a `FORCE ROW LEVEL SECURITY` table silently affects zero rows if `app.current_org_id` is not set on the connection. This has caused multiple bugs (ISSUE-005, ISSUE-012, ISSUE-013, ISSUE-014, role-rename backfill migration). See `docs/KNOWN_ISSUES.md § PATTERN-001` for the systemic trap.

**Hard rules:**
- App code that queries RLS tables must use `withOrgContext(pool, orgId, ...)` — never bare `pool.query()`
- Migrations and scripts that touch RLS tables must either set `app.current_org_id` explicitly or run as a superuser/bypassrls role
- Bugs that silently return empty results on RLS tables are almost always a missing org context, not a data problem

Affected tables include: `identity_directory`, and all 28+ tables with RLS policies. Check `pg_state.sql` or `\d+ <table>` for `Row Security: enabled (forced)` to confirm.

## Labor Safety Guardrails (hard constraints)

- No GPS tracking dots or worker location displays
- No per-worker performance rankings or scores
- No punitive or comparative metrics
- No hidden scoring of individual workers
- No worker comparison surfaces of any kind

See `planning/architecture/target_architecture.md` §8 for the intelligence constraints that enforce these at the architecture level, and `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` §3.2 for the structural mechanism (identity sidecar + no-grant intelligence role) that makes worker non-attribution a permission-layer guarantee rather than a code-review rule.

---

## Environment Requirements

Tasks that produce code, schema, configuration, or any artifact that must be committed and pushed MUST run in Claude Code on desktop, not in browser-based Claude Code.

Browser Claude Code runs in an ephemeral sandbox. When the session ends, the working directory and any local-only commits are destroyed. Any code-producing task run in the browser environment is at risk of silent loss if push fails or if the session ends before verification.

**Browser Claude Code is appropriate for:**
- Reading and analyzing code
- Planning and architecture discussion
- Drafting specs that will be committed in a later session
- Investigating bugs without changing code

**Browser Claude Code is NOT appropriate for:**
- Implementing tier or refinement or security sprint tasks
- Schema migrations
- Any task whose definition of done includes a commit + push

If a session is opened in the wrong environment, the agent should stop and report rather than proceed.

---

## Dev Auth Bypass — Intended Use

The dev bypass (`localStorage.__dev_user__` / `dev-bypass-token`) exists exclusively for headless agent sessions running remotely in terminal via tools like Prompt 3. It allows a coding agent to interact with the application without a real Entra account.

The founder uses real Azure Entra authentication (personal business tenant) with actual role assignments for all live browser testing. Do NOT suggest switching the founder to dev bypass when auth issues arise in the browser — the correct fix is always on the real MSAL/Entra path.

Two auth paths, two separate contexts:
- Agent in terminal → dev bypass
- Founder in browser → real Entra, v2.0 tokens, role-based

---

## Git Commit Convention

Every task that produces code, schema, or configuration changes must follow this branch pattern — no exceptions:

1. Make all changes on `refactor/baseline`
2. Commit on `refactor/baseline`
3. Merge `refactor/baseline` into `main`
4. Push `main` to `origin/main`
5. Push `refactor/baseline` to `origin/refactor/baseline` to keep remote in sync
6. Verify push success. Run:
   ```
   git fetch origin
   git log origin/refactor/baseline --oneline | head -3
   ```
   The new commit must appear in the output. If it does not, the push silently failed — STOP, do not mark the task complete, and report the discrepancy to the operator. Do not retry without diagnosis.

Do not commit directly to `main`. Do not cherry-pick. Do not leave `refactor/baseline` ahead of its remote after a merge.

---

## MCP Tools

Three MCP servers are configured in `.mcp.json` and auto-approved in `.claude/settings.json`. Use them in preference to bash equivalents where applicable.

### `postgres`
Direct structured access to `fieldpro_db` as the `postgres` superuser (bypasses RLS — appropriate for diagnostics and migrations, not for testing app-level access).

**Use for:** schema inspection, multi-step queries, DB debugging, verifying writes after API calls.
**Prefer over:** `psql` bash commands for anything beyond a one-liner.
**Connection:** `postgresql://postgres:postgres@localhost:5432/fieldpro_db`

### `chrome-devtools-mcp`
Attaches to a running Chrome tab via Chrome DevTools Protocol. Can inspect network requests, read console output, take screenshots, and interact with the page.

**Use for:** inspecting API request/response payloads and status codes from live browser sessions, reading console errors, verifying frontend state.
**Requires:** Chrome running with remote debugging enabled, or a tab already open at the target URL.
**Not a replacement for:** the user's own browser session — attach to the user's tab, don't open a new one unless asked.

### `github`
Full GitHub API access via `@modelcontextprotocol/server-github`.

**Use for:** creating PRs, reading/writing issues, checking CI status, reviewing PR comments, managing branches.
**Requires:** `GITHUB_PERSONAL_ACCESS_TOKEN` set in the shell environment before starting Claude Code.
**Prefer over:** `gh` CLI calls for multi-step GitHub workflows.

---

## Do Not Load

These files are not routing artifacts. Do not load them unless explicitly instructed:

- `docs/repo-tree.md` — stale tree snapshot
- `docs/BUILD_LOG.md` — build history log
- `docs/archive/` — superseded specs
