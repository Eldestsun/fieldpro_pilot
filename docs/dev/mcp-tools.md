# MCP Tools — Per-Server Reference

> Reference detail for the three MCP servers configured in `.mcp.json` and auto-approved
> in `.claude/settings.json`. The governing rule ("three servers configured + auto-approved;
> prefer them over bash equivalents") lives in `CLAUDE.md § MCP Tools`. This file holds the
> per-server usage detail moved out of CLAUDE.md during the 2026-06-16 rules-index restructure.

## `postgres`

Direct structured access to `fieldpro_db` as the `postgres` superuser (bypasses RLS —
appropriate for diagnostics and migrations, not for testing app-level access).

- **Use for:** schema inspection, multi-step queries, DB debugging, verifying writes after API calls.
- **Prefer over:** `psql` bash commands for anything beyond a one-liner.
- **Connection:** `postgresql://postgres:postgres@localhost:5432/fieldpro_db`

## `chrome-devtools-mcp`

Attaches to a running Chrome tab via Chrome DevTools Protocol. Can inspect network requests,
read console output, take screenshots, and interact with the page.

- **Use for:** inspecting API request/response payloads and status codes from live browser
  sessions, reading console errors, verifying frontend state.
- **Requires:** Chrome running with remote debugging enabled, or a tab already open at the target URL.
- **Not a replacement for:** the user's own browser session — attach to the user's tab, don't
  open a new one unless asked.

## `github`

Full GitHub API access via `@modelcontextprotocol/server-github`.

- **Use for:** creating PRs, reading/writing issues, checking CI status, reviewing PR comments,
  managing branches.
- **Requires:** `GITHUB_PERSONAL_ACCESS_TOKEN` set in the shell environment before starting Claude Code.
- **Prefer over:** `gh` CLI calls for multi-step GitHub workflows.
