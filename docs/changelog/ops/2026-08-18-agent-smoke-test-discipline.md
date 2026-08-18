# 2026-08-18 — CLAUDE.md: Agent Smoke-Test Discipline (hard rule)

## What changed
- `CLAUDE.md § Dev Auth Bypass` gains an **Agent Smoke-Test Discipline** subsection:
  smoke tests clean up their scaffolded data (or declare what they left); never
  "heal" existing data outside a dispatch; write smoke output to survive the
  founder's independent verification queries.

## Why
- Founder ruling after the AGENT-SMOKE-1 investigation: an unattributed agent
  session re-ran a flow at 2026-08-17 18:00Z and healed a data gap outside any
  dispatch, going undetected until the audit-log trace. Multiple agents now test
  against the shared dev DB (by design); without this rule their writes shadow
  each other's evidence.

## Files touched
- CLAUDE.md
- docs/changelog/ops/2026-08-18-agent-smoke-test-discipline.md (this file)
