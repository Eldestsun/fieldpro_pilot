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
| Refactor | `planning/REFACTOR_INDEX.md` → relevant `planning/TIER_N_*.md` | unrelated tiers, frontend files | code changes per tier done-criteria + changelog entry |
| Refinement | `planning/REFINEMENT_INDEX.md` → relevant `planning/REFINEMENT_R*.md` | unrelated items, refactor tiers | code changes per item done-criteria + changelog entry |
| Feature / Bug | `planning/REFACTOR_INDEX.md` + `planning/REFINEMENT_INDEX.md` (check both for in-flight work) → `frontend/CONTEXT.md` and/or `backend/CONTEXT.md` | unrelated workspaces | plan or code changes + changelog entry |
| Documentation | `docs/CONTEXT.md` | all others | doc update |
| Ops | `ops/CONTEXT.md` | all others | runbook or script + changelog entry |
| Testing | `backend/CONTEXT.md` or `frontend/CONTEXT.md` + relevant `TIER_N_*.md` done-criteria | planning docs | test plan or test code + changelog entry |

### Step 3 — Log It

Every task that changes code, schema, architecture docs, or configuration must produce a changelog entry at `docs/changelog/YYYY-MM-DD-{slug}.md` before the task is considered done.

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

- `planning/architecture/target_architecture.md` — always
- `planning/architecture/current_state.md` — always (marks broken state + must-not-regress list)
- `pg_state.sql` — DB-related tasks only. **Note: this file becomes stale after any schema-changing tier or migration. If the task involves tables added or dropped after 2026-05-08 (Tiers 4, 5, R10), regenerate it first:** `PGPASSWORD=fieldpro_pass pg_dump -h localhost -U fieldpro -d fieldpro_db --schema-only > pg_state.sql`

---

## Core Rules

- Do not skip required reads
- Read each workspace `CONTEXT.md` before acting in that workspace
- The DB is the source of truth — UI and API are adapters
- Assignments are intent only — they are not truth
- Do not reintroduce transit-first design patterns

## Labor Safety Guardrails (hard constraints)

- No GPS tracking dots or worker location displays
- No per-worker performance rankings or scores
- No punitive or comparative metrics
- No hidden scoring of individual workers
- No worker comparison surfaces of any kind

See `planning/architecture/target_architecture.md` §8 for the intelligence constraints that enforce these at the architecture level.

---

## Do Not Load

These files are not routing artifacts. Do not load them unless explicitly instructed:

- `docs/repo-tree.md` — stale tree snapshot
- `docs/BUILD_LOG.md` — build history log
- `docs/archive/` — superseded specs
