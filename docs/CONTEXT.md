# Documentation Workspace — Context

This workspace holds durable written artifacts. (Map corrected 2026-08-15, HYG-3 —
the old version listed `/api` and `/guides`, which never existed, and omitted the
directories that do.)

## Map (real)

- `/changelog` — the change record, **categorized**: `refactor/`, `refinement/`,
  `security/`, `bugfix/`, `ops/`, `capability-build/`, `data/`. No entries at the
  changelog root. Entry rule + category table: `CLAUDE.md § Task Routing — Step 3`.
- `/audit` — point-in-time audit and verification reports (`YYYY-MM-DD-{slug}.md`).
  New point-in-time reports go here, not the repo root.
- `/security` — security policy docs and audit outputs (S2 policy set, axe audits).
- `/dev` — developer how-tos referenced from CLAUDE.md (git/PR workflow, dev auth
  bypass, MCP tools, agent runtime environments).
- `/ops` — operational runbooks (deploys, grant posture).
- `/archive` — superseded material. Do-Not-Load per CLAUDE.md.
- `KNOWN_ISSUES.md` — authoritative issue detail + standing patterns. Dispatch state
  lives on the Notion board, not here.

## Rules

- Document behavior that actually exists; do not invent future behavior unless
  clearly marked as planned.
- Update docs when user-facing or API behavior changes.
- Dated reports are immutable history — correct them with a newer dated report, not
  by editing the old one.

## Changelog Entry Format

```
# YYYY-MM-DD — {short description}

## What changed
- bullet list of changes

## Why
- one line per motivation

## Files touched
- list of files
```
