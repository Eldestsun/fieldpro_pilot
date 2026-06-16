# Agent Runtime Environment — Desktop vs Browser Sandbox

> The governing rule ("tasks producing code / schema / config / commits MUST run in desktop
> Claude Code, never the browser sandbox; if opened in the wrong environment, stop and
> report") lives in `CLAUDE.md § Environment Requirements`. This file holds the elaboration
> moved out of CLAUDE.md during the 2026-06-16 rules-index restructure: why, and the
> appropriate / not-appropriate breakdown.

## Why this matters

Browser Claude Code runs in an ephemeral sandbox. When the session ends, the working
directory and any local-only commits are destroyed. Any code-producing task run in the
browser environment is at risk of silent loss if push fails or if the session ends before
verification.

## Browser Claude Code IS appropriate for

- Reading and analyzing code
- Planning and architecture discussion
- Drafting specs that will be committed in a later session
- Investigating bugs without changing code

## Browser Claude Code is NOT appropriate for

- Implementing tier or refinement or security sprint tasks
- Schema migrations
- Any task whose definition of done includes a commit + push

If a session is opened in the wrong environment, the agent should stop and report rather
than proceed.
