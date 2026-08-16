# Planning Workspace — Context

(Thinned 2026-08-15, HYG-3. The old version of this file carried its own routing table
and workspace map — both went stale and contradicted `CLAUDE.md` after the 2026-06-16
rules-index restructure. Routing now lives in ONE place: `CLAUDE.md § Task Routing`.
Active work selection lives in ONE place: the Notion BASELINE Work Tracker. This file
keeps only what is unique to it: how to write planning artifacts.)

---

## What This Workspace Is

Analysis, architecture alignment, spec creation, and coordination **before**
implementation. Planning is never the execution layer for code changes.

- `planning/architecture/` — system truth + constraints (authoritative design docs)
- `planning/specs/` — analysis artifacts, one problem per file
- `planning/capability-build/` — the active build track's index + specs
- Track indexes at `planning/` root (REFACTOR / REFINEMENT / SECURITY_SPRINT) are
  **closed historical records** — see their banners; do not pick work from them.

## Spec Rules

- One problem per file, stored in `planning/specs/`, named `YYYY-MM-DD-{slug}.md`.
- Keep scoped and actionable. Each spec includes:
  - **Problem**
  - **Current State**
  - **Desired State**
  - **Gap**
  - **Proposed Change**

## Boundaries

- Do not write code during Analysis — stop after the spec.
- Do not expand scope beyond the dispatched question.
- Do not restate build status in planning docs — status lives in
  `current_state.md`, the changelog, and the board. (Status prose in planning files
  is the primary way this workspace has gone stale.)
