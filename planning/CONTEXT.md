# Planning Orchestrator

This file is the control layer for task execution.
It tells the agent what to read, what to skip, and what to produce.

Planning is used for:
- analysis
- architecture alignment
- spec creation
- coordination before implementation

Planning is NOT the final execution layer for code changes.

---

## Active Work

Two parallel tracks are in progress. Check both before speccing or building anything.

**Refactor track** — canonical-model migration (DB-level, backend write paths):
Read `planning/REFACTOR_INDEX.md` for tier status. Do not design around tables a pending tier is about to change.

**Refinement track** — product-level improvements (UX, auth, offline UX, UI rebuild, CI):
Read `planning/REFINEMENT_INDEX.md` for item status. Do not build UI surfaces that R5 is about to replace.

---

## Workspace Map

- `/planning/REFACTOR_INDEX.md` → canonical-model migration (Tiers 1–6, tier status + ordering)
- `/planning/TIER_N_*.md` → per-tier handoff files (files to touch, done-criteria, agent launch blocks)
- `/planning/REFINEMENT_INDEX.md` → product refinement track (R1–R10, item status + ordering)
- `/planning/REFINEMENT_R*.md` → per-item handoff files
- `/planning/architecture` → system truth + constraints
- `/planning/specs` → analysis artifacts (one problem per file)
- `/planning/decisions` → architectural decisions

---

## Task Routing Table

| Task | Read These | Skip These | Output |
|------|-----------|-----------|--------|
| Analysis | architecture files + relevant state | implementation rules | spec in `/planning/specs` |
| Refactor | `REFACTOR_INDEX.md` → relevant `TIER_N_*.md` | unrelated tiers | code changes per tier done-criteria |
| Refinement | `REFINEMENT_INDEX.md` → relevant `REFINEMENT_R*.md` | unrelated items | code changes per item done-criteria |
| Feature / Bug | `REFACTOR_INDEX.md` + `REFINEMENT_INDEX.md` → architecture + state | unrelated specs | plan OR handoff to code workspace |
| Architecture | architecture files | specs + implementation | updated architecture docs |

---

## Workflow Pipelines

### Analysis Pipeline

1. Read architecture + constraints
2. Read relevant state (pg_state, repo_state, BE/FE behavior)
3. Identify gap
4. Write spec
5. Stop

---

### Implementation Coordination Pipeline

1. Read architecture + constraints
2. Read relevant state
3. Determine execution surface:
   - `frontend/CONTEXT.md`
   - `backend/CONTEXT.md`
   - or both
4. Produce:
   - Plan OR
   - Handoff instructions for code workspace
5. Define verification requirements

---

### Architecture Pipeline

1. Modify architecture files
2. Validate against constraints
3. Keep minimal and precise

---

## Spec Rules

- One problem per file
- Store in `/planning/specs/`
- Keep scoped and actionable

Each spec must include:
- Problem
- Current State
- Desired State
- Gap
- Proposed Change

---

## Boundaries

- Do not write code during Analysis
- Do not skip required reads
- Do not expand scope
- Do not execute code changes in planning when task is clearly frontend/backend scoped

---

## Stop Conditions

- Analysis → stop after spec
- Implementation → stop after plan/handoff + verification