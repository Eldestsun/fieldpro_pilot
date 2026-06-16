# Documentation

This workspace for durable written artifacts.

## Subfolders
- /api — technical endpoint and integration documentation
- /guides — internal or user-facing guides
- /changelog — meaningful project changes over time

## Rules
- Document behavior that actually exists
- Update docs when user-facing or API behavior changes
- Keep docs aligned with the live codebase and planning artifacts
- Do not invent future behavior unless clearly marked as planned

## Changelog Entry Format

> The *rule* (every code/schema/arch/config change produces a changelog entry before the
> task is done; analysis-only tasks are exempt) and the Category→Path table live in
> `CLAUDE.md § Task Routing — Step 3`. This template is the format those entries follow;
> it was moved out of CLAUDE.md during the 2026-06-16 rules-index restructure.

```
# YYYY-MM-DD — {short description}

## What changed
- bullet list of changes

## Why
- one line per motivation

## Files touched
- list of files
```